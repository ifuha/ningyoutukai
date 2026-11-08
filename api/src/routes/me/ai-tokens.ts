import { and, desc, eq, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { aiTokens } from "../../db/schema";
import { DEFAULT_AI_TOKEN_DAYS, MAX_ACTIVE_AI_TOKENS, MAX_AI_TOKEN_DAYS, countActiveAiTokens, createAiToken } from "../../lib/ai-token";
import { authGuard } from "../../lib/auth-guard";
import { MessageSchema } from "../../lib/response-schema";
import { NO_NUL } from "../../lib/validation";

// AI 用のトークンの発行・一覧・取り消し(自分の分だけ)。仕様は docs/v4.0/overview.md
// - **人のログイン(cookie か CLI のトークン)でだけ使える。** AI 用のトークンでは使えない(`authGuard` の許可の一覧にない = 403)。AI が、自分のトークンを増やしたり、取り消したりできないように
// - トークンの中身(`pmai_…`)は、発行のときに一度だけ返す。DB にはハッシュだけを持つので、あとから見ることはできない

const tokenSchema = () =>
  t.Object({
    tokenId: t.String(),
    name: t.String(),
    // 見分けるための先頭の数文字(中身そのものではない)
    tokenPrefix: t.String(),
    createdAt: t.Date(),
    expiresAt: t.Date(),
    lastUsedAt: t.Nullable(t.Date()),
    revokedAt: t.Nullable(t.Date()),
    // 取り消されていなくて、期限内か
    active: t.Boolean(),
  });

const view = (row: typeof aiTokens.$inferSelect, now = new Date()) => ({
  tokenId: row.tokenId,
  name: row.name,
  tokenPrefix: row.tokenPrefix,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
  lastUsedAt: row.lastUsedAt,
  revokedAt: row.revokedAt,
  active: row.revokedAt === null && row.expiresAt.getTime() > now.getTime(),
});

export const aiTokenEndpoints = new Elysia({ name: "ai-token" })
  .use(authGuard)
  .get(
    "/api/me/ai-token",
    async ({ user }) => {
      const rows = await db.select().from(aiTokens).where(eq(aiTokens.userId, user.userId)).orderBy(desc(aiTokens.createdAt));
      return rows.map((r) => view(r));
    },
    { requireUser: true, response: { 200: t.Array(tokenSchema()) }, detail: { summary: "自分の AI 用のトークンの一覧(中身は出ない)" } },
  )
  .post(
    "/api/me/ai-token",
    async ({ body, user, status }) => {
      if ((await countActiveAiTokens(user.userId)) >= MAX_ACTIVE_AI_TOKENS) {
        return status(409, { message: `有効なトークンは ${MAX_ACTIVE_AI_TOKENS} 個までです。使っていないものを取り消してください` });
      }
      const { token, row } = await createAiToken(user.userId, body.name.trim(), body.expiresInDays ?? DEFAULT_AI_TOKEN_DAYS);
      // 中身は、この応答でだけ返す
      return status(201, { ...view(row), token });
    },
    {
      requireUser: true,
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 60, pattern: NO_NUL }),
        expiresInDays: t.Optional(t.Integer({ minimum: 1, maximum: MAX_AI_TOKEN_DAYS })),
      }),
      response: { 201: t.Composite([tokenSchema(), t.Object({ token: t.String() })]), 409: MessageSchema },
      detail: { summary: "AI 用のトークンの発行(中身は一度だけ返す)" },
    },
  )
  // 取り消し: 自分のトークンだけ。取り消し済みでも 204(何度呼んでもよい)。他の人のトークンは 404(存在を漏らさない)
  .delete(
    "/api/me/ai-token/:tokenId",
    async ({ params, user, status }) => {
      const [own] = await db.select({ tokenId: aiTokens.tokenId }).from(aiTokens).where(and(eq(aiTokens.tokenId, params.tokenId), eq(aiTokens.userId, user.userId)));
      if (!own) return status(404, { message: "トークンが見つかりません" });
      await db
        .update(aiTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(aiTokens.tokenId, params.tokenId), eq(aiTokens.userId, user.userId), isNull(aiTokens.revokedAt)));
      return status(204, undefined);
    },
    {
      requireUser: true,
      params: t.Object({ tokenId: t.String({ format: "uuid" }) }),
      response: { 204: t.Undefined(), 404: MessageSchema },
      detail: { summary: "AI 用のトークンの取り消し" },
    },
  );
