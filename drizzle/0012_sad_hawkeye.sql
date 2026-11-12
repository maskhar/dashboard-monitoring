CREATE TABLE "project_workspace_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_hash" char(64) NOT NULL,
	"legacy_id" text NOT NULL,
	"status" text DEFAULT 'PREVIEWED' NOT NULL,
	"mapping_hash" char(64) NOT NULL,
	"target_project_id" uuid,
	"target_project_version" integer,
	"target_workspace_version" integer,
	"preview_expires_at" timestamp with time zone NOT NULL,
	"data_job_id" uuid,
	"created_by" uuid NOT NULL,
	"summary" jsonb,
	"error" text,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_workspace_import_hashes" CHECK ("project_workspace_imports"."source_hash" ~ '^[0-9a-f]{64}$' and "project_workspace_imports"."mapping_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "project_workspace_import_status" CHECK ("project_workspace_imports"."status" in ('PREVIEWED', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
	CONSTRAINT "project_workspace_import_versions" CHECK (("project_workspace_imports"."target_project_version" is null or "project_workspace_imports"."target_project_version" > 0) and ("project_workspace_imports"."target_workspace_version" is null or "project_workspace_imports"."target_workspace_version" > 0))
);
--> statement-breakpoint
ALTER TABLE "project_workspace_imports" ADD CONSTRAINT "project_workspace_imports_target_project_id_projects_id_fk" FOREIGN KEY ("target_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_workspace_imports" ADD CONSTRAINT "project_workspace_imports_data_job_id_data_jobs_id_fk" FOREIGN KEY ("data_job_id") REFERENCES "public"."data_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_workspace_imports" ADD CONSTRAINT "project_workspace_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_workspace_import_idempotency_uq" ON "project_workspace_imports" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "project_workspace_import_source_idx" ON "project_workspace_imports" USING btree ("source_hash","legacy_id");