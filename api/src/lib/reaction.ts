/**
 * メッセージに付けられるリアクション(絵文字はこの 5 個だけ)。
 * DB の CHECK 制約・API の入力判定・画面の選択肢の、唯一の定義
 */
export const reactionEmojis = ["👍", "🎉", "👀", "✅", "❓"] as const;

export type ReactionEmoji = (typeof reactionEmojis)[number];

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (reactionEmojis as readonly string[]).includes(value);
}
