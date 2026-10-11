// Guarda una importación de Precios Claros (de cualquier fuente) con histórico:
// solo registra los precios nuevos o modificados respecto de lo vigente.
import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { sepaBranches, sepaImports, sepaPriceHistory, sepaProducts } from "../../src/db/schema";

export const HOME = { lat: Number(process.env.HOME_LAT), lon: Number(process.env.HOME_LON) };
export const RADIUS_KM = Number(process.env.SEPA_RADIUS_KM ?? 15);
export const MAX_BRANCHES = Number(process.env.SEPA_MAX_BRANCHES ?? 30);
const BATCH = 1000;

export type Branch = typeof sepaBranches.$inferInsert;
export type Product = typeof sepaProducts.$inferInsert;
export type Price = Omit<typeof sepaPriceHistory.$inferInsert, "validFrom" | "validTo">;

export function checkEnv() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL");
  if (!Number.isFinite(HOME.lat) || !Number.isFinite(HOME.lon)) throw new Error("Faltan HOME_LAT / HOME_LON");
}

export function distanceKm(lat: number, lon: number) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat - HOME.lat) * rad) / 2) ** 2 +
    Math.cos(HOME.lat * rad) * Math.cos(lat * rad) * Math.sin(((lon - HOME.lon) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// Campos que, si cambian, abren un período nuevo en el histórico.
const priceKey = (p: {
  price: number;
  refPrice?: number | null;
  promo1Price?: number | null;
  promo1Text?: string | null;
  promo2Price?: number | null;
  promo2Text?: string | null;
}) =>
  [p.price, p.refPrice, p.promo1Price, p.promo1Text, p.promo2Price, p.promo2Text]
    .map((v) => (v === null || v === undefined ? "" : typeof v === "number" ? v.toFixed(2) : v))
    .join("|");

export async function saveImport({
  dataDate,
  source,
  chosen,
  products,
  prices,
}: {
  dataDate: string;
  source: string | null;
  chosen: Branch[];
  products: Map<string, Product>;
  prices: Price[];
}) {
  const branchIds = new Set(chosen.map((b) => b.id));
  // Una sucursal puede repetir un producto: queda el último.
  const uniquePrices = [...new Map(prices.map((p) => [`${p.branchId}|${p.ean}`, p])).values()];
  console.log(`${products.size} productos, ${uniquePrices.length} precios`);

  const db = drizzle(process.env.DATABASE_URL!);
  const [last] = await db.select().from(sepaImports).orderBy(desc(sepaImports.dataDate)).limit(1);
  if (last?.dataDate && last.dataDate > dataDate) {
    console.log(`El archivo (${dataDate}) es más viejo que la última importación (${last.dataDate}): no se importa.`);
    return;
  }

  let changes = 0;
  await db.transaction(async (tx) => {
    const ids = [...branchIds];
    // Las sucursales que quedan fuera del radio se desactivan (se conserva su histórico)
    // y sus precios vigentes se cierran.
    const gone = await tx
      .update(sepaBranches)
      .set({ active: false })
      .where(and(notInArray(sepaBranches.id, ids), eq(sepaBranches.active, true)))
      .returning({ id: sepaBranches.id });
    if (gone.length) {
      await tx
        .update(sepaPriceHistory)
        .set({ validTo: dataDate })
        .where(and(inArray(sepaPriceHistory.branchId, gone.map((g) => g.id)), isNull(sepaPriceHistory.validTo)));
    }
    await tx
      .insert(sepaBranches)
      .values(chosen)
      .onConflictDoUpdate({
        target: sepaBranches.id,
        set: {
          chain: sql`excluded.chain`,
          company: sql`excluded.company`,
          name: sql`excluded.name`,
          address: sql`excluded.address`,
          locality: sql`excluded.locality`,
          province: sql`excluded.province`,
          lat: sql`excluded.lat`,
          lon: sql`excluded.lon`,
          distanceKm: sql`excluded.distance_km`,
          active: true,
          updatedAt: sql`now()`,
        },
      });

    const productRows = [...products.values()];
    for (let i = 0; i < productRows.length; i += BATCH) {
      await tx
        .insert(sepaProducts)
        .values(productRows.slice(i, i + BATCH))
        .onConflictDoUpdate({
          target: sepaProducts.ean,
          set: {
            description: sql`excluded.description`,
            brand: sql`excluded.brand`,
            quantity: sql`excluded.quantity`,
            unit: sql`excluded.unit`,
            searchText: sql`excluded.search_text`,
            updatedAt: sql`now()`,
          },
        });
    }

    // Histórico: se compara con lo vigente y solo se registran los cambios.
    const open = await tx
      .select()
      .from(sepaPriceHistory)
      .where(and(inArray(sepaPriceHistory.branchId, ids), isNull(sepaPriceHistory.validTo)));
    const openByKey = new Map(open.map((o) => [`${o.branchId}|${o.ean}`, o]));

    const toInsert: (typeof sepaPriceHistory.$inferInsert)[] = [];
    const toClose = new Map<string, string[]>(); // sucursal → EANs cuyo período vigente termina hoy
    const toReplace: Price[] = []; // misma fecha de inicio (archivo del mismo día reimportado)
    const close = (branchId: string, ean: string) =>
      toClose.set(branchId, [...(toClose.get(branchId) ?? []), ean]);

    for (const p of uniquePrices) {
      const key = `${p.branchId}|${p.ean}`;
      const current = openByKey.get(key);
      openByKey.delete(key);
      if (current && priceKey(current) === priceKey(p)) continue; // sin cambios
      changes++;
      if (current?.validFrom === dataDate) {
        toReplace.push(p);
        continue;
      }
      if (current) close(p.branchId, p.ean);
      toInsert.push({ ...p, validFrom: dataDate });
    }
    // Lo que estaba vigente y ya no figura en el archivo deja de estar a la venta.
    for (const o of openByKey.values()) {
      if (o.validFrom === dataDate) continue;
      close(o.branchId, o.ean);
    }

    for (const [branchId, eans] of toClose) {
      for (let i = 0; i < eans.length; i += BATCH) {
        await tx
          .update(sepaPriceHistory)
          .set({ validTo: dataDate })
          .where(
            and(
              eq(sepaPriceHistory.branchId, branchId),
              inArray(sepaPriceHistory.ean, eans.slice(i, i + BATCH)),
              isNull(sepaPriceHistory.validTo),
            ),
          );
      }
    }
    for (const p of toReplace) {
      await tx
        .update(sepaPriceHistory)
        .set(p)
        .where(
          and(
            eq(sepaPriceHistory.branchId, p.branchId),
            eq(sepaPriceHistory.ean, p.ean),
            eq(sepaPriceHistory.validFrom, dataDate),
          ),
        );
    }
    for (let i = 0; i < toInsert.length; i += BATCH) {
      await tx.insert(sepaPriceHistory).values(toInsert.slice(i, i + BATCH));
    }

    await tx.insert(sepaImports).values({
      dataDate,
      source,
      branches: chosen.length,
      products: products.size,
      prices: uniquePrices.length,
      changes,
    });
  });
  console.log(`Importación terminada: ${changes} precios nuevos o modificados.`);
}
