import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { taskMessages, tasks } from "../db/schema";
import type { MessageKind, TaskStatus } from "./task-flow";
import { taskColumns, type TaskRow } from "./task-view";

/**
 * タスクの状態を進め、その場で**メッセージ(ログ)を 1 件残す**。
 * 完了報告・再提出・差し戻し・承認が、やりとりの履歴に 1 行ずつ出るようにする
 * (docs/v2.0/message-feature.md の「GitHub の PR のコメントに近い形」)。
 *
 * - 「読んだときの状態のまま」(`from`)のときだけ更新する。同時に呼ばれても二重に進まない
 * - 状態の更新とメッセージの insert は **1 トランザクション**。片方だけ残ることはない
 * - 確認待ち(reported)に入ると報告日時、完了(completed)に入ると完了日時を入れる。
 *   差し戻し(rejected)は日時を変えない(最後に報告した日時は、報告のまま残す)
 *
 * 二重実行などで更新が 0 件なら `{ ok: false }` を返す(呼び出し側が 409 にする)。
 * 取得から更新の間にタスクが消えていた場合も同じで、呼び出し側が `taskStillExists` で 404 と 409 を分ける
 */
export async function moveTaskWithMessage(args: {
  taskId: string;
  /** 読んだときの状態(条件付き update の条件) */
  from: TaskStatus;
  to: TaskStatus;
  /** 残すログの種類(report / resubmit / reject / approve) */
  kind: MessageKind;
  authorMemberId: string;
  body: string;
}): Promise<{ ok: true; task: TaskRow; messageId: string } | { ok: false }> {
  const now = new Date();
  const stamps: Partial<typeof tasks.$inferInsert> = {};
  if (args.to === "reported") stamps.reportedAt = now;
  if (args.to === "completed") stamps.completedAt = now;

  const moved = await db.transaction(async (tx) => {
    const [task] = await tx
      .update(tasks)
      .set({ status: args.to, ...stamps })
      .where(and(eq(tasks.taskId, args.taskId), eq(tasks.status, args.from)))
      .returning(taskColumns);
    if (!task) return null;
    const [message] = await tx
      .insert(taskMessages)
      .values({
        taskId: args.taskId,
        authorMemberId: args.authorMemberId,
        kind: args.kind,
        body: args.body,
      })
      .returning({ messageId: taskMessages.messageId });
    return { task, messageId: message!.messageId };
  });
  return moved ? { ok: true, task: moved.task, messageId: moved.messageId } : { ok: false };
}
