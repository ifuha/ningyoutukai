CREATE TABLE "task_messages" (
	"message_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"task_id" uuid NOT NULL,
	"author_member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status" text DEFAULT 'in_progress' NOT NULL;--> statement-breakpoint
CREATE INDEX "task_messages_task_idx" ON "task_messages" ("task_id","created_at");--> statement-breakpoint
ALTER TABLE "task_messages" ADD CONSTRAINT "task_messages_task_id_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("task_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_messages" ADD CONSTRAINT "task_messages_bkqtsYjpmhUi_fkey" FOREIGN KEY ("author_member_id") REFERENCES "product_members"("product_member_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check" CHECK ("status" IN ('in_progress','reported','rejected','completed'));