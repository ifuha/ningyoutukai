import { Elysia } from "elysia";
import type { Me } from "./note-authorize";

/**
 * ツリーの AI のカードの位置の権限。`aiPositionAuthorize(me).canMove()`。
 * 動かす・初めの置き場所に戻すのは、そのプロダクトのリーダーだけ(メンバーのカードと同じ)。見る(ツリーの取得)のは、参加者全員(ここでは調べない)
 */
export function aiPositionAuthorize(me: Me) {
  return {
    canMove: (): boolean => me.role === "leader",
  };
}

/** AI のカードの位置の権限を、ルートから呼べるようにするプラグイン(`comment-authorize.ts` と同じ形)。`.use(aiPositionAuthorizer)` で `aiPositionAuthorize` が使える */
export const aiPositionAuthorizer = new Elysia({ name: "ai-position-authorize" }).decorate("aiPositionAuthorize", aiPositionAuthorize);
