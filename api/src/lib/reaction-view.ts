import { asc, eq, inArray } from "drizzle-orm";
import { t } from "elysia";
import { db } from "../db";
import { productMembers, taskMessageReactions, users } from "../db/schema";
import { reactionEmojis, type ReactionEmoji } from "./reaction";

/** リアクションを押した人 1 人分 */
export type ReactionMember = {
  productMemberId: string;
  userName: string;
  avatarUrl: string | null;
};

/** 絵文字ごとにまとめたリアクション(画面はこれを「👍 3」のように出す) */
export type ReactionGroup = {
  emoji: ReactionEmoji;
  members: ReactionMember[];
};

/** 応答スキーマ(`reaction-view.ts` の `ReactionGroup` と同じ形) */
export const ReactionGroupSchema = t.Object({
  emoji: t.UnionEnum([...reactionEmojis]),
  members: t.Array(
    t.Object({
      productMemberId: t.String(),
      userName: t.String(),
      avatarUrl: t.Union([t.String(), t.Null()]),
    }),
  ),
});

/** `GET …/message` の 1 行に付くリアクション */
export const ReactionListSchema = t.Array(ReactionGroupSchema);

type Row = {
  emoji: string;
  productMemberId: string;
  userName: string;
  avatarUrl: string | null;
};

/** 行を絵文字ごとにまとめる。絵文字の並びは reactionEmojis の順(画面の並びを揃えるため) */
export function groupReactions(rows: Row[]): ReactionGroup[] {
  const order = new Map<string, ReactionGroup>();
  for (const r of rows) {
    let group = order.get(r.emoji);
    if (!group) {
      group = { emoji: r.emoji as ReactionEmoji, members: [] };
      order.set(r.emoji, group);
    }
    group.members.push({
      productMemberId: r.productMemberId,
      userName: r.userName,
      avatarUrl: r.avatarUrl,
    });
  }
  return [...order.values()].sort(
    (a, b) => reactionEmojis.indexOf(a.emoji) - reactionEmojis.indexOf(b.emoji),
  );
}

/**
 * 複数のメッセージのリアクションを、まとめて 1 クエリで取る。
 * 履歴を返すたびに 1 行ずつクエリしないよう、メッセージ ID の一覧を渡して使う
 */
export async function loadReactions(
  messageIds: string[],
): Promise<Map<string, ReactionGroup[]>> {
  const result = new Map<string, ReactionGroup[]>();
  if (messageIds.length === 0) return result;
  const grouped = new Map<string, Row[]>();
  const rows = await db
    .select({
      messageId: taskMessageReactions.messageId,
      emoji: taskMessageReactions.emoji,
      productMemberId: productMembers.productMemberId,
      userName: users.userName,
      avatarUrl: users.avatarUrl,
    })
    .from(taskMessageReactions)
    .innerJoin(
      productMembers,
      eq(taskMessageReactions.memberId, productMembers.productMemberId),
    )
    .innerJoin(users, eq(productMembers.userId, users.userId))
    .where(inArray(taskMessageReactions.messageId, messageIds))
    .orderBy(
      asc(taskMessageReactions.messageId),
      asc(taskMessageReactions.createdAt),
    );
  for (const r of rows) {
    const list = grouped.get(r.messageId);
    if (list) list.push(r);
    else grouped.set(r.messageId, [r]);
  }
  for (const [id, list] of grouped) result.set(id, groupReactions(list));
  return result;
}
