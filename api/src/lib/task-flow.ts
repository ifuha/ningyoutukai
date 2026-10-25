// タスクの状態遷移と、メッセージの権限判定。DB には触れない純粋関数。
// 状態(taskStatuses)とメッセージの種類(messageKinds)の唯一の定義でもある(スキーマはここから import する)。
// ルートは、この結果を HTTP のステータスに対応づけるだけにする。
//   見えない                     → 404（存在を漏らさない）
//   見えるが権限がない           → 403
//   今の状態ではできない         → 409
//   入力が不正                   → 422

export const taskStatuses = [
  "in_progress", // 作業中
  "reported", // 確認待ち
  "rejected", // 差し戻し中
  "completed", // 完了
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

// メッセージの種類。DB のスキーマ(task_messages.kind の CHECK)も、ここから取る
export const messageKinds = [
  "comment",
  "report",
  "resubmit",
  "reject",
  "approve",
] as const;
export type MessageKind = (typeof messageKinds)[number];

export type FlowAction = "report" | "approve" | "reject";

export type Actor = {
  productMemberId: string;
  isLeader: boolean;
  isAssignee: boolean; // このタスクの担当者か
};

export type Transition =
  | { ok: true; next: TaskStatus; kind: MessageKind }
  | { ok: false };

// 状態 × 操作 → 次の状態。表にない組み合わせはすべて { ok: false }（409）
export function nextStep(current: TaskStatus, action: FlowAction): Transition {
  if (action === "report" && current === "in_progress")
    return { ok: true, next: "reported", kind: "report" };
  // 差し戻し後の報告は「再提出」。API は同じ complete-report で受ける
  if (action === "report" && current === "rejected")
    return { ok: true, next: "reported", kind: "resubmit" };
  if (action === "approve" && current === "reported")
    return { ok: true, next: "completed", kind: "approve" };
  if (action === "reject" && current === "reported")
    return { ok: true, next: "rejected", kind: "reject" };
  return { ok: false };
}

// 誰がその操作をできるか（報告は担当者、承認・差し戻しはリーダー）
export function canDoAction(action: FlowAction, actor: Actor): boolean {
  return action === "report" ? actor.isAssignee : actor.isLeader;
}

// タスク（とそのメッセージ）を見られるか。公開タスクは誰でも、非公開はリーダーと担当者だけ
export function canViewTask(actor: Actor, task: { isVisible: boolean }): boolean {
  return actor.isLeader || actor.isAssignee || task.isVisible;
}

// コメントを書けるか。リーダーと担当者だけ。完了後は書けない
export function canComment(actor: Actor, status: TaskStatus): boolean {
  return (actor.isLeader || actor.isAssignee) && status !== "completed";
}

type MessageLike = {
  authorMemberId: string;
  kind: MessageKind;
  deletedAt: Date | string | null;
};

// 編集できるか。自分のメッセージだけ。削除済み・完了後は不可
export function canEditMessage(
  actor: Actor,
  message: MessageLike,
  status: TaskStatus,
): boolean {
  return (
    message.authorMemberId === actor.productMemberId &&
    message.deletedAt === null &&
    status !== "completed"
  );
}

// 削除できるか。種類が comment のものだけ（報告・差し戻し・承認は履歴なので消せない）。
// 本人、またはリーダー。削除済み・完了後は不可
export function canDeleteMessage(
  actor: Actor,
  message: MessageLike,
  status: TaskStatus,
): boolean {
  return (
    message.kind === "comment" &&
    message.deletedAt === null &&
    status !== "completed" &&
    (message.authorMemberId === actor.productMemberId || actor.isLeader)
  );
}