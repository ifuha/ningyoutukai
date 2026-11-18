import { t } from "elysia";
import {
  canDeleteMessage,
  canEditMessage,
  messageKinds,
  type Actor,
  type MessageKind,
  type TaskStatus,
} from "./task-flow";

/**
 * メッセージ API が返すメッセージ 1 件の形(日時は、DB の Date のまま返す。JSON になると ISO 文字列になる)。
 * 削除済みのメッセージは、本文を空にして `deleted: true` で返す(履歴の並びを崩さないため)。
 * `canEdit` / `canDelete` は、**この閲覧者**がそのメッセージを編集・削除できるか
 * (web はボタンを出すかどうかをこの 2 つで判断する。api 側も同じ判定で通す)
 */
export const TaskMessageSchema = t.Object({
  messageId: t.String(),
  kind: t.UnionEnum([...messageKinds]),
  body: t.String(),
  author: t.Object({
    productMemberId: t.String(),
    userName: t.String(),
    avatarUrl: t.Union([t.String(), t.Null()]),
  }),
  createdAt: t.Date(),
  editedAt: t.Union([t.Date(), t.Null()]),
  deleted: t.Boolean(),
  canEdit: t.Boolean(),
  canDelete: t.Boolean(),
});

/** 履歴取得 `GET …/task/:taskId/message` の応答 */
export const TaskMessageListSchema = t.Object({
  messages: t.Array(TaskMessageSchema),
});

/** ルートが作る、閲覧者がそのタスクでどう見えるか(コメントを書ける人と権限は同じ) */
export function actorFor(
  viewer: { productMemberId: string; role: "leader" | "member" },
  task: { productMemberId: string },
): Actor {
  return {
    productMemberId: viewer.productMemberId,
    isLeader: viewer.role === "leader",
    isAssignee: task.productMemberId === viewer.productMemberId,
  };
}

/** 1 件分のメッセージに、閲覧者が編集・削除できるかを付けて返す */
export function messageView<
  T extends {
    authorMemberId: string;
    kind: MessageKind;
    createdAt: Date;
    editedAt: Date | null;
    deleted: boolean;
  },
>(
  row: T,
  actor: Actor,
  status: TaskStatus,
): Omit<T, "authorMemberId"> & { canEdit: boolean; canDelete: boolean } {
  const like = {
    authorMemberId: row.authorMemberId,
    kind: row.kind,
    // 削除済みなら日時が入っている(判定は「null かどうか」だけなので、どちらの日時でも同じ)
    deletedAt: row.deleted ? (row.editedAt ?? row.createdAt) : null,
  };
  // 判定には authorMemberId が必要だが、応答には `author` で返しているので出さない
  const { authorMemberId: _authorMemberId, ...out } = row;
  return {
    ...out,
    canEdit: canEditMessage(actor, like, status),
    canDelete: canDeleteMessage(actor, like, status),
  };
}
