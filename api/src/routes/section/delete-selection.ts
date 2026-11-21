import { and, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productNotes, sections } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import { softDelete } from "../../lib/soft-delete";

const MAX_ITEMS = 500;

// 複数削除(セクション・メモ)の一括削除 POST /api/product/:productId/delete-selection
// - リーダーのみ(セクションは既存セクション削除と同じ)
// - セクション・メモを**論理削除**(`deletedAt` に日時。行は残す)。一覧の GET(セクション・メモ)は、これを返さない
// - 10分経っても行は残る。API の定期ジョブ(`cleanupExpiredDeletions`)が物理削除する
// - 配列は省略でき、1 つ以上が必要(すべて空なら 422)。見つからないものは 404、成功は 204(戻り値なし)
export const deleteSelection = new Elysia({ name: "section-delete-selection" })
  .use(authGuard)
  .use(softDelete)
  .post(
    "/api/product/:productId/delete-selection",
    async ({ params, body, user, softDelete, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      const sectionIds = body.sectionIds ?? [];
      const noteIds = body.noteIds ?? [];
      if (sectionIds.length === 0 && noteIds.length === 0) {
        return status(422, { message: "削除する項目を指定してください" });
      }

      // 論理削除(deletedAt を入れる。行は残す)
      const now = new Date();
      let deleted = 0;
      if (sectionIds.length > 0) {
        deleted += (
          await db
            .update(sections)
            .set({ deletedAt: now })
            .where(and(eq(sections.productId, params.productId), inArray(sections.sectionId, sectionIds), softDelete.liveSection))
            .returning({ sectionId: sections.sectionId })
        ).length;
      }
      if (noteIds.length > 0) {
        deleted += (
          await db
            .update(productNotes)
            .set({ deletedAt: now })
            .where(and(eq(productNotes.productId, params.productId), inArray(productNotes.noteId, noteIds), softDelete.liveNote))
            .returning({ noteId: productNotes.noteId })
        ).length;
      }
      if (deleted === 0) return status(404, { message: "削除する項目が見つかりません" });
      return status(204, undefined);
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      body: t.Object({
        sectionIds: t.Optional(t.Array(t.String({ format: "uuid" }), { maxItems: MAX_ITEMS })),
        noteIds: t.Optional(t.Array(t.String({ format: "uuid" }), { maxItems: MAX_ITEMS })),
      }),
      response: { 204: t.Undefined(), 403: MessageSchema, 404: MessageSchema, 422: MessageSchema },
      detail: { summary: "複数のセクション・メモの一括論理削除(リーダー)" },
    },
  );
