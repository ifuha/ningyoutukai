import type { Context } from '../context'
import {
  fetchDocument,
  fetchTaskDocuments,
  isAiToken,
  saveReportDraft,
  type HandedDocument,
} from '../docs-api'
import { CliError } from '../errors'
import { formatDateTime, renderTable, shortId } from '../format'
import { CLI_NAME, EXIT } from '../meta'
import { fetchMyTasks, STATUS_LABELS, type MyTask } from '../tasks-api'
import { resolveAuth } from './auth'
import { findTaskById } from './task'

// タスクに渡された Markdown(文書)を読む・AI の報告の下書きを保存する。仕様は docs/v4.0/overview.md
// - AI は、環境変数 NINGYOUTUKAI_TOKEN に AI 用のトークン(pmai_…)を入れて使う。`login` は要らない
// - AI にできるのは、自分(持ち主)に割り振られたタスクの一覧、渡された文書の一覧と本文、報告の下書きの保存だけ

export type DocsOptions = { api?: string; json?: boolean }

/** 報告の本文の上限(api と同じ。文字数) */
export const REPORT_MAX_LENGTH = 10000

/** 自分のタスクを ID(全体か先頭)で探す。完了済みも含める */
async function findTask(ctx: Context, apiUrl: string, token: string, id: string): Promise<MyTask> {
  const rows = await fetchMyTasks(ctx.fetchFn, apiUrl, token, { includeCompleted: true })
  return findTaskById(rows, id)
}

/** 文書を、名前・`ディレクトリ/名前`・ID(先頭の一部)で選ぶ。見つからない・複数に合うときは、失敗する */
export function findHandedDocument(docs: HandedDocument[], query: string): HandedDocument {
  const needle = query.trim().toLowerCase()
  if (!needle) throw new CliError('文書の名前か ID を指定してください', EXIT.usage)
  const path = (d: HandedDocument) => `${d.directoryName}/${d.name}`.toLowerCase()
  const exact = docs.filter((d) => path(d) === needle || d.name.toLowerCase() === needle || d.documentId.toLowerCase() === needle)
  const hits =
    exact.length > 0
      ? exact
      : needle.length >= 4
        ? docs.filter((d) => d.documentId.toLowerCase().startsWith(needle))
        : []
  if (hits.length === 0) {
    throw new CliError(`このタスクに渡された文書に、これはありません: ${query}\n\`${CLI_NAME} docs <タスクの ID>\` で一覧を見られます`, EXIT.error)
  }
  if (hits.length > 1) {
    throw new CliError(
      `名前が複数の文書に合います。\`ディレクトリ/名前\` か ID で指定してください:\n${hits.map((d) => `  ${d.directoryName}/${d.name}  (${shortId(d.documentId)})`).join('\n')}`,
      EXIT.error,
    )
  }
  return hits[0]!
}

/** タスクに渡された文書の一覧 */
export async function docs(ctx: Context, taskId: string, opts: DocsOptions): Promise<void> {
  const { apiUrl, token } = await resolveAuth(ctx, opts.api)
  const task = await findTask(ctx, apiUrl, token, taskId)
  const handed = await fetchTaskDocuments(ctx.fetchFn, apiUrl, token, task)
  if (opts.json) {
    ctx.out(JSON.stringify(handed.documents, null, 2))
    return
  }
  if (handed.documents.length === 0) {
    ctx.out('このタスクに渡された文書はありません')
    return
  }
  ctx.out(`「${task.taskName}」に渡された文書(${handed.documents.length} 件)`)
  ctx.out('')
  ctx.out(
    renderTable([
      ['ID', '文書', '版', '渡し方'],
      ...handed.documents.map((d) => [shortId(d.documentId), `${d.directoryName}/${d.name}`, String(d.currentVersion), d.viaDirectory ? 'ディレクトリ' : '個別']),
    ]),
  )
  ctx.out('')
  ctx.out(`本文を読む: ${CLI_NAME} doc ${shortId(task.taskId)} <文書の名前>   /   まとめて読む: ${CLI_NAME} context ${shortId(task.taskId)}`)
}

export type DocOptions = DocsOptions & { ver?: string }

/** 渡された文書の本文(Markdown そのまま)を、標準出力へ。`--ver N` で前の版 */
export async function doc(ctx: Context, taskId: string, query: string, opts: DocOptions): Promise<void> {
  const version = parseVersion(opts.ver)
  const { apiUrl, token } = await resolveAuth(ctx, opts.api)
  const task = await findTask(ctx, apiUrl, token, taskId)
  const handed = await fetchTaskDocuments(ctx.fetchFn, apiUrl, token, task)
  const found = findHandedDocument(handed.documents, query)
  const content = await fetchDocument(ctx.fetchFn, apiUrl, token, { productId: task.productId, documentId: found.documentId, version })
  if (opts.json) {
    ctx.out(JSON.stringify(content, null, 2))
    return
  }
  // Markdown そのまま(AI が読む・ファイルにリダイレクトする)。飾りは付けない
  ctx.out(content.content)
}

function parseVersion(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) throw new CliError(`--ver は 1 以上の整数で指定してください: ${value}`, EXIT.usage)
  return n
}

/**
 * AI に渡す、タスクの全体像を、Markdown 1 つにして出す: タスクの説明、渡された文書の本文、報告のしかた。
 * AI は、これを読んで作業を始める。文書を取るので、呼び出された日時が更新される(自動削除の基準)
 */
export async function context(ctx: Context, taskId: string, opts: DocsOptions): Promise<void> {
  const { apiUrl, token } = await resolveAuth(ctx, opts.api)
  const task = await findTask(ctx, apiUrl, token, taskId)
  const handed = await fetchTaskDocuments(ctx.fetchFn, apiUrl, token, task)
  const contents = []
  for (const d of handed.documents) {
    contents.push({ meta: d, body: await fetchDocument(ctx.fetchFn, apiUrl, token, { productId: task.productId, documentId: d.documentId }) })
  }

  if (opts.json) {
    ctx.out(JSON.stringify({ task, documents: contents.map((c) => ({ ...c.meta, version: c.body.version, content: c.body.content })) }, null, 2))
    return
  }

  const lines: string[] = [`# タスク: ${task.taskName}`, '']
  lines.push(`- ID: ${task.taskId}`)
  lines.push(`- プロダクト: ${task.productName}`)
  lines.push(`- 状態: ${STATUS_LABELS[task.status] ?? task.status}`)
  lines.push(`- 期限: ${formatDateTime(task.timeLimit)}`)
  if (task.description) lines.push('', '## 説明', '', task.description)
  lines.push('', '## 渡された文書', '')
  if (contents.length === 0) lines.push('(なし)')
  for (const c of contents) {
    lines.push(`### ${c.meta.directoryName}/${c.meta.name}(版 ${c.body.version})`, '', c.body.content, '')
  }
  lines.push('## 報告のしかた', '')
  lines.push(
    `作業が終わったら、結果を Markdown で書いて、\`${CLI_NAME} report ${shortId(task.taskId)} --file report.md\` で保存します(標準入力なら \`--stdin\`)。`,
    '保存した報告は「下書き」になり、担当者(人)が確認して、完了報告に出すか判断します。AI が自分で完了にはできません。',
  )
  ctx.out(lines.join('\n'))
}

export type ReportOptions = DocsOptions & { file?: string; stdin?: boolean; noRead?: boolean }

/**
 * 報告の下書きを保存する(AI 用のトークン)。本文は `--file <パス>` か `--stdin` で渡す。
 * 読んだ文書として、**そのタスクに渡された文書すべての、いまの版**を控える(`--no-read` で控えない)
 */
export async function report(ctx: Context, taskId: string, opts: ReportOptions): Promise<void> {
  if (opts.file && opts.stdin) throw new CliError('--file と --stdin は、同時に使えません', EXIT.usage)
  if (!opts.file && !opts.stdin) throw new CliError(`報告の本文を、--file <パス> か --stdin で渡してください\n例: ${CLI_NAME} report <タスクの ID> --file report.md`, EXIT.usage)

  const { apiUrl, token } = await resolveAuth(ctx, opts.api)
  if (!isAiToken(token)) {
    throw new CliError('報告の下書きを保存できるのは、AI 用のトークン(pmai_…)だけです。環境変数 NINGYOUTUKAI_TOKEN に入れて使ってください', EXIT.auth)
  }
  let body: string
  try {
    body = opts.file ? await ctx.readFile(opts.file) : await ctx.readStdin()
  } catch (e) {
    throw new CliError(`本文を読めませんでした: ${e instanceof Error ? e.message : String(e)}`, EXIT.usage)
  }
  body = body.trim()
  if (!body) throw new CliError('報告の本文が空です', EXIT.usage)
  if (body.length > REPORT_MAX_LENGTH) throw new CliError(`報告の本文が長すぎます(${body.length} 文字。上限は ${REPORT_MAX_LENGTH} 文字)`, EXIT.usage)

  const task = await findTask(ctx, apiUrl, token, taskId)
  const readDocuments = opts.noRead
    ? []
    : (await fetchTaskDocuments(ctx.fetchFn, apiUrl, token, task)).documents.map((d) => ({ documentId: d.documentId, version: d.currentVersion }))
  const draft = await saveReportDraft(ctx.fetchFn, apiUrl, token, task, { body, ...(readDocuments.length > 0 ? { readDocuments } : {}) })

  if (opts.json) {
    ctx.out(JSON.stringify(draft, null, 2))
    return
  }
  ctx.out(`報告の下書きを保存しました(${shortId(draft.draftId)})`)
  if (draft.readDocuments.length > 0) ctx.out(`読んだ文書: ${draft.readDocuments.map((d) => `${d.name}(版 ${d.version})`).join('、')}`)
  ctx.out('担当者(人)が確認して、完了報告に出すか判断します。')
}
