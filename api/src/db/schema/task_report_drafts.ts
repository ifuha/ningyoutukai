import { sql } from "drizzle-orm";
import { check, index, jsonb, snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { aiTokens } from "./ai_tokens";
import { taskMessages } from "./task_message";
import { tasks } from "./tasks";
import { users } from "./users";

/** 下書きに記録する「AI が読んだ文書」。文書が消えても、名前と版の番号は残す */
export type ReadDocument = { documentId: string; name: string; version: number };

// AI からの報告の下書き。仕様は docs/v4.0/overview.md
// - AI が作業の結果を保存すると、まず**下書き**になる(リーダーには見えない。担当者だけが見る)
// - **担当者(人)が確認して、「確認報告(完了報告)」に出すか判断する**: そのまま出す / 直して出す / 却下する。出すと、完了報告のメッセージができ、タスクが確認待ちになる
export const taskReportDrafts = snakeCase.table(
  "task_report_drafts",
  {
    draftId: uuid().primaryKey().defaultRandom(),
    taskId: uuid()
      .notNull()
      .references(() => tasks.taskId, { onDelete: "cascade" }),
    // 保存したトークン。取り消して消しても、下書きは残す(名前は `aiName` に控えてある)
    aiTokenId: uuid().references(() => aiTokens.tokenId, { onDelete: "set null" }),
    aiName: text().notNull(),
    // 本文(Markdown)
    body: text().notNull(),
    // AI が読んだ文書(名前と版)。担当者が確認するとき、「どの版を読んで作った下書きか」が分かる
    readDocuments: jsonb().$type<ReadDocument[]>().notNull().default(sql`'[]'::jsonb`),
    // pending = 未確認 / adopted = 完了報告に出した / discarded = 却下(または、別の下書きが出されて不要になった)
    status: text().notNull().default("pending"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // 採用・却下した日時と人
    decidedAt: timestamp({ withTimezone: true }),
    decidedBy: uuid().references(() => users.userId, { onDelete: "set null" }),
    // 採用したときにできた、完了報告のメッセージ
    adoptedMessageId: uuid().references(() => taskMessages.messageId, { onDelete: "set null" }),
  },
  (table) => [
    index("task_report_drafts_task_idx").on(table.taskId, table.createdAt),
    check("task_report_drafts_status_check", sql`${table.status} IN ('pending', 'adopted', 'discarded')`),
    check("task_report_drafts_body_length_check", sql`char_length(${table.body}) BETWEEN 1 AND 10000`),
  ],
);
