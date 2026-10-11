CREATE TABLE "sepa_price_history" (
	"branch_id" text NOT NULL,
	"ean" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"ref_price" numeric(12, 2),
	"ref_unit" text,
	"promo1_price" numeric(12, 2),
	"promo1_text" text,
	"promo2_price" numeric(12, 2),
	"promo2_text" text,
	"valid_from" date NOT NULL,
	"valid_to" date,
	CONSTRAINT "sepa_price_history_branch_id_ean_valid_from_pk" PRIMARY KEY("branch_id","ean","valid_from")
);
--> statement-breakpoint
ALTER TABLE "sepa_branches" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sepa_imports" ADD COLUMN "changes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sepa_price_history" ADD CONSTRAINT "sepa_price_history_branch_id_sepa_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."sepa_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sepa_price_history" ADD CONSTRAINT "sepa_price_history_ean_sepa_products_ean_fk" FOREIGN KEY ("ean") REFERENCES "public"."sepa_products"("ean") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sepa_price_history_ean_idx" ON "sepa_price_history" USING btree ("ean","valid_from");