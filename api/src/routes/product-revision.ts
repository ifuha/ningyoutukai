import { Elysia, t } from "elysia";
import { eq, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "../db";
import {
  productMembers,
  products,
  sections,
  taskMessages,
  taskTypes,
  tasks,
  users,
} from "../db/schema";
import { authGuard } from "../lib/auth-guard";
import { getMembership } from "../lib/product-access";
import { MessageSchema } from "../lib/response-schema";

// プロダクトの「版(リビジョン)」GET /api/product/:productId/revision(プロダクトのメンバーなら誰でも)
//
// 他の人の変更を、画面に届けるための入口。画面は、数秒ごとにこれを呼び、値が変わったときだけ、ツリーなどを取り直す。
// 値は、プロダクトの画面が依存するデータ(プロダクト、メンバー、メンバーのユーザー情報、セクション、タスク、種類、メッセージ)の
// 全行から計算した指紋(md5)。**各行の全列**から計算するので、どの API で、どの列が変わっても(追加・更新・削除)値が変わる。
// 変更のたびに、版を上げる処理を足す必要がない(新しい列や API を足しても、自動で拾う)。
//
// 注意:
// - 値は、それ自体に意味のない文字列(32 桁の 16 進数)。変わったかどうかだけに使う。内容は漏れない
// - メンバーには見えない非公開タスクの変更でも、値は変わる(取り直すと、同じ内容が返るだけ)。「何かが変わった」ことは分かる
// - 招待(product_invitations)は、ツリーに出ないので含めない
// - 計算は、プロダクトの行数に比例する(1 回の問い合わせ)。数秒ごとの呼び出しを想定している

/** 行の全列の指紋をまとめる。0 行のときは空文字(null を連結に混ぜない) */
function digest(table: PgTable, orderBy: PgColumn, where: SQL): SQL {
  return sql`coalesce((select md5(string_agg(md5(${table}::text), '' order by ${orderBy})) from ${table} where ${where}), '')`;
}

/** プロダクトの版を計算する */
export async function computeProductRevision(productId: string): Promise<string> {
  const memberIds = sql`(select ${productMembers.productMemberId} from ${productMembers} where ${productMembers.productId} = ${productId})`;
  const memberUserIds = sql`(select ${productMembers.userId} from ${productMembers} where ${productMembers.productId} = ${productId})`;
  const taskIds = sql`(select ${tasks.taskId} from ${tasks} where ${tasks.productMemberId} in ${memberIds})`;

  const result = await db.execute(sql`
    select md5(concat_ws('|',
      ${digest(products, products.productId, eq(products.productId, productId))},
      ${digest(productMembers, productMembers.productMemberId, eq(productMembers.productId, productId))},
      ${digest(users, users.userId, sql`${users.userId} in ${memberUserIds}`)},
      ${digest(sections, sections.sectionId, eq(sections.productId, productId))},
      ${digest(tasks, tasks.taskId, sql`${tasks.productMemberId} in ${memberIds}`)},
      ${digest(taskTypes, taskTypes.taskTypeId, eq(taskTypes.productId, productId))},
      ${digest(taskMessages, taskMessages.messageId, sql`${taskMessages.taskId} in ${taskIds}`)}
    )) as revision
  `);
  const row = result.rows[0] as { revision?: unknown } | undefined;
  if (typeof row?.revision !== "string") throw new Error("版を計算できませんでした");
  return row.revision;
}

export const productRevisionRoutes = new Elysia({ name: "product-revision" })
  .use(authGuard)
  .get(
    "/api/product/:productId/revision",
    async ({ params, user, status, set }) => {
      const viewer = await getMembership(params.productId, user.userId);
      if (!viewer) return status(404, { message: "プロダクトが見つかりません" });

      // 数秒ごとに呼ばれる。ブラウザや中継が、古い値を使い回さないようにする
      set.headers["cache-control"] = "no-store";
      return { revision: await computeProductRevision(params.productId) };
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      response: { 200: t.Object({ revision: t.String() }), 404: MessageSchema },
      detail: { summary: "プロダクトの版の取得(他の人の変更を検知する)" },
    },
  );
