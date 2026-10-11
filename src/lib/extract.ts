import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { costUsd, type TokenUsage } from "./ai-pricing";
import { CATEGORIES } from "./categories";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

// La API admite como máximo 16 campos opcionales (nullable) por esquema, así que los
// textos opcionales vienen como "" cuando no hay dato y se pasan a null en cleanTicket().
const RawTicket = z.object({
  storeName: z
    .string()
    .describe('Uno de los supermercados conocidos, escrito exactamente igual; "" si no es ninguno'),
  storePrinted: z.string().describe('Nombre del comercio tal como figura en el ticket; "" si no se lee'),
  branch: z.string().describe('Sucursal o dirección del local, ej. "Gorriti 1069"; "" si no figura'),
  ticketNumber: z
    .string()
    .describe('Punto de venta y número del comprobante, ej. "01098-00033941"; "" si no figura'),
  purchasedAt: z
    .string()
    .describe('Fecha y hora de la compra, formato YYYY-MM-DDTHH:mm, hora local; "" si no figura'),
  total: z.number().nullable().describe("Total final pagado"),
  paymentMethod: z.string().describe('Medio de pago, ej. "Débito Visa", "Efectivo"; "" si no figura'),
  items: z.array(
    z.object({
      kind: z.enum(["producto", "descuento", "otro"]),
      rawText: z.string().describe("Descripción exactamente como está impresa"),
      ean: z
        .string()
        .describe('Código de barras EAN/GTIN (8, 12, 13 o 14 dígitos) si está impreso; si no, ""'),
      storeCode: z
        .string()
        .describe('Código interno del supermercado (PLU), ej. "4600"; si no hay, ""'),
      quantity: z.number().describe("Unidades, o kilos/litros si se vende por peso/volumen"),
      unit: z.enum(["u", "kg", "l"]),
      unitPrice: z.number().nullable(),
      discount: z
        .number()
        .nullable()
        .describe("Descuento aplicado a este renglón, como número positivo"),
      lineTotal: z
        .number()
        .nullable()
        .describe("Importe del renglón; negativo si es un descuento"),
      productName: z
        .string()
        .describe('Nombre genérico normalizado, ej. "Queso rallado"; "" si no es un producto'),
      brand: z.string().describe('Marca; "" si no se sabe'),
      presentation: z.string().describe('Contenido del envase, ej. "150 g", "1 l"; "" si no se sabe'),
      category: z.enum(CATEGORIES).nullable(),
    }),
  ),
  notes: z
    .string()
    .describe('Partes ilegibles, dudas o inconsistencias que una persona debería revisar; "" si no hay'),
});

const orNull = (v: string) => v.trim() || null;

function cleanTicket(raw: z.infer<typeof RawTicket>) {
  return {
    ...raw,
    storeName: orNull(raw.storeName),
    storePrinted: orNull(raw.storePrinted),
    branch: orNull(raw.branch),
    ticketNumber: orNull(raw.ticketNumber),
    purchasedAt: orNull(raw.purchasedAt),
    paymentMethod: orNull(raw.paymentMethod),
    notes: orNull(raw.notes),
    items: raw.items.map((item) => ({
      ...item,
      ean: orNull(item.ean),
      storeCode: orNull(item.storeCode),
      productName: orNull(item.productName),
      brand: orNull(item.brand),
      presentation: orNull(item.presentation),
    })),
  };
}

export type ExtractedTicket = ReturnType<typeof cleanTicket>;

const SYSTEM = `Leés fotos de tickets de supermercados de Argentina y devolvés su contenido estructurado.

- Un ticket largo puede venir en varias fotos, en orden y posiblemente superpuestas: cada renglón del ticket debe aparecer una sola vez.
- Los importes en el ticket usan formato argentino (1.234,56); devolvelos como números (1234.56).
- Transcribí rawText tal como está impreso, con abreviaturas y todo. Es la clave con la que después reconocemos el producto.
- Códigos: si junto al producto figura un código de barras EAN/GTIN (8, 12, 13 o 14 dígitos, en Argentina suelen empezar con 779), va en ean. Los códigos cortos o internos del súper (ej. "4600") van en storeCode, nunca en ean. No inventes códigos.
- Muchos tickets imprimen cada producto en dos líneas: arriba "cantidad x precio unitario" y abajo código, descripción, alícuota de IVA entre paréntesis (ej. "(21.0)") e importe. Es un solo renglón; la alícuota no es parte de la descripción.
- Productos pesados (fiambres, quesos al corte, carne, verdura): quantity en kg (ej. 0.645), unit "kg", unitPrice por kg.
- Promociones y descuentos: si el ticket muestra el descuento en un renglón propio, devolvelo como item kind "descuento" con lineTotal negativo, inmediatamente después del producto al que corresponde.
- No son renglones: subtotales, el pago (efectivo, tarjeta), el vuelto, el redondeo, ni los impuestos informados (IVA contenido, etc.). total es el TOTAL impreso.
- Las fechas suelen venir como DD-MM-AA (09-10-26 es 9 de octubre de 2026).
- productName, brand, presentation y category son tu mejor interpretación del producto (expandí abreviaturas: "QSO RALL LS 150G" → Queso rallado, La Serenísima, 150 g). Si no estás seguro, dejalos vacíos ("") en vez de adivinar.
- Lo que no se lea o no cierre (por ejemplo, la suma de renglones no coincide con el total) va en notes.`;

let client: Anthropic | undefined;

// Tokens por modelo. Si hubo fallback, cada modelo que corrió figura en usage.iterations.
function usageByModel(message: Anthropic.Beta.BetaMessage): TokenUsage[] {
  const u = message.usage;
  const iterations = u.iterations ?? [];
  if (iterations.length) {
    return iterations.map((it) => ({
      model: ("model" in it && it.model) || message.model,
      inputTokens: it.input_tokens,
      outputTokens: it.output_tokens,
      cacheWriteTokens: it.cache_creation_input_tokens ?? 0,
      cacheReadTokens: it.cache_read_input_tokens ?? 0,
    }));
  }
  return [
    {
      model: message.model,
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
    },
  ];
}

// Registra el consumo de cada llamada, salga bien o mal. Nunca hace fallar la lectura.
async function recordUsage(
  context: { ticketId: number; userId: number },
  started: number,
  message: Anthropic.Beta.BetaMessage | null,
  error: string | null,
) {
  try {
    const rows = message
      ? usageByModel(message)
      : [{ model: MODEL, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 }];
    await db.insert(aiUsage).values(
      rows.map((usage) => ({
        purpose: "lectura_ticket",
        ticketId: context.ticketId,
        userId: context.userId,
        ...usage,
        costUsd: costUsd(usage),
        ok: !error,
        error,
        durationMs: Date.now() - started,
      })),
    );
  } catch (e) {
    console.error("No se pudo registrar el consumo de IA", e);
  }
}

export async function extractTicket(
  images: { data: Buffer; mediaType: "image/jpeg" | "image/png" | "image/webp" }[],
  knownStores: string[],
  context: { ticketId: number; userId: number },
): Promise<ExtractedTicket> {
  const started = Date.now();
  let response: Awaited<ReturnType<typeof requestExtraction>> | null = null;
  try {
    response = await requestExtraction(images, knownStores);
  } catch (error) {
    // Error antes de tener respuesta (ej. pedido inválido): no se cobra, pero queda registrado.
    await recordUsage(context, started, null, error instanceof Error ? error.message : String(error));
    throw error;
  }

  const problem =
    response.stop_reason === "refusal"
      ? "El modelo no pudo procesar las fotos."
      : response.stop_reason === "max_tokens" || !response.parsed_output
        ? "La lectura del ticket quedó incompleta."
        : null;
  await recordUsage(context, started, response, problem);
  if (problem) throw new Error(problem);
  return cleanTicket(response.parsed_output!);
}

async function requestExtraction(
  images: { data: Buffer; mediaType: "image/jpeg" | "image/png" | "image/webp" }[],
  knownStores: string[],
) {
  client ??= new Anthropic();
  // Streaming: con tickets largos la respuesta puede tardar, y el SDK lo exige para este max_tokens.
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(RawTicket) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: img.mediaType,
              data: img.data.toString("base64"),
            },
          })),
          {
            type: "text",
            text: `Supermercados conocidos: ${knownStores.join(", ")}.\n\nExtraé el ticket de ${
              images.length === 1 ? "esta foto" : `estas ${images.length} fotos`
            }.`,
          },
        ],
      },
    ],
  });
  return stream.finalMessage();
}
