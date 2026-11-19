CREATE TABLE "task_reads" (
	"task_id" uuid,
	"member_id" uuid,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_reads_pkey" PRIMARY KEY("task_id","member_id")
);
--> statement-breakpoint
CREATE INDEX "task_reads_member_idx" ON "task_reads" ("member_id");--> statement-breakpoint
ALTER TABLE "task_reads" ADD CONSTRAINT "task_reads_task_id_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("task_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_reads" ADD CONSTRAINT "task_reads_member_id_product_members_product_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "product_members"("product_member_id") ON DELETE CASCADE;