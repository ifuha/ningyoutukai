import { send, type Fetch } from './api'
import { CliError } from './errors'
import { CLI_NAME, EXIT } from './meta'

// タスクの読み取り API。応答の形は api の `TaskSchema` などと同じ(日時は ISO 文字列)

export const TASK_STATUSES = ['in_progress', 'reported', 'rejected', 'completed'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const STATUS_LABELS: Record<TaskStatus, string> = {
  in_progress: '作業中',
  reported: '確認待ち',
  rejected: '差し戻し中',
  completed: '完了',
}

export type MyTask = {
  taskId: string
  taskName: string
  description: string | null
  timeLimit: string | null
  reportedAt: string | null
  completedAt: string | null
  taskTypeId: string | null
  productMemberId: string
  isVisible: boolean
  status: TaskStatus
  productId: string
  productName: string
}

export type TaskMessage = {
  messageId: string
  kind: string
  body: string
  author: { productMemberId: string; userName: string; avatarUrl: string | null }
  createdAt: string
  editedAt: string | null
  deleted: boolean
}

export type TaskFilters = {
  productId?: string
  status?: TaskStatus
  includeCompleted?: boolean
}

/**
 * ベアラートークンで GET して、JSON を返す。
 * 401 は「ログインの期限切れ」(終了コード 3)、404 などはサーバーのメッセージを添えて失敗(終了コード 1)にする
 */
async function getJson<T>(fetchFn: Fetch, url: string, token: string): Promise<T> {
  const res = await send(fetchFn, url, { headers: { authorization: `Bearer ${token}` } })
  if (res.status === 401) {
    throw new CliError(
      `ログインの有効期限が切れています。\`${CLI_NAME} login\` でログインし直してください`,
      EXIT.auth,
    )
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    throw new CliError(`サーバーがエラーを返しました(${res.status})${body?.message ? `: ${body.message}` : ''}`, EXIT.error)
  }
  return (await res.json()) as T
}

/** 自分に割り振られたタスク(全プロダクト)。`GET /api/me/task` */
export function fetchMyTasks(fetchFn: Fetch, apiUrl: string, token: string, filters: TaskFilters = {}): Promise<MyTask[]> {
  const q = new URLSearchParams()
  if (filters.productId) q.set('productId', filters.productId)
  if (filters.status) q.set('status', filters.status)
  if (filters.includeCompleted) q.set('includeCompleted', 'true')
  const query = q.toString()
  return getJson<MyTask[]>(fetchFn, `${apiUrl}/api/me/task${query ? `?${query}` : ''}`, token)
}

/** タスクのメッセージ履歴(古い順)。`GET /api/product/:productId/task/:taskId/message` */
export async function fetchMessages(
  fetchFn: Fetch,
  apiUrl: string,
  token: string,
  task: Pick<MyTask, 'productId' | 'taskId'>,
): Promise<TaskMessage[]> {
  const body = await getJson<{ messages: TaskMessage[] }>(
    fetchFn,
    `${apiUrl}/api/product/${task.productId}/task/${task.taskId}/message`,
    token,
  )
  return body.messages
}
