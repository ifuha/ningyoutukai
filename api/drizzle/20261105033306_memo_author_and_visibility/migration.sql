ALTER TABLE "product_notes" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "product_notes" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "product_notes_created_by_idx" ON "product_notes" ("created_by");--> statement-breakpoint
ALTER TABLE "product_notes" ADD CONSTRAINT "product_notes_created_by_users_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL;