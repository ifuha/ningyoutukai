import { Elysia } from "elysia";
import { auth } from "../auth";
import { authenticateAiToken, bearerAiToken, isAiAllowed } from "./ai-token";
import { getOrCreateAppUser } from "./app-user";
import { errorHandler } from "./error-handler";

/**
 * ログイン必須のルートに `{ requireUser: true }` を付けると、
 * 未ログインは 401、ログイン済みなら `user`(アプリ側の `users` の行)が使える。
 * `via` は、何でログインしたか: `human` = 人(cookie か、CLI のベアラートークン)/ `ai` = AI 用のトークン(`Authorization: Bearer pmai_…`)。
 * AI 用のトークンは、持ち主(人)として扱うが、**許可の一覧(`ai-token.ts` の `isAiAllowed`)にあるルートだけ**使える(それ以外は 403)。
 * 「持ち主のタスクだけ」「渡された文書だけ」は、ルートの側で `via` を見て確かめる。
 */
/** 何でログインしたか。両方の返り値で同じ型にする(リテラルのままだと、Elysia が型を合成するとき never になる) */
export type AuthVia = "human" | "ai";
/** AI 用のトークンでログインしたときの、そのトークン(人のログインのときは null)。下書きに、保存した AI の名前を控えるのに使う */
export type AuthAiToken = { tokenId: string; name: string } | null;

export const authGuard = new Elysia({ name: "auth-guard" })
  .use(errorHandler)
  .macro({
  requireUser: {
    async resolve({ request, status }) {
      // AI 用のトークン(pmai_…)。better-auth のセッションとは別に確かめる
      const aiToken = bearerAiToken(request.headers.get("authorization"));
      if (aiToken) {
        const owner = await authenticateAiToken(aiToken);
        if (!owner) return status(401, { message: "トークンが無効です(取り消された、または期限が切れています)" });
        if (!isAiAllowed(request.method, new URL(request.url).pathname)) {
          return status(403, { message: "AI 用のトークンでは、この操作はできません" });
        }
        return { user: owner.user, via: "ai" as AuthVia, aiToken: { tokenId: owner.tokenId, name: owner.name } as AuthAiToken };
      }

      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return status(401, { message: "ログインが必要です" });

      const user = await getOrCreateAppUser(session.user);
      return { user, via: "human" as AuthVia, aiToken: null as AuthAiToken };
    },
  },
});
