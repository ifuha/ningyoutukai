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
 * ベアラートークンで api を呼んで、JSON を返す(応答が 204 のときは undefined)。
 * 401 は「ログインの期限切れ」(終了コード 3。AI 用のトークンなら、取り消しか期限切れ)、
 * 404 などはサーバーのメッセージを添えて失敗(終了コード 1)にする
 */
export async function requestJson<T>(
  fetchFn: Fetch,
  url: string,
  token: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await send(fetchFn, url, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
  if (res.status === 401) {
    throw new CliError(
      token.startsWith('pmai_')
        ? 'AI 用のトークンが使えません(取り消されたか、期限が切れています)。トークンを発行し直してください'
        : `ログインの有効期限が切れています。\`${CLI_NAME} login\` でログインし直してください`,
      EXIT.auth,
    )
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    throw new CliError(`サーバーがエラーを返しました(${res.status})${body?.message ? `: ${body.message}` : ''}`, EXIT.error)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const getJson = <T>(fetchFn: Fetch, url: string, token: string) => requestJson<T>(fetchFn, url, token)

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
