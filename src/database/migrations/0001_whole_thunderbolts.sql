ALTER TABLE "gardens" ADD COLUMN "rate_limit_rps" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "gardens" ADD COLUMN "rate_limit_burst" integer DEFAULT 20 NOT NULL;