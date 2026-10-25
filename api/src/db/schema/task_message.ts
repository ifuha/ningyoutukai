import { sql } from "drizzle-orm";
import { snakeCase, check, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { productMembers } from "./product_members";
import { tasks } from "./tasks";
import { messageKinds, type MessageKind } from "../../lib/task-flow";

export const taskMessages = snakeCase.table(
  "task_messages",
  {
    messageId: uuid().primaryKey().defaultRandom(),
    taskId: uuid()
      .notNull()
      .references(() => tasks.taskId, { onDelete: "cascade" }),
    authorMemberId: uuid()
      .notNull()
      .references(() => productMembers.productMemberId, { onDelete: "cascade" }),
    kind: text().notNull().$type<MessageKind>(), // comment | report | resubmit | reject | approve
    body: text().notNull().default(""),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp({ withTimezone: true }), // 編集したら入る
    deletedAt: timestamp({ withTimezone: true }), // 論理削除したら入る
  },
  (table) => [
    index("task_messages_task_idx").on(table.taskId, table.createdAt),
    // メンバーを消すと、その人のメッセージも連鎖して消える。その検索を全件走査にしない
    index("task_messages_author_idx").on(table.authorMemberId),
    check(
      "task_messages_kind_check",
      // 値の一覧は task-flow.ts の messageKinds から作る(tasks_status_check と同じ書き方)
      sql`${table.kind} IN (${sql.raw(messageKinds.map((k) => `'${k}'`).join(","))})`,
    ),
  ],
);