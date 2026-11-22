import { and, count, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "../db";
import { taskMessages, taskReads } from "../db/schema";

/**
 * タスクごとの未読件数と、既読にする処理。
 *
 * 未読 = **自分以外**が書いた、削除されていないメッセージで、そのタスクを最後に開いた日時より新しいもの。
 * 一度も開いていないタスク(行が無い)は、メッセージが全部未読になる。
 * コメントはメールで送らない(無料枠のため)ので、この件数をツリーに `unreadCount` として出して知らせる。
 */
export async function loadUnreadCounts(
  /** 見ている人の productMemberId */
  viewerMemberId: string,
  taskIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (taskIds.length === 0) return counts;

  const rows = await db
    .select({ taskId: taskMessages.taskId, unread: count() })
    .from(taskMessages)
    // 開いた日時を引き当てる(一度も開いていないタスクは左結合で NULL になる)
    .leftJoin(
      taskReads,
      and(
        eq(taskReads.taskId, taskMessages.taskId),
        eq(taskReads.memberId, viewerMemberId),
      ),
    )
    .where(
      and(
        inArray(taskMessages.taskId, taskIds),
        // 自分の書いたものは、自分には未読にならない
        ne(taskMessages.authorMemberId, viewerMemberId),
        // 論理削除したコメントは出さない(履歴に「削除されました」とだけ出るもの)
        isNull(taskMessages.deletedAt),
        or(isNull(taskReads.lastReadAt), gt(taskMessages.createdAt, taskReads.lastReadAt)),
      ),
    )
    .groupBy(taskMessages.taskId);

  for (const row of rows) counts.set(row.taskId, row.unread);
  return counts;
}

/**
 * タスクを「読んだ」ことにする(最後に開いた日時を現在時刻で更新)。
 * 初めて開いたときは行が無いので insert、2 回目以降は update する。
 */
export async function markTaskRead(taskId: string, memberId: string): Promise<void> {
  await db
    .insert(taskReads)
    .values({ taskId, memberId, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [taskReads.taskId, taskReads.memberId],
      set: { lastReadAt: new Date() },
    });
}
