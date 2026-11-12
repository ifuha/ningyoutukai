import { and, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productNotes, sections } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { authorize } from "../../lib/note-authorize";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";

// まとめて削除 POST /api/product/:productId/delete-selection
//
// 選択したセクションとメモを、1 つのトランザクションでまとめて削除する(複数選択の削除)。
// - セクションはプロダクトリーダーだけ。メモは、変更できるもの(作成者。作成者が NULL ならリーダー)だけ
// - 1 つでも見つからない・権限がないなら、何も消さない(原子的)
// - カード(メンバー)は削除しない。セクションを消したときは、所属していたカードを無所属に戻す(DB の ON DELETE SET NULL。位置は残る)
// - 成功は 204。本文の配列は、1 つ以上が必要(すべて空なら 422)

const MAX_ITEMS = 500;

const idList = t.Array(t.String({ format: "uuid" }), { maxItems: MAX_ITEMS });

const hasDuplicate = (ids: readonly string[]): boolean => new Set(ids).size !== ids.length;

export const deleteSelection = new Elysia({ name: "section-delete-selection" })
  .use(authGuard)
  .post(
    "/api/product/:productId/delete-selection",
    async ({ params, body, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });

      const sectionIds = body.sections ?? [];
      const noteIds = body.notes ?? [];
      if (sectionIds.length + noteIds.length === 0) {
        return status(422, { message: "削除する項目を指定してください" });
      }
      if (sectionIds.length > 0 && membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }
      if (hasDuplicate(sectionIds) || hasDuplicate(noteIds)) {
        return status(422, { message: "同じ項目が複数回指定されています" });
      }

      const can = authorize({ userId: user.userId, role: membership.role });

      const result = await db.transaction(async (tx) => {
        // 1. 対象をすべて固定し、見つからない・権限がないを先に確かめる
        if (sectionIds.length > 0) {
          const rows = await tx
            .select({ sectionId: sections.sectionId })
            .from(sections)
            .where(
              and(
                eq(sections.productId, params.productId),
                inArray(sections.sectionId, sectionIds),
              ),
            )
            .for("update");
          if (rows.length !== sectionIds.length) return { kind: "section-not-found" } as const;
        }

        // メモを固定し、見えること・変更できることを確かめる(見えないメモは存在を漏らさない)
        if (noteIds.length > 0) {
          const rows = await tx
            .select({
              noteId: productNotes.noteId,
              productId: productNotes.productId,
              isPublic: productNotes.isPublic,
              createdBy: productNotes.createdBy,
            })
            .from(productNotes)
            .where(inArray(productNotes.noteId, noteIds))
            .for("update");
          if (rows.length !== noteIds.length) return { kind: "note-not-found" } as const;
          for (const note of rows) {
            if (note.productId !== params.productId || (!note.isPublic && note.createdBy !== user.userId)) {
              return { kind: "note-not-found" } as const;
            }
            if (!can.canEdit(note)) return { kind: "note-forbidden" } as const;
          }
        }

        // 2. 検証を通ったので、削除する(ここから先は失敗しない)
        if (noteIds.length > 0) {
          await tx
            .delete(productNotes)
            .where(and(eq(productNotes.productId, params.productId), inArray(productNotes.noteId, noteIds)));
        }
        if (sectionIds.length > 0) {
          await tx
            .delete(sections)
            .where(and(eq(sections.productId, params.productId), inArray(sections.sectionId, sectionIds)));
        }

        return { kind: "ok" } as const;
      });

      if (result.kind === "section-not-found") {
        return status(404, { message: "プロダクトまたはセクションが見つかりません" });
      }
      if (result.kind === "note-not-found") {
        return status(404, { message: "プロダクトまたはメモが見つかりません" });
      }
      if (result.kind === "note-forbidden") {
        return status(403, { message: "他の人のメモは削除できません" });
      }
      return status(204, undefined);
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      body: t.Object({
        sections: t.Optional(idList),
        notes: t.Optional(idList),
      }),
      response: {
        204: t.Void(),
        403: MessageSchema,
        404: MessageSchema,
        422: MessageSchema,
      },
      detail: {
        summary: "選択したセクション・メモをまとめて削除",
      },
    },
  );
