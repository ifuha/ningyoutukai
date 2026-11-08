CREATE TABLE "product_ai_positions" (
	"product_id" uuid,
	"token_id" uuid,
	"offset_x" double precision NOT NULL,
	"offset_y" double precision NOT NULL,
	CONSTRAINT "product_ai_positions_pkey" PRIMARY KEY("product_id","token_id"),
	CONSTRAINT "product_ai_positions_finite_check" CHECK ("offset_x" > '-Infinity' AND "offset_x" < 'Infinity' AND "offset_y" > '-Infinity' AND "offset_y" < 'Infinity')
);
--> statement-breakpoint
ALTER TABLE "product_ai_positions" ADD CONSTRAINT "product_ai_positions_product_id_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_ai_positions" ADD CONSTRAINT "product_ai_positions_token_id_ai_tokens_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "ai_tokens"("token_id") ON DELETE CASCADE;