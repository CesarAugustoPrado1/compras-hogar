import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { productAliases, products, stores, ticketImages, ticketItems, tickets } from "@/db/schema";
import { fromLocalInput } from "./dates";
import { isValidGtin } from "./gtin";
import { extractTicket } from "@/lib/extract";
import { readFileBytes } from "./storage";

type NewItem = typeof ticketItems.$inferInsert;

// Completa cada renglón con el producto ya conocido: primero por EAN, después por el
// código interno del súper (visto en tickets validados) y por último por cómo lo nombra
// ese supermercado (alias aprendido al validar).
export async function matchKnownProducts(storeId: number | null, items: NewItem[]) {
  const eans = [...new Set(items.map((i) => i.ean).filter((e): e is string => Boolean(e)))];
  const byEan = new Map(
    eans.length
      ? (await db.select().from(products).where(inArray(products.ean, eans))).map((p) => [p.ean!, p])
      : [],
  );

  const raws = [...new Set(items.map((i) => i.rawText))];
  const byAlias = new Map(
    storeId && raws.length
      ? (
          await db
            .select({ rawText: productAliases.rawText, product: products })
            .from(productAliases)
            .innerJoin(products, eq(productAliases.productId, products.id))
            .where(and(eq(productAliases.storeId, storeId), inArray(productAliases.rawText, raws)))
        ).map((r) => [r.rawText, r.product])
      : [],
  );

  const codes = [...new Set(items.map((i) => i.storeCode).filter((c): c is string => Boolean(c)))];
  const byCode = new Map<string, typeof products.$inferSelect>();
  if (storeId && codes.length) {
    const rows = await db
      .select({ code: ticketItems.storeCode, product: products })
      .from(ticketItems)
      .innerJoin(tickets, eq(ticketItems.ticketId, tickets.id))
      .innerJoin(products, eq(ticketItems.productId, products.id))
      .where(
        and(
          eq(tickets.storeId, storeId),
          eq(tickets.status, "validado"),
          inArray(ticketItems.storeCode, codes),
        ),
      )
      .orderBy(asc(tickets.validatedAt));
    // El más reciente gana, por si el súper reasignó un código.
    for (const r of rows) byCode.set(r.code!, r.product);
  }

  return items.map((item) => {
    if (item.kind !== "producto") return item;
    const product =
      (item.ean && byEan.get(item.ean)) ||
      (item.storeCode && byCode.get(item.storeCode)) ||
      byAlias.get(item.rawText);
    if (!product) return item;
    return {
      ...item,
      productId: product.id,
      ean: item.ean ?? product.ean,
      productName: product.name,
      brand: product.brand,
      presentation: product.presentation,
      category: product.category,
    };
  });
}

// Un "EAN" que no pasa el dígito verificador es en realidad un código interno del súper.
export function splitCodes(ean: string | null, storeCode: string | null) {
  const digits = ean?.replace(/\D/g, "") || null;
  if (digits && isValidGtin(digits)) return { ean: digits, storeCode: storeCode?.trim() || null };
  return { ean: null, storeCode: storeCode?.trim() || digits };
}

// Lee las fotos del ticket con IA y reemplaza sus renglones por lo extraído.
export async function runExtraction(ticketId: number) {
  const images = await db
    .select()
    .from(ticketImages)
    .where(eq(ticketImages.ticketId, ticketId))
    .orderBy(asc(ticketImages.position));
  const storeRows = await db.select().from(stores);

  try {
    const files = await Promise.all(
      images.map(async (img) => {
        const data = await readFileBytes(img.path);
        if (!data) throw new Error(`No se encontró la foto ${img.position + 1}.`);
        return { data, mediaType: img.contentType as "image/jpeg" | "image/png" | "image/webp" };
      }),
    );
    const extracted = await extractTicket(
      files,
      storeRows.map((s) => s.name),
    );

    const store = storeRows.find(
      (s) => s.name.toLowerCase() === extracted.storeName?.toLowerCase(),
    );
    const storeId = store?.id ?? null;
    const notes = [
      !store && extracted.storePrinted ? `Comercio no reconocido: ${extracted.storePrinted}.` : null,
      extracted.notes,
    ]
      .filter(Boolean)
      .join(" ");

    const items = await matchKnownProducts(
      storeId,
      extracted.items.map((item, position) => ({
        ticketId,
        position,
        kind: item.kind,
        rawText: item.rawText,
        ...splitCodes(item.ean, item.storeCode),
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        discount: item.discount,
        lineTotal: item.lineTotal,
        productName: item.productName,
        brand: item.brand,
        presentation: item.presentation,
        category: item.category,
      })),
    );

    await db.delete(ticketItems).where(eq(ticketItems.ticketId, ticketId));
    if (items.length) await db.insert(ticketItems).values(items);
    await db
      .update(tickets)
      .set({
        storeId,
        branch: extracted.branch,
        ticketNumber: extracted.ticketNumber,
        purchasedAt: fromLocalInput(extracted.purchasedAt),
        total: extracted.total,
        paymentMethod: extracted.paymentMethod,
        rawText: JSON.stringify(extracted),
        extractionNotes: notes || null,
      })
      .where(eq(tickets.id, ticketId));
  } catch (error) {
    console.error(`Falló la lectura del ticket ${ticketId}`, error);
    await db
      .update(tickets)
      .set({
        extractionNotes: `No se pudo leer automáticamente (${
          error instanceof Error ? error.message : "error desconocido"
        }). Podés reintentar o cargar los renglones a mano.`,
      })
      .where(eq(tickets.id, ticketId));
  }
}

type ValidatedItem = {
  ean: string | null;
  productId: number | null;
  productName: string;
  brand: string | null;
  presentation: string | null;
  category: string | null;
};

// Vincula un renglón validado a su producto canónico, creándolo si hace falta.
export async function resolveProduct(item: ValidatedItem): Promise<number> {
  const details = {
    name: item.productName,
    brand: item.brand,
    presentation: item.presentation,
    category: item.category,
  };

  if (item.ean) {
    const [byEan] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.ean, item.ean));
    if (byEan) {
      await db.update(products).set(details).where(eq(products.id, byEan.id));
      return byEan.id;
    }
  }

  if (item.productId) {
    // Producto conocido por alias: si ahora sabemos su EAN, se lo agregamos.
    await db
      .update(products)
      .set(item.ean ? { ...details, ean: item.ean } : details)
      .where(eq(products.id, item.productId));
    return item.productId;
  }

  if (item.ean) {
    const [created] = await db
      .insert(products)
      .values({ ean: item.ean, ...details })
      .returning({ id: products.id });
    return created.id;
  }

  // Sin EAN: reusar un producto con el mismo nombre, marca y presentación.
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        sql`lower(${products.name}) = lower(${item.productName})`,
        sql`coalesce(lower(${products.brand}), '') = coalesce(lower(${item.brand}), '')`,
        sql`coalesce(lower(${products.presentation}), '') = coalesce(lower(${item.presentation}), '')`,
      ),
    )
    .limit(1);
  if (existing) {
    await db.update(products).set(details).where(eq(products.id, existing.id));
    return existing.id;
  }

  const [created] = await db.insert(products).values(details).returning({ id: products.id });
  return created.id;
}

export async function rememberAlias(storeId: number, rawText: string, productId: number) {
  await db
    .insert(productAliases)
    .values({ storeId, rawText, productId })
    .onConflictDoUpdate({
      target: [productAliases.storeId, productAliases.rawText],
      set: { productId },
    });
}
