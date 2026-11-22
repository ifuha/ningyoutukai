// 完了した報告の履歴(`/products/$productId/history`)の並び。
// `GET /api/product/:productId/task?includeCompleted=true` のタスクから、完了したものだけを、完了日時の新しい順に並べる。
// 担当者の名前は、メンバー一覧(`GET …/member`)から引く(抜けた人は名前なし)

type HistoryTask = {
  taskId: string
  status: string
  completedAt: string | null
  productMemberId: string
}

type HistoryMember = { productMemberId: string; userName: string }

export type CompletedEntry<T extends HistoryTask> = {
  task: T
  /** 担当者の名前。メンバー一覧にいなければ null */
  assigneeName: string | null
}

/** 完了したタスクを、完了日時の新しい順に(同じ日時は taskId 順で安定させる)。完了日時のないものは最後 */
export function completedHistory<T extends HistoryTask>(
  tasks: readonly T[],
  members: readonly HistoryMember[] = [],
): CompletedEntry<T>[] {
  const names = new Map(members.map((m) => [m.productMemberId, m.userName]))
  const time = (t: HistoryTask) => (t.completedAt ? new Date(t.completedAt).getTime() : -Infinity)
  return tasks
    .filter((task) => task.status === 'completed')
    .sort((a, b) => time(b) - time(a) || (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0))
    .map((task) => ({ task, assigneeName: names.get(task.productMemberId) ?? null }))
}
