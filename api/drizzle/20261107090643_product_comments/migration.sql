CREATE TABLE "product_comments" (
	"comment_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_comments_comment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" uuid NOT NULL,
	"created_by" uuid,
	"content" text DEFAULT '' NOT NULL,
	"x" double precision DEFAULT 0 NOT NULL,
	"y" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "product_comments_product_id_idx" ON "product_comments" ("product_id");--> statement-breakpoint
CREATE INDEX "product_comments_created_by_idx" ON "product_comments" ("created_by");--> statement-breakpoint
ALTER TABLE "product_comments" ADD CONSTRAINT "product_comments_product_id_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_comments" ADD CONSTRAINT "product_comments_created_by_users_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL;