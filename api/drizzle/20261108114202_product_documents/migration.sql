CREATE TYPE "document_permission" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TABLE "directory_permissions" (
	"directory_id" uuid,
	"product_member_id" uuid,
	"level" "document_permission" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_permissions_pkey" PRIMARY KEY("directory_id","product_member_id")
);
--> statement-breakpoint
CREATE TABLE "document_locks" (
	"document_id" uuid PRIMARY KEY,
	"product_member_id" uuid NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_directories" (
	"directory_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_directories_product_name_unique" UNIQUE("product_id","name"),
	CONSTRAINT "product_directories_name_length_check" CHECK (char_length("name") BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "product_document_versions" (
	"document_id" uuid,
	"version" integer,
	"r2_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_document_versions_pkey" PRIMARY KEY("document_id","version"),
	CONSTRAINT "product_document_versions_version_check" CHECK ("version" >= 1),
	CONSTRAINT "product_document_versions_size_check" CHECK ("size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_documents" (
	"document_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"product_id" uuid NOT NULL,
	"directory_id" uuid NOT NULL,
	"name" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"keep_forever" boolean DEFAULT false NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_documents_directory_name_unique" UNIQUE("directory_id","name"),
	CONSTRAINT "product_documents_name_length_check" CHECK (char_length("name") BETWEEN 1 AND 100),
	CONSTRAINT "product_documents_version_check" CHECK ("current_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "task_directories" (
	"task_id" uuid,
	"directory_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_directories_pkey" PRIMARY KEY("task_id","directory_id")
);
--> statement-breakpoint
CREATE TABLE "task_documents" (
	"task_id" uuid,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_documents_pkey" PRIMARY KEY("task_id","document_id")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "document_auto_delete_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
CREATE INDEX "directory_permissions_member_idx" ON "directory_permissions" ("product_member_id");--> statement-breakpoint
CREATE INDEX "document_locks_member_idx" ON "document_locks" ("product_member_id");--> statement-breakpoint
CREATE INDEX "product_documents_product_id_idx" ON "product_documents" ("product_id");--> statement-breakpoint
CREATE INDEX "task_directories_directory_idx" ON "task_directories" ("directory_id");--> statement-breakpoint
CREATE INDEX "task_documents_document_idx" ON "task_documents" ("document_id");--> statement-breakpoint
ALTER TABLE "directory_permissions" ADD CONSTRAINT "directory_permissions_jacjmGrK7joS_fkey" FOREIGN KEY ("directory_id") REFERENCES "product_directories"("directory_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "directory_permissions" ADD CONSTRAINT "directory_permissions_3pH8NvGbB1Ay_fkey" FOREIGN KEY ("product_member_id") REFERENCES "product_members"("product_member_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "document_locks" ADD CONSTRAINT "document_locks_document_id_product_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "product_documents"("document_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "document_locks" ADD CONSTRAINT "document_locks_uuqC7Fouec6k_fkey" FOREIGN KEY ("product_member_id") REFERENCES "product_members"("product_member_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_directories" ADD CONSTRAINT "product_directories_product_id_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_directories" ADD CONSTRAINT "product_directories_created_by_users_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "product_document_versions" ADD CONSTRAINT "product_document_versions_Za8Ck2KOLJt4_fkey" FOREIGN KEY ("document_id") REFERENCES "product_documents"("document_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_document_versions" ADD CONSTRAINT "product_document_versions_created_by_users_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "product_documents" ADD CONSTRAINT "product_documents_product_id_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_documents" ADD CONSTRAINT "product_documents_tqOQ3EZ0dCVS_fkey" FOREIGN KEY ("directory_id") REFERENCES "product_directories"("directory_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "product_documents" ADD CONSTRAINT "product_documents_created_by_users_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "task_directories" ADD CONSTRAINT "task_directories_task_id_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("task_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_directories" ADD CONSTRAINT "task_directories_4uNcKLHyGTv7_fkey" FOREIGN KEY ("directory_id") REFERENCES "product_directories"("directory_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_documents" ADD CONSTRAINT "task_documents_task_id_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("task_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_documents" ADD CONSTRAINT "task_documents_document_id_product_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "product_documents"("document_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_document_auto_delete_days_check" CHECK ("document_auto_delete_days" BETWEEN 1 AND 3650);