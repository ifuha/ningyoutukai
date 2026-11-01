import { Elysia, t } from "elysia";
import { authGuard } from "../../lib/auth-guard";
import { autoAssign } from "../../lib/auto-assign-plugin";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";

// 担当の付け替え(確定) PATCH /api/product/:productId/task/assignee(リーダーのみ)
// 全件を 1 つのトランザクションで書く。1 件でも条件に合わなければ、何も書き換えない(docs/v3.0/jev-assign.md)
export const assignAssignee = new Elysia({ name: "task-assign-assignee" })
  .use(authGuard)
  .use(autoAssign)
  .patch(
    "/api/product/:productId/task/assignee",
    async ({ params, body, user, status, autoAssign }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      const result = await autoAssign.apply({
        productId: params.productId,
        actorMemberId: membership.productMemberId,
        assignments: body.assignments,
      });
      if (!result.ok) return status(result.status, { message: result.message });
      return { changed: result.changed, unchanged: result.unchanged };
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      body: t.Object({
        assignments: t.Array(
          t.Object({ taskId: t.String({ format: "uuid" }), productMemberId: t.String({ format: "uuid" }) }),
          { minItems: 1, maxItems: 100 },
        ),
      }),
      response: {
        200: t.Object({
          changed: t.Array(
            t.Object({ taskId: t.String(), fromMemberId: t.String(), toMemberId: t.String() }),
          ),
          unchanged: t.Number(),
        }),
        400: MessageSchema,
        403: MessageSchema,
        404: MessageSchema,
        409: MessageSchema,
      },
      detail: { summary: "担当の付け替え(確定)" },
    },
  );
