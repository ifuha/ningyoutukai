ALTER TABLE "task_message_reactions" DROP CONSTRAINT "task_message_reactions_pkey";--> statement-breakpoint
ALTER TABLE "task_message_reactions" ADD PRIMARY KEY ("message_id","member_id","emoji");