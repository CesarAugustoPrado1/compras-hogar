CREATE TYPE "public"."item_kind" AS ENUM('producto', 'descuento', 'otro');--> statement-breakpoint
CREATE TYPE "public"."item_unit" AS ENUM('u', 'kg', 'l');--> statement-breakpoint
ALTER TABLE "ticket_items" ADD COLUMN "kind" "item_kind" DEFAULT 'producto' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD COLUMN "unit" "item_unit" DEFAULT 'u' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD COLUMN "product_name" text;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD COLUMN "presentation" text;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "extraction_notes" text;--> statement-breakpoint
ALTER TABLE "ticket_images" DROP COLUMN "url";