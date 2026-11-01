import { Elysia, t } from "elysia";
import { authGuard } from "../../lib/auth-guard";
import { autoAssign } from "../../lib/auto-assign-plugin";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";

// 担当者の提案 POST /api/product/:productId/task/suggest-assignee(リーダーのみ)
// Jev(外部 API)に聞くだけで、何も書き換えない。確定は PATCH .../task/assignee(docs/v3.0/jev-assign.md)
export const suggestAssignee = new Elysia({ name: "task-suggest-assignee" })
  .use(authGuard)
  .use(autoAssign)
  .post(
    "/api/product/:productId/task/suggest-assignee",
    async ({ params, body, user, status, autoAssign }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      const result = await autoAssign.suggest({ productId: params.productId, ...body });
      if (!result.ok) return status(result.status, { message: result.message });
      return {
        model: result.model,
        inputTokens: result.inputTokens,
        assignments: result.assignments,
        skipped: result.skipped,
      };
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      body: t.Object({
        taskIds: t.Optional(t.Array(t.String({ format: "uuid" }), { minItems: 1, maxItems: 100 })),
        excludeMemberIds: t.Optional(t.Array(t.String({ format: "uuid" }), { maxItems: 100 })),
        maxPerMember: t.Optional(t.Integer({ minimum: 1 })),
        minConfidence: t.Optional(t.Number({ minimum: 0, maximum: 1 })),
      }),
      response: {
        200: t.Object({
          model: t.String(),
          inputTokens: t.Number(),
          assignments: t.Array(
            t.Object({
              taskId: t.String(),
              taskName: t.String(),
              currentMemberId: t.String(),
              proposedMemberId: t.String(),
              probability: t.Number(),
              confidence: t.Union([t.Number(), t.Null()]),
              changed: t.Boolean(),
              alternatives: t.Array(t.Object({ memberId: t.String(), probability: t.Number() })),
            }),
          ),
          skipped: t.Array(
            t.Object({
              taskId: t.String(),
              taskName: t.String(),
              reason: t.UnionEnum(["private", "low-confidence", "capacity", "no-answer"]),
            }),
          ),
        }),
        400: MessageSchema,
        403: MessageSchema,
        404: MessageSchema,
        502: MessageSchema,
        503: MessageSchema,
      },
      detail: { summary: "担当者の提案(Jev)" },
    },
  );
