-- Pasa los precios ya importados al histórico, como vigentes desde su fecha.
INSERT INTO "sepa_price_history" ("branch_id", "ean", "price", "ref_price", "ref_unit", "promo1_price", "promo1_text", "promo2_price", "promo2_text", "valid_from")
SELECT "branch_id", "ean", "price", "ref_price", "ref_unit", "promo1_price", "promo1_text", "promo2_price", "promo2_text", "date"
FROM "sepa_prices";--> statement-breakpoint
DROP TABLE "sepa_prices" CASCADE;--> statement-breakpoint
CREATE INDEX "sepa_price_history_current_idx" ON "sepa_price_history" ("branch_id", "ean") WHERE "valid_to" IS NULL;--> statement-breakpoint
-- Precios vigentes hoy en las sucursales cercanas.
CREATE VIEW "sepa_current_prices" AS
SELECT h.*
FROM "sepa_price_history" h
JOIN "sepa_branches" b ON b."id" = h."branch_id"
WHERE h."valid_to" IS NULL AND b."active";
