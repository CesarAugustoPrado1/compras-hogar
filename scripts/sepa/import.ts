// Importa Precios Claros (base SEPA) ya descomprimido: elige las sucursales cercanas a casa
// y guarda su catálogo de productos y precios del día.
// Uso: tsx scripts/sepa/import.ts <carpeta>
// Variables: DATABASE_URL, HOME_LAT, HOME_LON, SEPA_RADIUS_KM (15), SEPA_MAX_BRANCHES (30)
import "dotenv/config";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { isValidGtin } from "../../src/lib/gtin";
import { sepaBranches, sepaImports, sepaPriceHistory, sepaProducts } from "../../src/db/schema";
import { idPart, readCsv, searchText, toNumber } from "./csv";

const HOME = { lat: Number(process.env.HOME_LAT), lon: Number(process.env.HOME_LON) };
const RADIUS_KM = Number(process.env.SEPA_RADIUS_KM ?? 15);
const MAX_BRANCHES = Number(process.env.SEPA_MAX_BRANCHES ?? 30);
const BATCH = 1000;

const COMERCIO = {
  comercio: ["id_comercio"],
  bandera: ["id_bandera"],
  chain: ["comercio_bandera_nombre", "bandera_nombre", "bandera"],
  company: ["comercio_razon_social", "razon_social"],
};
const SUCURSALES = {
  comercio: ["id_comercio"],
  bandera: ["id_bandera"],
  sucursal: ["id_sucursal"],
  name: ["sucursales_nombre", "sucursal_nombre", "nombre"],
  street: ["sucursales_calle", "calle", "direccion", "sucursales_direccion"],
  number: ["sucursales_numero", "numero"],
  locality: ["sucursales_localidad", "localidad"],
  province: ["sucursales_provincia", "provincia"],
  lat: ["sucursales_latitud", "latitud", "lat"],
  lon: ["sucursales_longitud", "longitud", "lng", "lon"],
};
const PRODUCTOS = {
  comercio: ["id_comercio"],
  bandera: ["id_bandera"],
  sucursal: ["id_sucursal"],
  producto: ["id_producto", "productos_ean", "ean"],
  description: ["productos_descripcion", "descripcion"],
  brand: ["productos_marca", "marca"],
  quantity: ["productos_cantidad_presentacion", "cantidad_presentacion"],
  unit: ["productos_unidad_medida_presentacion", "unidad_medida_presentacion"],
  price: ["productos_precio_lista", "precio_lista", "precio"],
  refPrice: ["productos_precio_referencia", "precio_referencia"],
  refQuantity: ["productos_cantidad_referencia", "cantidad_referencia"],
  refUnit: ["productos_unidad_medida_referencia", "unidad_medida_referencia"],
  promo1Price: ["productos_precio_unitario_promo1", "precio_unitario_promo1"],
  promo1Text: ["productos_leyenda_promo1", "leyenda_promo1"],
  promo2Price: ["productos_precio_unitario_promo2", "precio_unitario_promo2"],
  promo2Text: ["productos_leyenda_promo2", "leyenda_promo2"],
};

function distanceKm(lat: number, lon: number) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat - HOME.lat) * rad) / 2) ** 2 +
    Math.cos(HOME.lat * rad) * Math.cos(lat * rad) * Math.sin(((lon - HOME.lon) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

async function findComercioDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = entries.some((e) => e.isFile() && e.name.toLowerCase() === "sucursales.csv") ? [dir] : [];
  for (const e of entries) {
    if (e.isDirectory()) found.push(...(await findComercioDirs(path.join(dir, e.name))));
  }
  return found;
}

type Branch = typeof sepaBranches.$inferInsert;
type Product = typeof sepaProducts.$inferInsert;
type Price = Omit<typeof sepaPriceHistory.$inferInsert, "validFrom" | "validTo">;

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

async function main() {
  const root = process.argv[2];
  if (!root) throw new Error("Uso: import.ts <carpeta>");
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL");
  if (!Number.isFinite(HOME.lat) || !Number.isFinite(HOME.lon)) throw new Error("Faltan HOME_LAT / HOME_LON");

  const dirs = await findComercioDirs(root);
  // La fecha de los datos viene en el nombre de alguna carpeta (AAAA-MM-DD).
  const dataDate =
    dirs.map((d) => d.match(/\d{4}-\d{2}-\d{2}/)?.[0]).find(Boolean) ??
    new Date().toISOString().slice(0, 10);
  console.log(`${dirs.length} comercios en el archivo`);

  // 1. Sucursales cercanas
  const candidates: Branch[] = [];
  const dirById = new Map<string, string>();
  for (const dir of dirs) {
    const chains = new Map<string, { chain: string; company: string | null }>();
    try {
      for await (const r of readCsv(path.join(dir, "comercio.csv"), COMERCIO, ["comercio", "bandera"])) {
        chains.set(`${idPart(r("comercio"))}-${idPart(r("bandera"))}`, {
          chain: r("chain") ?? r("company") ?? "Sin nombre",
          company: r("company"),
        });
      }
    } catch (error) {
      console.warn(`Sin comercio.csv legible en ${dir}:`, (error as Error).message);
    }

    for await (const r of readCsv(path.join(dir, "sucursales.csv"), SUCURSALES, ["comercio", "bandera", "sucursal", "lat", "lon"])) {
      const lat = toNumber(r("lat"));
      const lon = toNumber(r("lon"));
      if (lat === null || lon === null || (lat === 0 && lon === 0)) continue;
      const d = distanceKm(lat, lon);
      if (d > RADIUS_KM) continue;
      const chainKey = `${idPart(r("comercio"))}-${idPart(r("bandera"))}`;
      const info = chains.get(chainKey);
      const id = `${chainKey}-${idPart(r("sucursal"))}`;
      dirById.set(id, dir);
      candidates.push({
        id,
        chain: info?.chain ?? "Sin nombre",
        company: info?.company ?? null,
        name: r("name"),
        address: [r("street"), r("number")].filter(Boolean).join(" ") || null,
        locality: r("locality"),
        province: r("province"),
        lat,
        lon,
        distanceKm: Math.round(d * 100) / 100,
      });
    }
  }
  const chosen = candidates.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, MAX_BRANCHES);
  if (!chosen.length) throw new Error(`No hay sucursales a menos de ${RADIUS_KM} km`);
  for (const b of chosen) console.log(`  ${b.distanceKm.toFixed(1)} km  ${b.chain} – ${b.name ?? ""} (${b.address ?? ""}, ${b.locality ?? ""})`);

  // 2. Productos y precios de esas sucursales
  const branchIds = new Set(chosen.map((b) => b.id));
  const products = new Map<string, Product>();
  const prices: Price[] = [];
  for (const dir of new Set(chosen.map((b) => dirById.get(b.id)!))) {
    for await (const r of readCsv(path.join(dir, "productos.csv"), PRODUCTOS, ["comercio", "bandera", "sucursal", "producto", "description", "price"])) {
      const branchId = `${idPart(r("comercio"))}-${idPart(r("bandera"))}-${idPart(r("sucursal"))}`;
      if (!branchIds.has(branchId)) continue;
      const ean = r("producto")?.replace(/\D/g, "");
      const price = toNumber(r("price"));
      // Solo productos con EAN válido: los códigos internos no sirven para comparar entre cadenas.
      if (!ean || !isValidGtin(ean) || price === null || price <= 0) continue;

      if (!products.has(ean)) {
        products.set(ean, {
          ean,
          description: r("description")!,
          brand: r("brand"),
          quantity: toNumber(r("quantity")),
          unit: r("unit"),
          searchText: searchText(r("description"), r("brand")),
        });
      }
      const refQty = r("refQuantity");
      prices.push({
        branchId,
        ean,
        price,
        refPrice: toNumber(r("refPrice")),
        refUnit: [refQty, r("refUnit")].filter(Boolean).join(" ") || null,
        promo1Price: toNumber(r("promo1Price")),
        promo1Text: r("promo1Text"),
        promo2Price: toNumber(r("promo2Price")),
        promo2Text: r("promo2Text"),
      });
    }
  }
  // Una sucursal puede repetir un producto: queda el último.
  const uniquePrices = [...new Map(prices.map((p) => [`${p.branchId}|${p.ean}`, p])).values()];
  console.log(`${products.size} productos, ${uniquePrices.length} precios`);

  // 3. Guardar todo en una transacción
  const db = drizzle(process.env.DATABASE_URL);
  const [last] = await db.select().from(sepaImports).orderBy(desc(sepaImports.dataDate)).limit(1);
  if (last?.dataDate && last.dataDate > dataDate) {
    console.log(`El archivo (${dataDate}) es más viejo que la última importación (${last.dataDate}): no se importa.`);
    process.exit(0);
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
      source: process.env.SEPA_SOURCE ?? null,
      branches: chosen.length,
      products: products.size,
      prices: uniquePrices.length,
      changes,
    });
  });
  console.log(`Importación terminada: ${changes} precios nuevos o modificados.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
