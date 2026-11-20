import { and, eq, inArray, isNotNull, notInArray, or, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, productNotes, sections } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { authorize } from "../../lib/note-authorize";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import { COORD_MAX, coordSchema } from "../../lib/section-input";

// まとめて移動 POST /api/product/:productId/move
//
// 選択したカード・セクション・メモを、1 つのトランザクションでまとめて動かす(Figma の複数選択の移動)。
// - セクション・カードは、プロダクトリーダーだけ。メモは、変更できるもの(作成者。作成者が NULL ならリーダー)だけ
// - セクションを動かすと、所属する位置持ちのカードも同じ差分だけ動く(単体のセクション更新と同じ)。
//   ただし、本文で明示されたカードは、その絶対位置を優先する(二重に動かさない)
// - 1 つでも見つからない・権限がない・座標の上限を超えるなら、何も変えない(原子的)
// - 成功は 204。本文の配列は、1 つ以上が必要(すべて空なら 422)

const MAX_ITEMS = 500;

const sectionTarget = t.Object({
  sectionId: t.String({ format: "uuid" }),
  x: coordSchema(),
  y: coordSchema(),
});
const memberTarget = t.Object({
  memberId: t.String({ format: "uuid" }),
  positionX: coordSchema(),
  positionY: coordSchema(),
});
const noteTarget = t.Object({
  noteId: t.String({ format: "uuid" }),
  x: coordSchema(),
  y: coordSchema(),
});

const hasDuplicate = (ids: readonly string[]): boolean => new Set(ids).size !== ids.length;

export const moveSelection = new Elysia({ name: "section-move-selection" })
  .use(authGuard)
  .post(
    "/api/product/:productId/move",
    async ({ params, body, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });

      const sectionTargets = body.sections ?? [];
      const memberTargets = body.members ?? [];
      const noteTargets = body.notes ?? [];
      if (sectionTargets.length + memberTargets.length + noteTargets.length === 0) {
        return status(422, { message: "移動する項目を指定してください" });
      }
      if (sectionTargets.length > 0 || memberTargets.length > 0) {
        if (membership.role !== "leader") {
          return status(403, { message: "プロダクトリーダーのみ実行できます" });
        }
      }
      if (
        hasDuplicate(sectionTargets.map((s) => s.sectionId)) ||
        hasDuplicate(memberTargets.map((m) => m.memberId)) ||
        hasDuplicate(noteTargets.map((n) => n.noteId))
      ) {
        return status(422, { message: "同じ項目が複数回指定されています" });
      }

      const can = authorize({ userId: user.userId, role: membership.role });
      const explicitMemberIds = memberTargets.map((m) => m.memberId);

      // セクションの差分移動で一緒に動く、明示されていない所属カード(位置を持つもの)
      const implicitMembersWhere = (sectionId: string) =>
        and(
          eq(productMembers.sectionId, sectionId),
          isNotNull(productMembers.positionX),
          explicitMemberIds.length > 0
            ? notInArray(productMembers.productMemberId, explicitMemberIds)
            : undefined,
        );

      const result = await db.transaction(async (tx) => {
        // 1. 対象をすべて固定し、見つからない・権限がないを先に確かめる
        const currentSections = new Map<string, { x: number; y: number }>();
        if (sectionTargets.length > 0) {
          const rows = await tx
            .select({
              sectionId: sections.sectionId,
              x: sections.x,
              y: sections.y,
            })
            .from(sections)
            .where(
              and(
                eq(sections.productId, params.productId),
                inArray(sections.sectionId, sectionTargets.map((s) => s.sectionId)),
              ),
            )
            .for("update");
          if (rows.length !== sectionTargets.length) return { kind: "target-not-found" } as const;
          for (const row of rows) currentSections.set(row.sectionId, { x: row.x, y: row.y });
        }

        // 明示されたカードを固定する
        if (explicitMemberIds.length > 0) {
          const rows = await tx
            .select({ productMemberId: productMembers.productMemberId })
            .from(productMembers)
            .where(
              and(
                eq(productMembers.productId, params.productId),
                inArray(productMembers.productMemberId, explicitMemberIds),
              ),
            )
            .for("update");
          if (rows.length !== explicitMemberIds.length) return { kind: "target-not-found" } as const;
        }

        // メモを固定し、見えること・変更できることを確かめる(見えないメモは存在を漏らさない)
        if (noteTargets.length > 0) {
          const rows = await tx
            .select({
              noteId: productNotes.noteId,
              productId: productNotes.productId,
              isPublic: productNotes.isPublic,
              createdBy: productNotes.createdBy,
            })
            .from(productNotes)
            .where(inArray(productNotes.noteId, noteTargets.map((n) => n.noteId)))
            .for("update");
          if (rows.length !== noteTargets.length) return { kind: "note-not-found" } as const;
          for (const note of rows) {
            if (note.productId !== params.productId || (!note.isPublic && note.createdBy !== user.userId)) {
              return { kind: "note-not-found" } as const;
            }
            if (!can.canEdit(note)) return { kind: "note-forbidden" } as const;
          }
        }

        // 2. すべての移動を検証する。**更新の前に、範囲外が 1 つでもないか確かめる**
        //    (途中まで更新してから範囲外を見つけると、その前の更新が残ってしまう)
        const sectionMoves: { target: (typeof sectionTargets)[number]; dx: number; dy: number }[] = [];
        for (const target of sectionTargets) {
          const current = currentSections.get(target.sectionId);
          if (!current) return { kind: "target-not-found" } as const;
          const dx = target.x - current.x;
          const dy = target.y - current.y;
          sectionMoves.push({ target, dx, dy });
          if (dx === 0 && dy === 0) continue;
          const [over] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(productMembers)
            .where(
              and(
                implicitMembersWhere(target.sectionId),
                or(
                  sql`abs(${productMembers.positionX} + ${dx}) > ${COORD_MAX}`,
                  sql`abs(${productMembers.positionY} + ${dy}) > ${COORD_MAX}`,
                ),
              ),
            );
          if (over.n > 0) return { kind: "out-of-range" } as const;
        }

        // 3. 検証を通ったので、更新する(ここから先は失敗しない)
        // セクションと、所属する位置持ちのカードのうち、明示されていないものを同じ差分で動かす
        for (const { target, dx, dy } of sectionMoves) {
          if (dx !== 0 || dy !== 0) {
            await tx
              .update(productMembers)
              .set({
                positionX: sql`${productMembers.positionX} + ${dx}`,
                positionY: sql`${productMembers.positionY} + ${dy}`,
              })
              .where(implicitMembersWhere(target.sectionId));
          }

          await tx
            .update(sections)
            .set({ x: target.x, y: target.y })
            .where(eq(sections.sectionId, target.sectionId));
        }

        // 明示されたカードは、絶対位置で上書きする(セクションの差分移動との二重適用を避ける)
        for (const target of memberTargets) {
          await tx
            .update(productMembers)
            .set({ positionX: target.positionX, positionY: target.positionY })
            .where(
              and(
                eq(productMembers.productMemberId, target.memberId),
                eq(productMembers.productId, params.productId),
              ),
            );
        }

        for (const target of noteTargets) {
          await tx
            .update(productNotes)
            .set({ x: target.x, y: target.y, updatedAt: new Date() })
            .where(
              and(
                eq(productNotes.noteId, target.noteId),
                eq(productNotes.productId, params.productId),
              ),
            );
        }

        return { kind: "ok" } as const;
      });

      if (result.kind === "target-not-found") {
        return status(422, { message: "移動するセクションまたはカードが見つかりません" });
      }
      if (result.kind === "note-not-found") {
        return status(404, { message: "プロダクトまたはメモが見つかりません" });
      }
      if (result.kind === "note-forbidden") {
        return status(403, { message: "他の人のメモは変更できません" });
      }
      if (result.kind === "out-of-range") {
        return status(422, { message: "動かすと、カードの位置が範囲を超えます" });
      }
      return status(204, undefined);
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      body: t.Object({
        sections: t.Optional(t.Array(sectionTarget, { maxItems: MAX_ITEMS })),
        members: t.Optional(t.Array(memberTarget, { maxItems: MAX_ITEMS })),
        notes: t.Optional(t.Array(noteTarget, { maxItems: MAX_ITEMS })),
      }),
      response: {
        204: t.Void(),
        403: MessageSchema,
        404: MessageSchema,
        422: MessageSchema,
      },
      detail: {
        summary: "選択したセクション・カード・メモをまとめて移動",
      },
    },
  );
