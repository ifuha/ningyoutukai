import { snakeCase, boolean, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { productMembers } from "./product_members";
import { taskTypes } from "./task_types";

export const tasks = snakeCase.table(
  "tasks",
  {
    taskId: uuid().primaryKey().defaultRandom(),
    taskName: text().notNull(),
    description: text(),
    timeLimit: timestamp({ withTimezone: true }), // 期限
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
  (t) => [index("tasks_member_idx").on(t.productMemberId)]
);