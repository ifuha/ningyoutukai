import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "../db";
import { aiTokens, users } from "../db/schema";

// AI 用のトークン。仕様は docs/v4.0/overview.md
// `Authorization: Bearer pmai_…` で送る。CLI のログイン(better-auth のセッション)とは別物。
// AI が使えるのは、許可の一覧(`AI_ALLOWED`)にあるルートだけ。それ以外は 403(トークンの発行・取り消し、プロダクトの変更、文書の書き込みなど)

/** トークンの先頭。これで始まる Bearer を、AI 用として扱う */
export const AI_TOKEN_PREFIX = "pmai_";
/** 1 人が同時に持てる、有効なトークンの数 */
export const MAX_ACTIVE_AI_TOKENS = 10;
/** 期限の既定(日)と、選べる範囲 */
export const DEFAULT_AI_TOKEN_DAYS = 90;
export const MAX_AI_TOKEN_DAYS = 365;
/** 最後に使われた日時を更新する間隔(ms)。使うたびに書き込まない */
const LAST_USED_TOUCH_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** SHA-256(16 進数) */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 新しいトークンを作る: `pmai_` + 32 バイトの乱数(base64url)。中身は、発行のときに一度だけ返す */
export function generateAiToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${AI_TOKEN_PREFIX}${base64}`;
}

/** `Authorization` ヘッダから、AI 用のトークンを取り出す(AI 用でなければ null) */
export function bearerAiToken(authorization: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  return match && match[1]!.startsWith(AI_TOKEN_PREFIX) ? match[1]! : null;
}

export async function createAiToken(userId: string, name: string, expiresInDays: number, now = new Date()) {
  const token = generateAiToken();
  const [row] = await db
    .insert(aiTokens)
    .values({
      userId,
      name,
      tokenHash: await sha256Hex(token),
      tokenPrefix: token.slice(0, AI_TOKEN_PREFIX.length + 4),
      expiresAt: new Date(now.getTime() + expiresInDays * DAY_MS),
    })
    .returning();
  return { token, row: row! };
}

/** 有効なトークン(取り消されていない、期限内)の数 */
export async function countActiveAiTokens(userId: string, now = new Date()) {
  const rows = await db
    .select({ tokenId: aiTokens.tokenId })
    .from(aiTokens)
    .where(and(eq(aiTokens.userId, userId), isNull(aiTokens.revokedAt), gt(aiTokens.expiresAt, now)));
  return rows.length;
}

/**
 * トークンの持ち主(アプリ側のユーザー)と、トークンの ID・名前を返す。無効(知らない / 取り消し済み / 期限切れ)なら undefined。
 * 使われた日時を更新する(5 分以内の続けての更新は間引く)
 */
export async function authenticateAiToken(token: string, now = new Date()) {
  const [row] = await db
    .select({ tokenId: aiTokens.tokenId, name: aiTokens.name, lastUsedAt: aiTokens.lastUsedAt, user: users })
    .from(aiTokens)
    .innerJoin(users, eq(aiTokens.userId, users.userId))
    .where(and(eq(aiTokens.tokenHash, await sha256Hex(token)), isNull(aiTokens.revokedAt), gt(aiTokens.expiresAt, now)));
  if (!row) return undefined;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_TOUCH_MS) {
    await db
      .update(aiTokens)
      .set({ lastUsedAt: now })
      .where(and(eq(aiTokens.tokenId, row.tokenId), or(isNull(aiTokens.lastUsedAt), lt(aiTokens.lastUsedAt, new Date(now.getTime() - LAST_USED_TOUCH_MS)))));
  }
  return { user: row.user, tokenId: row.tokenId, name: row.name };
}

/**
 * AI 用のトークンで使えるルート(メソッド + パス)。**これ以外は 403**(既定は拒否)。
 * AI は、担当者(トークンの持ち主)の道具なので、読むのは、持ち主のタスクと、そのタスクに渡された文書だけ。
 * 「持ち主のタスクだけ」「渡された文書だけ」は、ルートの側でも確かめる(`via` が `ai` のとき)。
 */
const AI_ALLOWED: { method: string; pattern: RegExp }[] = [
  // 自分に割り振られたタスクの一覧
  { method: "GET", pattern: /^\/api\/me\/task$/ },
  // そのタスクに渡された文書の一覧
  { method: "GET", pattern: /^\/api\/product\/[^/]+\/task\/[^/]+\/document$/ },
  // 渡された文書の本文
  { method: "GET", pattern: /^\/api\/product\/[^/]+\/document\/[^/]+$/ },
  // 報告の下書きの保存(別の PR で足す)
  { method: "POST", pattern: /^\/api\/product\/[^/]+\/task\/[^/]+\/report-draft$/ },
];

export function isAiAllowed(method: string, pathname: string): boolean {
  return AI_ALLOWED.some((a) => a.method === method.toUpperCase() && a.pattern.test(pathname));
}
