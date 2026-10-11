// Contenido neto de un envase y precio por kilo o litro.

export type Content = { amount: number; unit: "kg" | "l" }; // contenido por unidad, en kg o l

const UNITS: Record<string, { unit: "kg" | "l"; factor: number }> = {
  g: { unit: "kg", factor: 0.001 },
  gr: { unit: "kg", factor: 0.001 },
  grs: { unit: "kg", factor: 0.001 },
  gramo: { unit: "kg", factor: 0.001 },
  gramos: { unit: "kg", factor: 0.001 },
  kg: { unit: "kg", factor: 1 },
  kgs: { unit: "kg", factor: 1 },
  kilo: { unit: "kg", factor: 1 },
  kilos: { unit: "kg", factor: 1 },
  ml: { unit: "l", factor: 0.001 },
  cc: { unit: "l", factor: 0.001 },
  cm3: { unit: "l", factor: 0.001 },
  cl: { unit: "l", factor: 0.01 },
  l: { unit: "l", factor: 1 },
  lt: { unit: "l", factor: 1 },
  lts: { unit: "l", factor: 1 },
  litro: { unit: "l", factor: 1 },
  litros: { unit: "l", factor: 1 },
};

const num = (s: string) => Number(s.replace(",", "."));
const UNIT_RE = "(?:kgs?|kilos?|grs?|gramos?|g|ml|cc|cm3|cl|lts?|litros?|l)";

// "150 g", "1,5 L", "500gr", "pack x 6 de 500 ml", "6 x 1.5 l", "x 3 u de 1 kg" → contenido por unidad comprada.
export function parseContent(text: string | null | undefined): Content | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/\s+/g, " ");
  const m = t.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_RE.slice(3, -1)})\\b`));
  if (!m) return null;
  const unit = UNITS[m[2]];
  const value = num(m[1]);
  if (!unit || !(value > 0)) return null;

  // Multipack: "pack x 6 ...", "x 3 un de ...", "Pack 12 latas ...", "6 x 1.5 l". Un número
  // seguido de una unidad de medida es el contenido, no la cantidad de unidades.
  const pack =
    t.match(new RegExp(`(?:pack|x)\\s*(?:x\\s*)?(\\d+)\\b(?!\\s*[.,]?\\d*\\s*${UNIT_RE}\\b)`)) ??
    t.match(/\b(\d+)\s*(?:u|un|unidades)?\s*x\s*\d/);
  const count = pack ? Number(pack[1]) : 1;
  return { amount: value * unit.factor * (count > 0 && count < 100 ? count : 1), unit: unit.unit };
}

// Precio por kg o l de un renglón. Si se vendió por peso/volumen, es el precio unitario;
// si es un envase, se divide por su contenido. Si no se puede, se usa el impreso en el ticket.
export function refPrice(item: {
  quantity: number;
  unit: "u" | "kg" | "l";
  unitPrice: number | null;
  lineTotal: number | null;
  presentation: string | null;
  printedRefPrice?: number | null;
}): { price: number; unit: "kg" | "l"; content: Content | null; fromTicket: boolean } | null {
  const perUnit = item.unitPrice ?? (item.lineTotal !== null && item.quantity > 0 ? item.lineTotal / item.quantity : null);
  if (item.unit !== "u") {
    return perUnit === null ? null : { price: round(perUnit), unit: item.unit, content: null, fromTicket: false };
  }
  const content = parseContent(item.presentation);
  if (content && perUnit !== null) return { price: round(perUnit / content.amount), unit: content.unit, content, fromTicket: false };
  if (item.printedRefPrice) return { price: round(item.printedRefPrice), unit: content?.unit ?? "kg", content, fromTicket: true };
  return null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export const formatRefUnit = (unit: "kg" | "l") => (unit === "kg" ? "kg" : "litro");
