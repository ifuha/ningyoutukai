import { Elysia, t } from "elysia";
import { db } from "../../db";
import { sections } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import {
  SECTION_NAME_ERROR,
  coordSchema,
  normalizeSectionName,
  sectionColorSchema,
  sectionNameSchema,
  sizeSchema,
} from "../../lib/section-input";
import { SectionSchema, sectionColumns } from "../../lib/section-view";
import { isUniqueViolation } from "../../lib/task-kind";

// セクション作成 POST /api/product/:productId/section(リーダーのみ)
export const createSection = new Elysia({ name: "section-create" })
  .use(authGuard)
  .post(
    "/api/product/:productId/section",
    async ({ params, body, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      const sectionName = normalizeSectionName(body.sectionName);
      if (!sectionName) return status(422, { message: SECTION_NAME_ERROR });

      try {
        const [created] = await db
          .insert(sections)
          .values({
            productId: params.productId,
            sectionName,
            color: body.color,
            // 省略した値は、DB の既定(x・y は 0、大きさは 300×400)になる
            x: body.x,
            y: body.y,
            width: body.width,
            height: body.height,
          })
          .returning(sectionColumns);
        return status(201, { ...created, memberIds: [] });
      } catch (e) {
        // 同時に同じ名前で作られた場合は、事前の確認をすり抜けて、DB の一意制約が止める
        if (isUniqueViolation(e)) return status(409, { message: "同じ名前のセクションがすでにあります" });
        throw e;
      }
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      body: t.Object({
        sectionName: sectionNameSchema(),
        color: sectionColorSchema(),
        x: t.Optional(coordSchema()),
        y: t.Optional(coordSchema()),
        width: t.Optional(sizeSchema()),
        height: t.Optional(sizeSchema()),
      }),
      response: {
        201: SectionSchema,
        403: MessageSchema,
        404: MessageSchema,
        409: MessageSchema,
        422: MessageSchema,
      },
      detail: { summary: "セクション作成(リーダー)" },
    },
  );
