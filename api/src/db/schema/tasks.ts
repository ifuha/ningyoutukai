import { snakeCase, boolean, index, text, timestamp, uuid, check } from "drizzle-orm/pg-core";
import { productMembers } from "./product_members";
import { taskTypes } from "./task_types";
import { sql } from "drizzle-orm";
import { taskStatuses, type TaskStatus } from "../../lib/task-flow";

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
      // 値の一覧は task-flow.ts の taskStatuses から作る(生成される SQL は、直接書いたときと同じ)
      sql`${table.status} IN (${sql.raw(taskStatuses.map((s) => `'${s}'`).join(","))})`,
    ),
    index("tasks_member_idx").on(table.productMemberId),
  ],
);
