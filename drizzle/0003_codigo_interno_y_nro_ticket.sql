ALTER TABLE "ticket_items" ADD COLUMN "store_code" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "branch" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "ticket_number" text;