import { snakeCase, boolean, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { productMembers } from "./product_members";
import { taskTypes } from "./task_types";
import { tasks } from "./tasks";

export const messageKind = ["comment", "report", "resubmit", "reject", "approve"] as const;
export type MessageKind = (typeof messageKind)[number];

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
  (table) => [index("task_messages_task_idx").on(table.taskId, table.createdAt)],
);