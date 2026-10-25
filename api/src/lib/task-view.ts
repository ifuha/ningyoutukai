import { eq, isNull, or, type SQL } from "drizzle-orm";
import { t } from "elysia";
import { tasks } from "../db/schema";
import type { Membership } from "./product-access";
import { taskStatuses } from "./task-flow";

/** タスク API が返すタスクの形(全エンドポイントで共通) */
export const taskColumns = {
  taskId: tasks.taskId,
  taskName: tasks.taskName,
  description: tasks.description,
  timeLimit: tasks.timeLimit,
  reportedAt: tasks.reportedAt,
  completedAt: tasks.completedAt,
  taskTypeId: tasks.taskTypeId,
  productMemberId: tasks.productMemberId,
  isVisible: tasks.isVisible,
  status: tasks.status,
};

/** `taskColumns` の応答スキーマ(日時は、DB の Date のまま返す。JSON になると ISO 文字列になる) */
export const TaskSchema = t.Object({
  taskId: t.String(),
  taskName: t.String(),
  description: t.Union([t.String(), t.Null()]),
  timeLimit: t.Union([t.Date(), t.Null()]),
  reportedAt: t.Union([t.Date(), t.Null()]),
  completedAt: t.Union([t.Date(), t.Null()]),
  taskTypeId: t.Union([t.String(), t.Null()]),
  productMemberId: t.String(),
  isVisible: t.Boolean(),
  status: t.UnionEnum([...taskStatuses]),
});

/**
 * タスクの可視性(要件 4-2)
 * - リーダーは、非表示のタスクも含めてすべて見られる
 * - メンバーは、公開されているタスクと、自分が担当のタスクを見られる(非表示でも担当者本人には見える)
 *
 * 返した条件を where に `and` で足して使う。リーダーのときは条件なし(undefined)。
 */
export function visibleTo(viewer: Membership): SQL | undefined {
  if (viewer.role === "leader") return undefined;
  return or(
    eq(tasks.isVisible, true),
    eq(tasks.productMemberId, viewer.productMemberId)
  );
}

/** すでに取得したタスク 1 件が、閲覧者に見えるかどうか(`visibleTo` と同じルール) */
export function canSee(
  task: { isVisible: boolean; productMemberId: string },
  viewer: Membership
) {
  return (
    viewer.role === "leader" ||
    task.isVisible ||
    task.productMemberId === viewer.productMemberId
  );
}

/** 完了したタスクは一覧に出さない(要件 4-4。データは消さず、表示しないだけ) */
export const notCompleted = (): SQL => isNull(tasks.completedAt);
