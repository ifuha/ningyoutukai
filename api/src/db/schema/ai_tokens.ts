import { index, snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

// AI 用のトークン。仕様は docs/v4.0/overview.md
// - **担当者(人)が、自分の AI のために発行する**。AI は担当者ではなく、担当者が使う道具。トークンは担当者に結びつき、担当者が取り消せる
// - AI は、そのトークンで CLI / API を使う。できることは、その担当者の、自分に割り振られたタスクの読み取り、渡された文書の取得、下書きの保存だけ(`lib/ai-token.ts` の許可の一覧)
// - トークンの中身(`pmai_…`)は保存しない。保存するのはハッシュだけ(漏れても使えない)。発行したときに、一度だけ表示する
export const aiTokens = snakeCase.table(
  "ai_tokens",
  {
    tokenId: uuid().primaryKey().defaultRandom(),
    // トークンの持ち主(人)。退会したら、トークンも消える
    userId: uuid()
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    // 持ち主が付ける名前(例: 「Claude Code(仕事用)」)。どの AI かを見分ける
    name: text().notNull(),
    // トークンの SHA-256(16 進数)。照合に使う
    tokenHash: text().notNull().unique(),
    // 見分けるための先頭の数文字(例: pmai_ab12)。一覧に出す。中身そのものではない
    tokenPrefix: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // 期限。過ぎたら使えない
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    // 最後に使われた日時(間引いて更新する)。使われていないトークンに気づくため
    lastUsedAt: timestamp({ withTimezone: true }),
    // 取り消した日時。入っていたら使えない
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index("ai_tokens_user_idx").on(table.userId)],
);
