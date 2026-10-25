CREATE TABLE "sections" (
	"section_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"product_id" uuid NOT NULL,
	"section_name" text NOT NULL,
	"color" text NOT NULL,
	"x" double precision DEFAULT 0 NOT NULL,
	"y" double precision DEFAULT 0 NOT NULL,
	"width" double precision DEFAULT 300 NOT NULL,
	"height" double precision DEFAULT 400 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sections_product_name_unique" UNIQUE("product_id","section_name"),
	CONSTRAINT "sections_color_check" CHECK ("color" IN ('red','yellow','green','purple','lightblue','blue')),
	CONSTRAINT "sections_size_check" CHECK ("width" > 0 AND "height" > 0),
	CONSTRAINT "sections_geometry_finite_check" CHECK ("x" > '-Infinity' AND "x" < 'Infinity'
        AND "y" > '-Infinity' AND "y" < 'Infinity'
        AND "width" < 'Infinity' AND "height" < 'Infinity')
);
--> statement-breakpoint
ALTER TABLE "product_members" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "product_members" ADD COLUMN "position_x" double precision;--> statement-breakpoint
ALTER TABLE "product_members" ADD COLUMN "position_y" double precision;--> statement-breakpoint
CREATE INDEX "product_members_section_idx" ON "product_members" ("section_id");--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_product_id_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_members" ADD CONSTRAINT "product_members_section_id_sections_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("section_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "product_members" ADD CONSTRAINT "product_members_position_pair_check" CHECK (("position_x" IS NULL) = ("position_y" IS NULL));--> statement-breakpoint
ALTER TABLE "product_members" ADD CONSTRAINT "product_members_position_finite_check" CHECK (("position_x" IS NULL OR ("position_x" > '-Infinity' AND "position_x" < 'Infinity'))
        AND ("position_y" IS NULL OR ("position_y" > '-Infinity' AND "position_y" < 'Infinity')));