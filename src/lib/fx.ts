import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { exchangeRates } from "@/db/schema";
import { TIME_ZONE } from "./dates";

// Dólar tarjeta (oficial + impuestos): lo que cuesta en pesos un gasto en USD con tarjeta.
const SOURCE = process.env.FX_URL ?? "https://dolarapi.com/v1/dolares/tarjeta";

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE }).format(new Date());

// Cotización del día; se consulta una vez por día y se guarda. Si falla, devuelve null
// (el gasto queda en dólares y no se frena nada).
export async function usdArsToday(): Promise<number | null> {
  const date = today();
  try {
    const [cached] = await db.select().from(exchangeRates).where(eq(exchangeRates.date, date));
    if (cached) return cached.usdArs;

    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { venta?: number | null; promedio?: number | null; compra?: number | null };
    const rate = data.venta ?? data.promedio ?? data.compra;
    if (typeof rate !== "number" || !(rate > 0)) throw new Error(`respuesta inesperada: ${JSON.stringify(data)}`);

    await db.insert(exchangeRates).values({ date, usdArs: rate, source: SOURCE }).onConflictDoNothing();
    return rate;
  } catch (error) {
    console.error("No se pudo obtener el dólar tarjeta", error);
    return null;
  }
}
