import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Usuarios del hogar. Entran con nombre + PIN.
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Producto canónico. El EAN-13/GTIN es el identificador común entre supermercados
// y con SEPA / Precios Claros; puede faltar en productos sueltos (fiambre, verdura).
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  ean: text("ean").unique(),
  name: text("name").notNull(),
  brand: text("brand"),
  presentation: text("presentation"), // ej.: "150 g", "1 l", "pack x 6"
  // Contenido neto por unidad en kg o l (de la presentación), para comparar precio por kilo.
  contentAmount: numeric("content_amount", { precision: 12, scale: 4, mode: "number" }),
  contentUnit: text("content_unit"), // "kg" | "l"
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Cómo nombra cada supermercado a un producto en el ticket ("QSO RALL 150G").
// Se completa con las correcciones de la validación humana.
export const productAliases = pgTable(
  "product_aliases",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => stores.id),
    rawText: text("raw_text").notNull(),
    productId: integer("product_id").notNull().references(() => products.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("product_aliases_store_raw_idx").on(t.storeId, t.rawText)],
);

export const ticketStatus = pgEnum("ticket_status", ["borrador", "validado"]);

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id),
  branch: text("branch"), // sucursal, ej. "Gorriti 1069"
  ticketNumber: text("ticket_number"), // punto de venta y número, ej. "01098-00033941"
  purchasedAt: timestamp("purchased_at", { withTimezone: true }),
  total: numeric("total", { precision: 12, scale: 2, mode: "number" }),
  paymentMethod: text("payment_method"),
  rawText: text("raw_text"),
  // Lo que la IA no pudo leer bien o quiere que revisemos.
  extractionNotes: text("extraction_notes"),
  status: ticketStatus("status").notNull().default("borrador"),
  uploadedBy: integer("uploaded_by").notNull().references(() => users.id),
  validatedBy: integer("validated_by").references(() => users.id),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Un ticket largo puede venir en varias fotos, en orden.
export const ticketImages = pgTable("ticket_images", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  path: text("path").notNull(), // ruta en el almacenamiento (Vercel Blob privado o disco local)
  contentType: text("content_type").notNull(),
});

export const itemKind = pgEnum("item_kind", ["producto", "descuento", "otro"]);
export const itemUnit = pgEnum("item_unit", ["u", "kg", "l"]);

export const ticketItems = pgTable("ticket_items", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  kind: itemKind("kind").notNull().default("producto"),
  rawText: text("raw_text").notNull(),
  ean: text("ean"),
  storeCode: text("store_code"), // código interno del supermercado (PLU), ej. "4600"
  quantity: numeric("quantity", { precision: 10, scale: 3, mode: "number" }).notNull().default(1),
  unit: itemUnit("unit").notNull().default("u"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2, mode: "number" }),
  discount: numeric("discount", { precision: 12, scale: 2, mode: "number" }),
  lineTotal: numeric("line_total", { precision: 12, scale: 2, mode: "number" }),
  // Propuesta de producto normalizado (de la IA o de un alias ya conocido),
  // editable en la validación. Al validar se vincula a products.
  productName: text("product_name"),
  brand: text("brand"),
  presentation: text("presentation"),
  category: text("category"),
  productId: integer("product_id").references(() => products.id),
  // Precio por kg o litro: calculado (precio por peso, o precio del envase / contenido neto)
  // o, si no se puede, el que imprime el ticket.
  contentAmount: numeric("content_amount", { precision: 12, scale: 4, mode: "number" }),
  refPrice: numeric("ref_price", { precision: 12, scale: 2, mode: "number" }),
  refUnit: text("ref_unit"), // "kg" | "l"
  printedRefPrice: numeric("printed_ref_price", { precision: 12, scale: 2, mode: "number" }),
});

// ---------------------------------------------------------------------------
// Precios Claros (base SEPA). Se importa todos los días con una GitHub Action
// (scripts/sepa), solo para las sucursales cercanas a casa.

export const sepaBranches = pgTable("sepa_branches", {
  id: text("id").primaryKey(), // "comercio-bandera-sucursal"
  chain: text("chain").notNull(), // bandera, ej. "Coto", "Carrefour Market"
  company: text("company"), // razón social
  name: text("name"),
  address: text("address"),
  locality: text("locality"),
  province: text("province"),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  distanceKm: doublePrecision("distance_km").notNull(),
  // false si quedó fuera del radio: se conserva por su histórico de precios.
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sepaProducts = pgTable(
  "sepa_products",
  {
    ean: text("ean").primaryKey(),
    description: text("description").notNull(),
    brand: text("brand"),
    quantity: numeric("quantity", { precision: 12, scale: 3, mode: "number" }),
    unit: text("unit"),
    // descripción + marca en minúsculas y sin acentos, para la búsqueda aproximada (pg_trgm)
    searchText: text("search_text").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sepa_products_search_idx").using("gin", sql`${t.searchText} gin_trgm_ops`)],
);

// Histórico de precios: una fila por período en que un precio (y sus promos) estuvo vigente
// en una sucursal. Solo se agrega una fila cuando algo cambia. Vigente: valid_to null.
// Los precios actuales se consultan con la vista sepa_current_prices.
export const sepaPriceHistory = pgTable(
  "sepa_price_history",
  {
    branchId: text("branch_id")
      .notNull()
      .references(() => sepaBranches.id, { onDelete: "cascade" }),
    ean: text("ean")
      .notNull()
      .references(() => sepaProducts.ean, { onDelete: "cascade" }),
    price: numeric("price", { precision: 12, scale: 2, mode: "number" }).notNull(),
    refPrice: numeric("ref_price", { precision: 12, scale: 2, mode: "number" }),
    refUnit: text("ref_unit"), // ej. "1 kg", "1 lt"
    promo1Price: numeric("promo1_price", { precision: 12, scale: 2, mode: "number" }),
    promo1Text: text("promo1_text"),
    promo2Price: numeric("promo2_price", { precision: 12, scale: 2, mode: "number" }),
    promo2Text: text("promo2_text"),
    validFrom: date("valid_from").notNull(), // primer día con este precio
    validTo: date("valid_to"), // primer día en que ya no estaba (null: vigente)
  },
  (t) => [
    primaryKey({ columns: [t.branchId, t.ean, t.validFrom] }),
    index("sepa_price_history_ean_idx").on(t.ean, t.validFrom),
  ],
);

export const sepaImports = pgTable("sepa_imports", {
  id: serial("id").primaryKey(),
  dataDate: date("data_date"),
  source: text("source"),
  branches: integer("branches").notNull(),
  products: integer("products").notNull(),
  prices: integer("prices").notNull(),
  changes: integer("changes").notNull().default(0), // precios nuevos o modificados
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Consumo de IA: un registro por cada llamada (lecturas de tickets, etc.), con sus
// tokens y el costo estimado en dólares según la lista de precios (src/lib/ai-pricing.ts).
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    purpose: text("purpose").notNull(), // ej. "lectura_ticket"
    userId: integer("user_id").references(() => users.id),
    // Si el ticket se borra, el gasto queda registrado igual.
    ticketId: integer("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6, mode: "number" }), // null si el modelo no está en la lista
    ok: boolean("ok").notNull(),
    error: text("error"),
    durationMs: integer("duration_ms"),
    usdArs: numeric("usd_ars", { precision: 12, scale: 2, mode: "number" }), // dólar tarjeta del día
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);

// Cotización diaria del dólar tarjeta (pesos por dólar), para pasar a pesos los gastos en USD.
export const exchangeRates = pgTable("exchange_rates", {
  date: date("date").primaryKey(),
  usdArs: numeric("usd_ars", { precision: 12, scale: 2, mode: "number" }).notNull(),
  source: text("source").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});
