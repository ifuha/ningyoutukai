import { sql } from "drizzle-orm";
import { check, index, primaryKey, snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { productMembers } from "./product_members";
import { taskMessages } from "./task_message";
import { reactionEmojis } from "../../lib/reaction";

/**
 * メッセージ 1 件へのリアクション。仕様は docs/v2.0/message-feature.md
 * - 押せるのは、コメントを書ける人(リーダーと担当者)だけ
 * - **1 人のメッセージ 1 件につき 1 個だけ**(主キーは messageId + memberId)。押すと、前の絵文字は置き換わる
 * - メッセージやメンバーを消すと、連鎖して消える
 */
export const taskMessageReactions = snakeCase.table(
  "task_message_reactions",
  {
    messageId: uuid()
      .notNull()
      .references(() => taskMessages.messageId, { onDelete: "cascade" }),
    memberId: uuid()
      .notNull()
      .references(() => productMembers.productMemberId, { onDelete: "cascade" }),
    emoji: text().notNull(), // reactionEmojis の 5 個のどれか
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.memberId] }),
    // メッセージの履歴を引いたあとの、絵文字ごとの集計で使う
    index("task_message_reactions_message_idx").on(t.messageId),
    check(
      "task_message_reactions_emoji_check",
      // 値の一覧は reaction.ts から作る(tasks_status_check と同じ書き方)
      sql`${t.emoji} IN (${sql.raw(reactionEmojis.map((e) => `'${e}'`).join(","))})`,
    ),
  ],
);
