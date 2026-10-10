import "server-only";
import { desc, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { sepaImports, sepaProducts } from "@/db/schema";

export type SepaMatch = {
  ean: string;
  description: string;
  brand: string | null;
  quantity: number | null;
  unit: string | null;
  bestPrice: number | null;
  bestChain: string | null;
  branches: number;
};

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Precio más bajo del día entre las sucursales cercanas, para cada EAN.
const bestPriceColumns = sql`
  (select min(sp.price) from sepa_prices sp where sp.ean = ${sepaProducts.ean}) as best_price,
  (select sb.chain from sepa_prices sp join sepa_branches sb on sb.id = sp.branch_id
     where sp.ean = ${sepaProducts.ean} order by sp.price, sb.distance_km limit 1) as best_chain,
  (select count(*)::int from sepa_prices sp where sp.ean = ${sepaProducts.ean}) as branches`;

type RawMatch = {
  ean: string;
  description: string;
  brand: string | null;
  quantity: string | null;
  unit: string | null;
  best_price: string | null;
  best_chain: string | null;
  branches: number;
};

const toMatch = (r: RawMatch): SepaMatch => ({
  ean: r.ean,
  description: r.description,
  brand: r.brand,
  quantity: r.quantity === null ? null : Number(r.quantity),
  unit: r.unit,
  bestPrice: r.best_price === null ? null : Number(r.best_price),
  bestChain: r.best_chain,
  branches: r.branches,
});

// Búsqueda aproximada en el catálogo de Precios Claros (pg_trgm).
export async function searchSepa(query: string, limit = 8): Promise<SepaMatch[]> {
  const q = normalize(query);
  if (q.length < 3) return [];
  const result = await db.execute(sql`
    select ean, description, brand, quantity, unit, ${bestPriceColumns}
    from ${sepaProducts}
    where ${q} <% search_text
    order by word_similarity(${q}, search_text) desc, length(search_text)
    limit ${limit}`);
  return (result.rows as RawMatch[]).map(toMatch);
}

export async function sepaByEans(eans: string[]): Promise<Map<string, SepaMatch>> {
  if (!eans.length) return new Map();
  const result = await db.execute(sql`
    select ean, description, brand, quantity, unit, ${bestPriceColumns}
    from ${sepaProducts}
    where ${inArray(sepaProducts.ean, eans)}`);
  return new Map((result.rows as RawMatch[]).map((r) => [r.ean, toMatch(r)]));
}

export async function lastSepaImport() {
  const [row] = await db.select().from(sepaImports).orderBy(desc(sepaImports.createdAt)).limit(1);
  return row ?? null;
}
