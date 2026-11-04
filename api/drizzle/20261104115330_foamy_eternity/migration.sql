CREATE TABLE "product_notes" (
	"note_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"product_id" uuid NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"x" double precision DEFAULT 0 NOT NULL,
	"y" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_notes_content_length_check" CHECK (char_length("content") <= 2000),
	CONSTRAINT "product_notes_geometry_finite_check" CHECK ("x" > '-Infinity' AND "x" < 'Infinity' AND "y" > '-Infinity' AND "y" < 'Infinity')
);
--> statement-breakpoint
ALTER TABLE "product_notes" ADD CONSTRAINT "product_notes_product_id_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE;