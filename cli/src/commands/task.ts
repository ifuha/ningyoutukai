import type { Context } from '../context'
import { CliError } from '../errors'
import { formatDateTime } from '../format'
import { CLI_NAME, EXIT } from '../meta'
import { fetchMessages, fetchMyTasks, STATUS_LABELS, type MyTask } from '../tasks-api'
import { resolveAuth } from './auth'

export type TaskOptions = { api?: string; json?: boolean }

/** ID の先頭として許す最小の長さ(短すぎると、別のタスクと取り違える) */
export const MIN_ID_PREFIX = 4

/** ID(全体か先頭)に合うタスクを探す。見つからない・複数に合うときは、失敗(終了コード 1) */
export function findTaskById(rows: MyTask[], id: string): MyTask {
  const needle = id.trim().toLowerCase()
  if (needle.length < MIN_ID_PREFIX) {
    throw new CliError(`ID は ${MIN_ID_PREFIX} 文字以上で指定してください(\`${CLI_NAME} tasks\` の ID 列)`, EXIT.usage)
  }
  const hits = rows.filter((t) => t.taskId.toLowerCase().startsWith(needle))
  if (hits.length === 0) {
    throw new CliError(`自分に割り振られたタスクに、この ID はありません: ${id}`, EXIT.error)
  }
  if (hits.length > 1) {
    throw new CliError(
      `この ID に合うタスクが複数あります。もう少し長く指定してください:\n${hits.map((t) => `  ${t.taskId}  ${t.taskName}`).join('\n')}`,
      EXIT.error,
    )
  }
  return hits[0]!
}

const KIND_LABELS: Record<string, string> = {
  comment: 'コメント',
  report: '完了報告',
  resubmit: '再提出',
  reject: '差し戻し',
  approve: '完了確認',
}

/** 1 件のタスクの詳細と、メッセージ履歴。ID は、`tasks` の ID 列(先頭の一部でもよい) */
export async function task(ctx: Context, id: string, opts: TaskOptions): Promise<void> {
  const { apiUrl, token } = await resolveAuth(ctx, opts.api)
  // 完了済みも含めて探す。タスクの詳細は、一覧の行と同じ(プロダクトの ID が要るので、一覧から引く)
  const rows = await fetchMyTasks(ctx.fetchFn, apiUrl, token, { includeCompleted: true })
  const found = findTaskById(rows, id)
  const messages = await fetchMessages(ctx.fetchFn, apiUrl, token, found)

  if (opts.json) {
    ctx.out(JSON.stringify({ task: found, messages }, null, 2))
    return
  }

  ctx.out(found.taskName)
  ctx.out('')
  ctx.out(`ID:         ${found.taskId}`)
  ctx.out(`プロダクト: ${found.productName}`)
  ctx.out(`状態:       ${STATUS_LABELS[found.status] ?? found.status}`)
  ctx.out(`期限:       ${formatDateTime(found.timeLimit)}`)
  if (found.reportedAt) ctx.out(`完了報告:   ${formatDateTime(found.reportedAt)}`)
  if (found.completedAt) ctx.out(`完了:       ${formatDateTime(found.completedAt)}`)
  if (found.description) {
    ctx.out('')
    ctx.out(found.description)
  }

  ctx.out('')
  if (messages.length === 0) {
    ctx.out('メッセージはありません')
    return
  }
  ctx.out(`メッセージ(${messages.length} 件)`)
  for (const m of messages) {
    ctx.out('')
    const edited = m.editedAt ? '(編集済み)' : ''
    ctx.out(`[${formatDateTime(m.createdAt)}] ${m.author.userName} — ${KIND_LABELS[m.kind] ?? m.kind}${edited}`)
    ctx.out(m.deleted ? '  (削除されました)' : m.body.split('\n').map((l) => `  ${l}`).join('\n'))
  }
}
