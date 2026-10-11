// Importación alternativa: cuando el portal oficial no responde, toma los precios de
// Coto y Carrefour que republica el proyecto changuito-sepa (datos SEPA del Estado,
// CC BY 4.0) en GitHub, preparados por zona.
// Uso: tsx scripts/sepa/mirror.ts
import { gunzipSync } from "node:zlib";
import { isValidGtin } from "../../src/lib/gtin";
import { parseContent } from "../../src/lib/units";
import { searchText } from "./csv";
import { type Branch, checkEnv, distanceKm, HOME, MAX_BRANCHES, type Price, type Product, RADIUS_KM, saveImport } from "./save";

const BASE = process.env.SEPA_MIRROR_URL ?? "https://raw.githubusercontent.com/NahuelJV/changuito-sepa/datos";

type Index = { fecha: string; catalogo: { archivo: string }; celdas: Record<string, { archivo: string }> };
// [ean, descripción, marca, cantidad, unidad]
type CatalogRow = [string, string, string | null, number | null, string | null];
type Cell = {
  fecha: string;
  sucursales: { id: string; cadena: string; bandera: string; nombre: string; direccion: string; lat: number; lon: number; lista: string }[];
  precios: [string, number, number | null, string | null][]; // [ean, precio, precio promo, leyenda promo]
  listas: Record<string, number[]>; // índices en precios, codificados como diferencias
};

async function get(path: string): Promise<Buffer> {
  const res = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
const json = <T>(buf: Buffer, gz: boolean) => JSON.parse((gz ? gunzipSync(buf) : buf).toString("utf8")) as T;

async function main() {
  checkEnv();
  const index = json<Index>(await get("v1/indice.json"), false);
  console.log(`Copia alternativa con datos del ${index.fecha}`);

  // Celdas de 0,1° que cubren el radio alrededor de casa.
  const dLat = RADIUS_KM / 111;
  const dLon = RADIUS_KM / (111 * Math.cos((HOME.lat * Math.PI) / 180));
  const keys: string[] = [];
  for (let la = Math.floor((HOME.lat - dLat) * 10); la <= Math.floor((HOME.lat + dLat) * 10); la++) {
    for (let lo = Math.floor((HOME.lon - dLon) * 10); lo <= Math.floor((HOME.lon + dLon) * 10); lo++) {
      if (index.celdas[`${la}_${lo}`]) keys.push(`${la}_${lo}`);
    }
  }

  const candidates: Branch[] = [];
  const pricesById = new Map<string, Price[]>();
  for (const key of keys) {
    const cell = json<Cell>(await get(index.celdas[key].archivo), true);
    for (const s of cell.sucursales) {
      const d = distanceKm(s.lat, s.lon);
      if (d > RADIUS_KM) continue;
      // "COTO-12-1-131" → "12-1-131", el mismo id que usa la base oficial.
      const id = s.id.split("-").slice(-3).join("-");
      let i = 0;
      const prices = (cell.listas[s.lista] ?? []).map((delta) => {
        i += delta;
        const [ean, price, promoPrice, promoText] = cell.precios[i];
        return { branchId: id, ean, price, promo1Price: promoPrice, promo1Text: promoText } as Price;
      });
      pricesById.set(id, prices);
      candidates.push({
        id,
        chain: s.bandera,
        company: s.cadena,
        name: s.nombre,
        address: s.direccion,
        locality: s.direccion.split(",").pop()?.trim() ?? null,
        province: null,
        lat: s.lat,
        lon: s.lon,
        distanceKm: Math.round(d * 100) / 100,
      });
    }
  }
  const chosen = candidates.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, MAX_BRANCHES);
  if (!chosen.length) throw new Error(`La copia no tiene sucursales a menos de ${RADIUS_KM} km`);
  for (const b of chosen) console.log(`  ${b.distanceKm.toFixed(1)} km  ${b.chain} – ${b.name} (${b.address})`);

  const catalog = new Map(
    json<CatalogRow[]>(await get(index.catalogo.archivo), true).map((row) => [row[0], row]),
  );
  const products = new Map<string, Product>();
  const prices: Price[] = [];
  for (const branch of chosen) {
    for (const p of pricesById.get(branch.id) ?? []) {
      const row = catalog.get(p.ean);
      if (!row || !isValidGtin(p.ean) || !(p.price > 0)) continue;
      const [ean, description, brand, quantity, unit] = row;
      if (!products.has(ean)) {
        products.set(ean, { ean, description, brand, quantity, unit, searchText: searchText(description, brand) });
      }
      // La copia no trae el precio por kilo/litro: se calcula con el contenido del envase.
      const content = quantity && unit ? parseContent(`${quantity} ${unit}`) : null;
      prices.push({
        ...p,
        refPrice: content ? Math.round((p.price / content.amount) * 100) / 100 : null,
        refUnit: content ? `1 ${content.unit}` : null,
      });
    }
  }

  await saveImport({
    dataDate: index.fecha,
    source: `${BASE} (copia alternativa)`,
    chosen,
    products,
    prices,
  });
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
