// La app vive en Argentina (UTC-3, sin horario de verano).
const TZ_OFFSET = "-03:00";
export const TIME_ZONE = "America/Argentina/Buenos_Aires";

// "2026-10-04T21:15" (hora local) → Date
export function fromLocalInput(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00${TZ_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Date → "2026-10-04T21:15" (hora local), para <input type="datetime-local">
export function toLocalInput(date: Date | null): string {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return parts.replace(" ", "T");
}

export function formatDate(date: Date | null): string {
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
}
