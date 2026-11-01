import type { Context } from '../context'
import { CliError } from '../errors'
import { formatDateTime, renderTable, shortId } from '../format'
import { CLI_NAME, EXIT } from '../meta'
import {
  fetchMyTasks,
  STATUS_LABELS,
  TASK_STATUSES,
  type MyTask,
  type TaskStatus,
} from '../tasks-api'
import { resolveAuth } from './auth'

export type TasksOptions = {
  api?: string
  /** プロダクトの名前(の一部)か ID */
  product?: string
  status?: string
  /** 完了済みも出す */
  all?: boolean
  json?: boolean
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `--status` の値を検査する。知らない値は、使い方の誤り(終了コード 2) */
export function parseStatus(value: string): TaskStatus {
  if ((TASK_STATUSES as readonly string[]).includes(value)) return value as TaskStatus
  throw new CliError(
    `--status の値が正しくありません: ${value}\n使える値: ${TASK_STATUSES.map((s) => `${s}(${STATUS_LABELS[s]})`).join(' / ')}`,
    EXIT.usage,
  )
}

/**
 * `--product` の絞り込み。ID(UUID)なら api に任せる。名前なら、取得した行から、名前の一部(大文字小文字を区別しない)で絞る。
 * 名前がちょうど一致するプロダクトがあれば、それだけにする(「人形」と「人形使い」があっても、「人形」で選べる)
 */
export function filterByProductName(tasks: MyTask[], name: string): MyTask[] {
  const needle = name.trim().toLowerCase()
  const exact = tasks.filter((t) => t.productName.toLowerCase() === needle)
  if (exact.length > 0) return exact
  return tasks.filter((t) => t.productName.toLowerCase().includes(needle))
}

/** 自分に割り振られたタスクの一覧(全プロダクト)。既定は完了以外、`--all` で完了済みも出す */
export async function tasks(ctx: Context, opts: TasksOptions): Promise<void> {
  if (opts.status !== undefined && opts.all) {
    throw new CliError('--status と --all は、同時に使えません(--status は、その状態のタスクだけを出します)', EXIT.usage)
  }
  const status = opts.status !== undefined ? parseStatus(opts.status) : undefined
  const product = opts.product?.trim()
  const byId = product && UUID.test(product) ? product : undefined

  const { apiUrl, token } = await resolveAuth(ctx, opts.api)
  let rows = await fetchMyTasks(ctx.fetchFn, apiUrl, token, {
    productId: byId,
    status,
    includeCompleted: opts.all,
  })
  if (product && !byId) rows = filterByProductName(rows, product)

  if (opts.json) {
    ctx.out(JSON.stringify(rows, null, 2))
    return
  }
  if (rows.length === 0) {
    ctx.out('割り振られたタスクはありません')
    if (!opts.all && !status) ctx.out(`(完了したタスクも見るには \`${CLI_NAME} tasks --all\`)`)
    return
  }
  ctx.out(
    renderTable(
      [
        ['プロダクト', 'タスク', '状態', '期限', 'ID'],
        ...rows.map((t) => [t.productName, t.taskName, STATUS_LABELS[t.status] ?? t.status, formatDateTime(t.timeLimit), shortId(t.taskId)]),
      ],
      [24, 40],
    ),
  )
  ctx.out('')
  ctx.out(`${rows.length} 件。詳細は \`${CLI_NAME} task <ID>\``)
}
