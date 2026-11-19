import { index, primaryKey, snakeCase, timestamp, uuid } from "drizzle-orm/pg-core";
import { productMembers } from "./product_members";
import { tasks } from "./tasks";

/**
 * タスクを「最後に開いた日時」。未読の判定に使う(メッセージがこの日時より新しければ未読)。
 * - 1 タスク × 1 メンバーに 1 行(主キーは taskId + memberId)。まだ一度も開いていないタスクは行が無く、
 *   そのタスクのメッセージはすべて未読になる
 * - タスクやメンバーを消すと、連鎖して消える
 * - コメントはメールで送らない(無料枠のため)ので、未読はこの表とツリーの `unreadCount` だけで知らせる
 */
export const taskReads = snakeCase.table(
  "task_reads",
  {
    taskId: uuid()
      .notNull()
      .references(() => tasks.taskId, { onDelete: "cascade" }),
    memberId: uuid()
      .notNull()
      .references(() => productMembers.productMemberId, { onDelete: "cascade" }),
    lastReadAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.memberId] }),
    // 「この人が開いたタスク」を探すため(メンバーごとの一覧)。主キーが taskId 始まりなので、この方の逆は走査になる
    index("task_reads_member_idx").on(t.memberId),
  ],
);
