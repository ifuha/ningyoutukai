import { t } from "elysia";
import { messageKinds } from "./task-flow";

/**
 * メッセージ API が返すメッセージ 1 件の形(日時は、DB の Date のまま返す。JSON になると ISO 文字列になる)。
 * 削除済みのメッセージは、本文を空にして `deleted: true` で返す(履歴の並びを崩さないため)。
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
});

/** 履歴取得 `GET …/task/:taskId/message` の応答 */
export const TaskMessageListSchema = t.Object({
  messages: t.Array(TaskMessageSchema),
});