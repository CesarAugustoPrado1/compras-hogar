import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CATEGORIES } from "./categories";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

const ExtractedTicket = z.object({
  storeName: z
    .string()
    .nullable()
    .describe("Uno de los supermercados conocidos, escrito exactamente igual; null si no es ninguno"),
  storePrinted: z.string().nullable().describe("Nombre del comercio tal como figura en el ticket"),
  purchasedAt: z
    .string()
    .nullable()
    .describe("Fecha y hora de la compra, formato YYYY-MM-DDTHH:mm, hora local"),
  total: z.number().nullable().describe("Total final pagado"),
  paymentMethod: z.string().nullable().describe("Medio de pago, ej. 'Débito Visa', 'Efectivo'"),
  items: z.array(
    z.object({
      kind: z.enum(["producto", "descuento", "otro"]),
      rawText: z.string().describe("Descripción exactamente como está impresa"),
      ean: z.string().nullable().describe("Código de barras EAN/GTIN si está impreso; si no, null"),
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
        .nullable()
        .describe("Nombre genérico normalizado, ej. 'Queso rallado'; null si no es un producto"),
      brand: z.string().nullable(),
      presentation: z.string().nullable().describe("Contenido del envase, ej. '150 g', '1 l'"),
      category: z.enum(CATEGORIES).nullable(),
    }),
  ),
  notes: z
    .string()
    .nullable()
    .describe("Partes ilegibles, dudas o inconsistencias que una persona debería revisar"),
});

export type ExtractedTicket = z.infer<typeof ExtractedTicket>;

const SYSTEM = `Leés fotos de tickets de supermercados de Argentina y devolvés su contenido estructurado.

- Un ticket largo puede venir en varias fotos, en orden y posiblemente superpuestas: cada renglón del ticket debe aparecer una sola vez.
- Los importes en el ticket usan formato argentino (1.234,56); devolvelos como números (1234.56).
- Transcribí rawText tal como está impreso, con abreviaturas y todo. Es la clave con la que después reconocemos el producto.
- Si el ticket imprime el código de barras (EAN-13 u otro GTIN, normalmente 8 a 14 dígitos) junto al producto, ponelo en ean. No inventes códigos.
- Productos pesados (fiambres, carne, verdura): quantity en kg, unit "kg", unitPrice por kg.
- Promociones y descuentos: si el ticket muestra el descuento en un renglón propio, devolvelo como item kind "descuento" con lineTotal negativo, inmediatamente después del producto al que corresponde.
- productName, brand, presentation y category son tu mejor interpretación del producto (expandí abreviaturas: "QSO RALL LS 150G" → Queso rallado, La Serenísima, 150 g). Si no estás seguro, dejá null en vez de adivinar.
- Lo que no se lea o no cierre (por ejemplo, la suma de renglones no coincide con el total) va en notes.`;

let client: Anthropic | undefined;

export async function extractTicket(
  images: { data: Buffer; mediaType: "image/jpeg" | "image/png" | "image/webp" }[],
  knownStores: string[],
): Promise<ExtractedTicket> {
  client ??= new Anthropic();
  // Streaming: con tickets largos la respuesta puede tardar, y el SDK lo exige para este max_tokens.
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ExtractedTicket) },
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
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    throw new Error("El modelo no pudo procesar las fotos.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new Error("La lectura del ticket quedó incompleta.");
  }
  return response.parsed_output;
}
