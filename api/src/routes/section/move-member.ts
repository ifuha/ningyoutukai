import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, sections } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import { coordSchema } from "../../lib/section-input";

// カードの移動 PATCH /api/product/:productId/member/:memberId/position(リーダーのみ)
// 位置(絶対座標)と、所属するセクションを変える。メンバーは、自分のカードも動かせない。
// `sectionId` を省略すると、所属は変えない。null で、無所属に戻す。
//
// 「同じプロダクトのセクションにしか入れない」は、DB では守れない(複合外部キーだと ON DELETE SET NULL を
// 列指定で書く必要があり、drizzle で表せない)。ここで必ず確かめる。
export const moveMember = new Elysia({ name: "section-move-member" })
  .use(authGuard)
  .patch(
    "/api/product/:productId/member/:memberId/position",
    async ({ params, body, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      // URL のプロダクトに属するメンバーだけを対象にする(別プロダクトのメンバーは存在しない扱い)
      const [target] = await db
        .select({ productMemberId: productMembers.productMemberId })
        .from(productMembers)
        .where(
          and(
            eq(productMembers.productMemberId, params.memberId),
            eq(productMembers.productId, params.productId),
          ),
        );
      if (!target) return status(404, { message: "メンバーが見つかりません" });

      const result = await db.transaction(async (tx) => {
        if (body.sectionId) {
          // 同じプロダクトのセクションか確かめる。行を固定して、セクションの移動(カードの連動)と
          // 行き違いにならないようにする
          const [section] = await tx
            .select({ sectionId: sections.sectionId })
            .from(sections)
            .where(and(eq(sections.sectionId, body.sectionId), eq(sections.productId, params.productId)))
            .for("update");
          if (!section) return { kind: "section-not-found" } as const;
        }

        const [updated] = await tx
          .update(productMembers)
          .set({
            positionX: body.positionX,
            positionY: body.positionY,
            // 省略(undefined)のときは、所属を変えない
            ...(body.sectionId !== undefined ? { sectionId: body.sectionId } : {}),
          })
          .where(
            and(
              eq(productMembers.productMemberId, target.productMemberId),
              eq(productMembers.productId, params.productId),
            ),
          )
          .returning({
            productMemberId: productMembers.productMemberId,
            sectionId: productMembers.sectionId,
            positionX: productMembers.positionX,
            positionY: productMembers.positionY,
          });
        // 確認から更新までの間に、メンバーが外れた場合
        if (!updated) return { kind: "member-not-found" } as const;
        return { kind: "moved", member: updated } as const;
      });

      if (result.kind === "member-not-found") return status(404, { message: "メンバーが見つかりません" });
      // 本文の中の参照が見つからないので、入力の不正(422)にする。URL のパスが見つからない(404)とは区別する。
      // 別のプロダクトのセクションも、存在しないセクションと同じ扱い(存在を漏らさない)
      if (result.kind === "section-not-found") {
        return status(422, { message: "セクションが見つかりません" });
      }
      // 位置は、この更新で必ず値が入る(CHECK で、片方だけ NULL にはならない)
      return status(200, {
        productMemberId: result.member.productMemberId,
        sectionId: result.member.sectionId,
        positionX: result.member.positionX as number,
        positionY: result.member.positionY as number,
      });
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        memberId: t.String({ format: "uuid" }),
      }),
      body: t.Object({
        positionX: coordSchema(),
        positionY: coordSchema(),
        sectionId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
      }),
      response: {
        200: t.Object({
          productMemberId: t.String(),
          sectionId: t.Union([t.String(), t.Null()]),
          positionX: t.Number(),
          positionY: t.Number(),
        }),
        403: MessageSchema,
        404: MessageSchema,
        422: MessageSchema,
      },
      detail: { summary: "カードの移動(リーダー)。位置と、所属するセクションを変える" },
    },
  );
