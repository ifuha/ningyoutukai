import { Elysia } from "elysia";
import type { Me } from "./note-authorize";

/**
 * コメントの権限。`commentAuthorize(me).canWrite()`。
 * 作成・編集・削除ができるのは、そのプロダクトのリーダーだけ。見る(取得)のは、参加者全員(ここでは調べない)
 */
export function commentAuthorize(me: Me) {
  return {
    canWrite: (): boolean => me.role === "leader",
  };
}

/** コメントの権限を、ルートから呼べるようにするプラグイン(`note-authorize.ts` と同じ形)。`.use(commentAuthorizer)` で `commentAuthorize` が使える */
export const commentAuthorizer = new Elysia({ name: "comment-authorize" }).decorate("commentAuthorize", commentAuthorize);
