CREATE TABLE "task_report_drafts" (
	"draft_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"task_id" uuid NOT NULL,
	"ai_token_id" uuid,
	"ai_name" text NOT NULL,
	"body" text NOT NULL,
	"read_documents" jsonb DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"adopted_message_id" uuid,
	CONSTRAINT "task_report_drafts_status_check" CHECK ("status" IN ('pending', 'adopted', 'discarded')),
	CONSTRAINT "task_report_drafts_body_length_check" CHECK (char_length("body") BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE INDEX "task_report_drafts_task_idx" ON "task_report_drafts" ("task_id","created_at");--> statement-breakpoint
ALTER TABLE "task_report_drafts" ADD CONSTRAINT "task_report_drafts_task_id_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("task_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_report_drafts" ADD CONSTRAINT "task_report_drafts_ai_token_id_ai_tokens_token_id_fkey" FOREIGN KEY ("ai_token_id") REFERENCES "ai_tokens"("token_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "task_report_drafts" ADD CONSTRAINT "task_report_drafts_decided_by_users_user_id_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("user_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "task_report_drafts" ADD CONSTRAINT "task_report_drafts_dHRnOtz6mdyw_fkey" FOREIGN KEY ("adopted_message_id") REFERENCES "task_messages"("message_id") ON DELETE SET NULL;