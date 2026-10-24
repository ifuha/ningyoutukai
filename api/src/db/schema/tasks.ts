import { snakeCase, boolean, index, text, timestamp, uuid, check } from "drizzle-orm/pg-core";
import { productMembers } from "./product_members";
import { taskTypes } from "./task_types";
import { sql } from "drizzle-orm";

export const taskStatuses = ["in_progress", "reported", "rejected", "completed"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const tasks = snakeCase.table(
  "tasks",
  {
    taskId: uuid().primaryKey().defaultRandom(),
    taskName: text().notNull(),
    description: text(),
    timeLimit: timestamp({ withTimezone: true }), // 期限
    status: text().notNull().default("in_progress").$type<TaskStatus>(),
    reportedAt: timestamp({ withTimezone: true }), // メンバーが完了報告した日時
    completedAt: timestamp({ withTimezone: true }), // リーダーが完了にした日時(入ると完了扱い)
    // 種類を消してもタスクは残す
    taskTypeId: uuid().references(() => taskTypes.taskTypeId, {
      onDelete: "set null",
    }),
    // メンバーを消すと紐づくタスクも一緒に消える
    productMemberId: uuid()
      .notNull()
      .references(() => productMembers.productMemberId, { onDelete: "cascade" }),
    isVisible: boolean().notNull().default(true), // 他メンバーへの表示・非表示
  },
      (table) => [
    check(
      "tasks_status_check",
      sql`${table.status} IN ('in_progress','reported','rejected','completed')`,
    ),
    index("tasks_member_idx").on(table.productMemberId)
  ]
);