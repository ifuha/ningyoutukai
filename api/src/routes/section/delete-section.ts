import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { sections } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";

// セクション削除 DELETE /api/product/:productId/section/:sectionId(リーダーのみ)
// 所属していたメンバーは、DB の ON DELETE SET NULL で無所属に戻る。メンバーとカードの位置は残る。
export const deleteSection = new Elysia({ name: "section-delete" })
  .use(authGuard)
  .delete(
    "/api/product/:productId/section/:sectionId",
    async ({ params, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      // URL のプロダクトに属するセクションだけを対象にする(別プロダクトのセクションは存在しない扱い)。
      // 同時に削除されて既に無い場合も、0 件になって 404
      const deleted = await db
        .delete(sections)
        .where(and(eq(sections.sectionId, params.sectionId), eq(sections.productId, params.productId)))
        .returning({ sectionId: sections.sectionId });
      if (deleted.length === 0) return status(404, { message: "セクションが見つかりません" });

      return status(204, undefined);
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        sectionId: t.String({ format: "uuid" }),
      }),
      response: { 204: t.Undefined(), 403: MessageSchema, 404: MessageSchema },
      detail: { summary: "セクション削除(リーダー)" },
    },
  );
