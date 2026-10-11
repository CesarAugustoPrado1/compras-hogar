// Importa Precios Claros (base SEPA) ya descomprimido: elige las sucursales cercanas a casa
// y guarda su catálogo de productos y precios del día.
// Uso: tsx scripts/sepa/import.ts <carpeta>
// Variables: DATABASE_URL, HOME_LAT, HOME_LON, SEPA_RADIUS_KM (15), SEPA_MAX_BRANCHES (30)
import "dotenv/config";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { isValidGtin } from "../../src/lib/gtin";
import { idPart, readCsv, searchText, toNumber } from "./csv";
import {
  type Branch,
  checkEnv,
  distanceKm,
  MAX_BRANCHES,
  type Price,
  type Product,
  RADIUS_KM,
  saveImport,
} from "./save";

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

async function findComercioDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = entries.some((e) => e.isFile() && e.name.toLowerCase() === "sucursales.csv") ? [dir] : [];
  for (const e of entries) {
    if (e.isDirectory()) found.push(...(await findComercioDirs(path.join(dir, e.name))));
  }
  return found;
}

async function main() {
  const root = process.argv[2];
  if (!root) throw new Error("Uso: import.ts <carpeta>");
  checkEnv();

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
  await saveImport({ dataDate, source: process.env.SEPA_SOURCE ?? null, chosen, products, prices });
  process.exit(0);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
