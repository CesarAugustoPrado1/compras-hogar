CREATE TABLE "exchange_rates" (
	"date" date PRIMARY KEY NOT NULL,
	"usd_ars" numeric(12, 2) NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "usd_ars" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "content_amount" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "content_unit" text;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD COLUMN "content_amount" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "ticket_items" ADD COLUMN "ref_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "ticket_items" ADD COLUMN "ref_unit" text;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD COLUMN "printed_ref_price" numeric(12, 2);