import {
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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
});
