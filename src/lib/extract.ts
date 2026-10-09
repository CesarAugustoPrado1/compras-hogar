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
  branch: z.string().nullable().describe("Sucursal o dirección del local, ej. 'Gorriti 1069'"),
  ticketNumber: z
    .string()
    .nullable()
    .describe("Punto de venta y número del comprobante, ej. '01098-00033941'"),
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
      ean: z
        .string()
        .nullable()
        .describe("Código de barras EAN/GTIN (8, 12, 13 o 14 dígitos) si está impreso; si no, null"),
      storeCode: z
        .string()
        .nullable()
        .describe("Código interno del supermercado (PLU), ej. '4600'; si no hay, null"),
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
- Códigos: si junto al producto figura un código de barras EAN/GTIN (8, 12, 13 o 14 dígitos, en Argentina suelen empezar con 779), va en ean. Los códigos cortos o internos del súper (ej. "4600") van en storeCode, nunca en ean. No inventes códigos.
- Muchos tickets imprimen cada producto en dos líneas: arriba "cantidad x precio unitario" y abajo código, descripción, alícuota de IVA entre paréntesis (ej. "(21.0)") e importe. Es un solo renglón; la alícuota no es parte de la descripción.
- Productos pesados (fiambres, quesos al corte, carne, verdura): quantity en kg (ej. 0.645), unit "kg", unitPrice por kg.
- Promociones y descuentos: si el ticket muestra el descuento en un renglón propio, devolvelo como item kind "descuento" con lineTotal negativo, inmediatamente después del producto al que corresponde.
- No son renglones: subtotales, el pago (efectivo, tarjeta), el vuelto, el redondeo, ni los impuestos informados (IVA contenido, etc.). total es el TOTAL impreso.
- Las fechas suelen venir como DD-MM-AA (09-10-26 es 9 de octubre de 2026).
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
