import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { aiTokens, taskReportDrafts, tasks } from "../db/schema";
import type { TreeAi } from "./tree-schema";

// ツリーに出す、メンバーの AI のカード。仕様は docs/v4.0/overview.md
// - AI はメンバーではなく、持ち主(人)が使う道具。**有効なトークン(取り消されていない・期限内)ごとに 1 枚**
// - 名前は、プロダクトの参加者全員に見える。確認待ちの下書きの数は、持ち主本人にだけ返す(他の人には null)
// - 最後に下書きを出した日時は、このプロダクトのタスクへの下書きだけで数える

/** `members` の持ち主ごとの AI のカード(`viewerUserId` = 見ている人) */
export async function loadTreeAis(
  members: { productMemberId: string; userId: string }[],
  viewerUserId: string,
  now = new Date(),
): Promise<Map<string, TreeAi[]>> {
  const result = new Map<string, TreeAi[]>();
  if (members.length === 0) return result;

  const tokens = await db
    .select({ tokenId: aiTokens.tokenId, userId: aiTokens.userId, name: aiTokens.name })
    .from(aiTokens)
    .where(and(inArray(aiTokens.userId, members.map((m) => m.userId)), isNull(aiTokens.revokedAt), gt(aiTokens.expiresAt, now)))
    .orderBy(asc(aiTokens.createdAt), asc(aiTokens.tokenId));
  if (tokens.length === 0) return result;

  // このプロダクトのタスクへの下書きだけ(トークンごとに、最後の日時と、確認待ちの数)
  const stats = await db
    .select({
      tokenId: taskReportDrafts.aiTokenId,
      lastDraftAt: sql<Date | null>`max(${taskReportDrafts.createdAt})`,
    })
    .from(taskReportDrafts)
    .innerJoin(tasks, eq(tasks.taskId, taskReportDrafts.taskId))
    .where(
      and(
        inArray(taskReportDrafts.aiTokenId, tokens.map((t) => t.tokenId)),
        inArray(tasks.productMemberId, members.map((m) => m.productMemberId)),
      ),
    )
    .groupBy(taskReportDrafts.aiTokenId);
  const byToken = new Map(stats.map((s) => [s.tokenId, s]));

  // 確認待ちの下書き(見ている人の AI の分だけ。古い順)
  const mine = tokens.filter((t) => t.userId === viewerUserId).map((t) => t.tokenId);
  const pendingByToken = new Map<string, string[]>();
  if (mine.length > 0) {
    const pendingRows = await db
      .select({ tokenId: taskReportDrafts.aiTokenId, taskId: taskReportDrafts.taskId })
      .from(taskReportDrafts)
      .innerJoin(tasks, eq(tasks.taskId, taskReportDrafts.taskId))
      .where(
        and(
          inArray(taskReportDrafts.aiTokenId, mine),
          eq(taskReportDrafts.status, "pending"),
          inArray(tasks.productMemberId, members.map((m) => m.productMemberId)),
        ),
      )
      .orderBy(asc(taskReportDrafts.createdAt), asc(taskReportDrafts.draftId));
    for (const row of pendingRows) {
      if (!row.tokenId) continue;
      const list = pendingByToken.get(row.tokenId);
      if (list) list.push(row.taskId);
      else pendingByToken.set(row.tokenId, [row.taskId]);
    }
  }

  for (const token of tokens) {
    const stat = byToken.get(token.tokenId);
    const card: TreeAi = {
      tokenId: token.tokenId,
      name: token.name,
      lastDraftAt: stat?.lastDraftAt ? new Date(stat.lastDraftAt) : null,
      pendingCount: token.userId === viewerUserId ? (pendingByToken.get(token.tokenId)?.length ?? 0) : null,
      pendingTaskIds: token.userId === viewerUserId ? [...new Set(pendingByToken.get(token.tokenId) ?? [])] : null,
    };
    const list = result.get(token.userId);
    if (list) list.push(card);
    else result.set(token.userId, [card]);
  }
  return result;
}
