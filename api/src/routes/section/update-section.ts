import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, sections } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import {
  COORD_MAX,
  SECTION_NAME_ERROR,
  coordSchema,
  normalizeSectionName,
  sectionColorSchema,
  sectionNameSchema,
  sizeSchema,
} from "../../lib/section-input";
import { SectionSchema, sectionColumns, withMemberIds } from "../../lib/section-view";
import { isUniqueViolation } from "../../lib/task-kind";

// セクション更新 PATCH /api/product/:productId/section/:sectionId(リーダーのみ)
// 名前・色・位置・大きさを、一部だけ変えられる。
// 位置(x・y)が変わるときは、所属メンバーのうち位置を持つカードを、同じ差分だけ一緒に動かす(Figma と同じ)。
// 大きさ(width・height)の変更では、カードは動かさない。
export const updateSection = new Elysia({ name: "section-update" })
  .use(authGuard)
  .patch(
    "/api/product/:productId/section/:sectionId",
    async ({ params, body, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      if (Object.values(body).every((v) => v === undefined)) {
        return status(422, { message: "変更する項目を指定してください" });
      }

      let sectionName: string | undefined;
      if (body.sectionName !== undefined) {
        const normalized = normalizeSectionName(body.sectionName);
        if (!normalized) return status(422, { message: SECTION_NAME_ERROR });
        sectionName = normalized;
      }

      try {
        // セクションの更新と、カードの移動は、同じトランザクション(どちらかが失敗したら、どちらも反映しない)
        const result = await db.transaction(async (tx) => {
          // 行を固定して、同時に動かされても、差分(dx・dy)を、読んだ位置から正しく計算する
          const [current] = await tx
            .select(sectionColumns)
            .from(sections)
            .where(and(eq(sections.sectionId, params.sectionId), eq(sections.productId, params.productId)))
            .for("update");
          if (!current) return { kind: "not-found" } as const;

          const dx = body.x === undefined ? 0 : body.x - current.x;
          const dy = body.y === undefined ? 0 : body.y - current.y;

          if (dx !== 0 || dy !== 0) {
            const inSection = and(
              eq(productMembers.sectionId, current.sectionId),
              isNotNull(productMembers.positionX),
            );

            // 動かした先が、座標の上限を超えるカードがあれば、何も変えずに断る
            const [over] = await tx
              .select({ n: sql<number>`count(*)::int` })
              .from(productMembers)
              .where(
                and(
                  inSection,
                  or(
                    sql`abs(${productMembers.positionX} + ${dx}) > ${COORD_MAX}`,
                    sql`abs(${productMembers.positionY} + ${dy}) > ${COORD_MAX}`,
                  ),
                ),
              );
            if (over.n > 0) return { kind: "out-of-range" } as const;

            // カードを先に動かす。このあとのセクションの更新(名前の重複など)が失敗したら、ロールバックされる
            await tx
              .update(productMembers)
              .set({
                positionX: sql`${productMembers.positionX} + ${dx}`,
                positionY: sql`${productMembers.positionY} + ${dy}`,
              })
              .where(inSection);
          }

          const [updated] = await tx
            .update(sections)
            .set({
              sectionName,
              color: body.color,
              x: body.x,
              y: body.y,
              width: body.width,
              height: body.height,
            })
            .where(eq(sections.sectionId, current.sectionId))
            .returning(sectionColumns);

          const [withMembers] = await withMemberIds(tx, [updated]);
          return { kind: "updated", section: withMembers } as const;
        });

        if (result.kind === "not-found") return status(404, { message: "セクションが見つかりません" });
        if (result.kind === "out-of-range") {
          return status(422, { message: "動かすと、カードの位置が範囲を超えます" });
        }
        return status(200, result.section);
      } catch (e) {
        if (isUniqueViolation(e)) return status(409, { message: "同じ名前のセクションがすでにあります" });
        throw e;
      }
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        sectionId: t.String({ format: "uuid" }),
      }),
      body: t.Object({
        sectionName: t.Optional(sectionNameSchema()),
        color: t.Optional(sectionColorSchema()),
        x: t.Optional(coordSchema()),
        y: t.Optional(coordSchema()),
        width: t.Optional(sizeSchema()),
        height: t.Optional(sizeSchema()),
      }),
      response: {
        200: SectionSchema,
        403: MessageSchema,
        404: MessageSchema,
        409: MessageSchema,
        422: MessageSchema,
      },
      detail: { summary: "セクション更新(リーダー)。位置を変えると、所属メンバーのカードも一緒に動く" },
    },
  );
