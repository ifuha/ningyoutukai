import { Elysia } from "elysia";

/** 見ている人(ユーザーと、そのプロダクトでの役割) */
export type Me = { userId: string; role: "leader" | "member" };

/** 権限を調べるメモ(作成者だけ見ればよい) */
export type AuthorizableNote = { createdBy: string | null };

/**
 * メモの権限。`authorize(me).canEdit(note)`。
 * 変更・削除・公開の切り替えができるのは、作成者だけ(リーダーでも、他の人のメモは変更も削除もできない)。
 * 例外: 作成者が NULL(退会した人・作成者を保存する前のメモ)のメモは、持ち主がいないので、リーダーが片付けられる
 */
export function authorize(me: Me) {
  return {
    canEdit: (note: AuthorizableNote): boolean =>
      note.createdBy === me.userId || (note.createdBy === null && me.role === "leader"),
  };
}

/**
 * メモの権限を、ルートから呼べるようにするプラグイン(ミドルウェア)。
 * `.use(noteAuthorize)` すると、ハンドラで `authorize(me).canEdit(note)` が使える(`auto-assign-plugin.ts` と同じ形)。
 * `me` は `{ userId, role }`(`authGuard` の `user` と、`getMembership` の `role` から作る)。
 */
export const noteAuthorize = new Elysia({ name: "note-authorize" }).decorate("authorize", authorize);
