CREATE TABLE "sepa_branches" (
	"id" text PRIMARY KEY NOT NULL,
	"chain" text NOT NULL,
	"company" text,
	"name" text,
	"address" text,
	"locality" text,
	"province" text,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"distance_km" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sepa_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"data_date" date,
	"source" text,
	"branches" integer NOT NULL,
	"products" integer NOT NULL,
	"prices" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sepa_prices" (
	"branch_id" text NOT NULL,
	"ean" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"ref_price" numeric(12, 2),
	"ref_unit" text,
	"promo1_price" numeric(12, 2),
	"promo1_text" text,
	"promo2_price" numeric(12, 2),
	"promo2_text" text,
	"date" date NOT NULL,
	CONSTRAINT "sepa_prices_branch_id_ean_pk" PRIMARY KEY("branch_id","ean")
);
--> statement-breakpoint
CREATE TABLE "sepa_products" (
	"ean" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"brand" text,
	"quantity" numeric(12, 3),
	"unit" text,
	"search_text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sepa_prices" ADD CONSTRAINT "sepa_prices_branch_id_sepa_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."sepa_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sepa_prices" ADD CONSTRAINT "sepa_prices_ean_sepa_products_ean_fk" FOREIGN KEY ("ean") REFERENCES "public"."sepa_products"("ean") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sepa_prices_ean_idx" ON "sepa_prices" USING btree ("ean");--> statement-breakpoint
CREATE INDEX "sepa_products_search_idx" ON "sepa_products" USING gin ("search_text" gin_trgm_ops);