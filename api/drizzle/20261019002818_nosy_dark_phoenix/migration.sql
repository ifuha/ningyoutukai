CREATE TYPE "invitation_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "invitee_type" AS ENUM('github', 'gmail');--> statement-breakpoint
CREATE TYPE "member_role" AS ENUM('leader', 'member');--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"avatar_url" text,
	"github_id" text UNIQUE,
	"google_sub" text UNIQUE
);
--> statement-breakpoint
CREATE TABLE "products" (
	"product_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"product_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_members" (
	"product_member_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"product_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member'::"member_role" NOT NULL,
	CONSTRAINT "product_members_product_id_user_id_unique" UNIQUE("product_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "product_invitations" (
	"invitation_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid,
	"product_id" uuid NOT NULL,
	"invitee_identifier" text NOT NULL,
	"invitee_type" "invitee_type" NOT NULL,
	"status" "invitation_status" DEFAULT 'pending'::"invitation_status" NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_types" (
	"task_type_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"task_type_name" text NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "task_types_product_id_task_type_name_unique" UNIQUE("product_id","task_type_name")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"task_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"task_name" text NOT NULL,
	"description" text,
	"time_limit" timestamp with time zone,
	"reported_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"task_type_id" uuid,
	"product_member_id" uuid NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
DROP TABLE "items";--> statement-breakpoint
CREATE INDEX "product_invitations_user_status_idx" ON "product_invitations" ("user_id","status");--> statement-breakpoint
CREATE INDEX "tasks_member_idx" ON "tasks" ("product_member_id");--> statement-breakpoint
ALTER TABLE "product_members" ADD CONSTRAINT "product_members_product_id_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_members" ADD CONSTRAINT "product_members_user_id_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_invitations" ADD CONSTRAINT "product_invitations_user_id_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_invitations" ADD CONSTRAINT "product_invitations_product_id_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_types" ADD CONSTRAINT "task_types_product_id_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_task_type_id_task_types_task_type_id_fkey" FOREIGN KEY ("task_type_id") REFERENCES "task_types"("task_type_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_product_member_id_product_members_product_member_id_fkey" FOREIGN KEY ("product_member_id") REFERENCES "product_members"("product_member_id") ON DELETE CASCADE;