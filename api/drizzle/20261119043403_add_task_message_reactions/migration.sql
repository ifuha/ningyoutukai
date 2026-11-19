CREATE TABLE "task_message_reactions" (
	"message_id" uuid,
	"member_id" uuid,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_message_reactions_pkey" PRIMARY KEY("message_id","member_id"),
	CONSTRAINT "task_message_reactions_emoji_check" CHECK ("emoji" IN ('👍','🎉','👀','✅','❓'))
);
--> statement-breakpoint
CREATE INDEX "task_message_reactions_message_idx" ON "task_message_reactions" ("message_id");--> statement-breakpoint
ALTER TABLE "task_message_reactions" ADD CONSTRAINT "task_message_reactions_message_id_task_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "task_messages"("message_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_message_reactions" ADD CONSTRAINT "task_message_reactions_bhn8Wy1AczQU_fkey" FOREIGN KEY ("member_id") REFERENCES "product_members"("product_member_id") ON DELETE CASCADE;