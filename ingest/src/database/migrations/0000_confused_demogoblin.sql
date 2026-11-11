CREATE TABLE "request_logs" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"garden_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"target_name" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status" integer,
	"completed" boolean NOT NULL,
	"duration_ms" integer NOT NULL,
	"outcome" text NOT NULL,
	"faults" text[] DEFAULT '{}' NOT NULL,
	"rule_ids" text[] DEFAULT '{}' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_stats_minute" (
	"garden_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"ok" integer DEFAULT 0 NOT NULL,
	"slow" integer DEFAULT 0 NOT NULL,
	"error" integer DEFAULT 0 NOT NULL,
	"drop" integer DEFAULT 0 NOT NULL,
	"corrupt" integer DEFAULT 0 NOT NULL,
	"target_error" integer DEFAULT 0 NOT NULL,
	"no_response" integer DEFAULT 0 NOT NULL,
	"duration_ms_sum" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "request_stats_minute_garden_id_target_id_bucket_pk" PRIMARY KEY("garden_id","target_id","bucket")
);
--> statement-breakpoint
CREATE INDEX "request_logs_garden_time_idx" ON "request_logs" USING btree ("garden_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "request_stats_garden_bucket_idx" ON "request_stats_minute" USING btree ("garden_id","bucket");