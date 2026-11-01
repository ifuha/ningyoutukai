import { and, asc, eq, sql } from "drizzle-orm";
import { Elysia, t, type Static } from "elysia";
import { db } from "../../db";
import { productMembers, products, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { MessageSchema } from "../../lib/response-schema";
import { type TaskStatus } from "../../lib/task-flow";
import { TaskSchema, notCompleted, taskColumns } from "../../lib/task-view";

// 状態のクエリ。`t.UnionEnum` は、省略されたクエリを先頭の値(in_progress)で補ってしまう(省略が「作業中だけ」になる)ので、
// リテラルの Union で書く。`taskStatuses` と食い違ったら、下の確認がコンパイルエラーになる
const statusQuerySchema = t.Union([
  t.Literal("in_progress"),
  t.Literal("reported"),
  t.Literal("rejected"),
  t.Literal("completed"),
]);
type StatusQuery = Static<typeof statusQuerySchema>;
const statusListsMatch: [TaskStatus] extends [StatusQuery]
  ? [StatusQuery] extends [TaskStatus]
    ? true
    : never
  : never = true;
void statusListsMatch;

// 自分に割り振られたタスクを、全プロダクトをまたいで取得 GET /api/me/task(CLI の `tasks` が使う)
// プロダクトごとに呼ぶと、プロダクトの数だけリクエストが増える(本番は CPU 制限が厳しい)ので、1 回で返す。
// 自分が担当のタスクは、非表示(isVisible = false)でも本人には見える(要件 4-2)ので、可視性の絞り込みは要らない。
//
// 絞り込み(クエリ):
// - productId: そのプロダクトのタスクだけ
// - status: その状態のタスクだけ(指定したときは、includeCompleted を見ない)
// - includeCompleted: 指定がなければ、完了したタスクは出さない(既存の一覧 API と同じ)
// 並び: 期限の昇順(期限なしは最後)、同じ期限なら taskId の昇順
export const listMyTasks = new Elysia({ name: "me-list-my-tasks" })
  .use(authGuard)
  .get(
    "/api/me/task",
    async ({ query, user }) => {
      return await db
        .select({ ...taskColumns, productId: products.productId, productName: products.productName })
        .from(tasks)
        .innerJoin(productMembers, eq(tasks.productMemberId, productMembers.productMemberId))
        .innerJoin(products, eq(productMembers.productId, products.productId))
        .where(
          and(
            eq(productMembers.userId, user.userId),
            query.productId ? eq(products.productId, query.productId) : undefined,
            query.status
              ? eq(tasks.status, query.status)
              : query.includeCompleted
                ? undefined
                : notCompleted()
          )
        )
        .orderBy(sql`${tasks.timeLimit} asc nulls last`, asc(tasks.taskId));
    },
    {
      requireUser: true,
      query: t.Object({
        productId: t.Optional(t.String({ format: "uuid" })),
        status: t.Optional(statusQuerySchema),
        includeCompleted: t.Optional(t.BooleanString()),
      }),
      response: {
        200: t.Array(
          t.Composite([TaskSchema, t.Object({ productId: t.String(), productName: t.String() })])
        ),
        401: MessageSchema,
      },
      detail: { summary: "自分に割り振られたタスクを、全プロダクトをまたいで取得" },
    }
  );
