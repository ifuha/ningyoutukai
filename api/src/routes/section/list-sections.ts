import { and, asc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { sections } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import { SectionSchema, sectionColumns, withMemberIds } from "../../lib/section-view";
import { softDelete } from "../../lib/soft-delete";

// セクション一覧取得 GET /api/product/:productId/section(プロダクトのメンバーなら誰でも)
// soft delete 中のセクションは、ここには出さない
export const listSections = new Elysia({ name: "section-list" })
  .use(authGuard)
  .use(softDelete)
  .get(
    "/api/product/:productId/section",
    async ({ params, user, softDelete, status }) => {
      const viewer = await getMembership(params.productId, user.userId);
      if (!viewer) return status(404, { message: "プロダクトが見つかりません" });

      const rows = await db
        .select(sectionColumns)
        .from(sections)
        .where(and(eq(sections.productId, params.productId), softDelete.liveSection))
        // 名前順。名前は同じプロダクトの中で一意だが、並びを確実に固定するため sectionId も見る
        .orderBy(asc(sections.sectionName), asc(sections.sectionId));

      return await withMemberIds(db, rows);
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      response: { 200: t.Array(SectionSchema), 404: MessageSchema },
      detail: { summary: "セクション一覧取得" },
    },
  );
