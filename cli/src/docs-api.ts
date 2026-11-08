import type { Fetch } from './api'
import { CliError } from './errors'
import { requestJson, type MyTask } from './tasks-api'

// 文書(Markdown)・報告の下書き・AI 用のトークンの API。応答の形は api と同じ(日時は ISO 文字列)

/** AI 用のトークンは `pmai_` で始まる(api の `AI_TOKEN_PREFIX`)。AI 用のトークンは、メッセージ履歴などを読めない */
export const isAiToken = (token: string) => token.startsWith('pmai_')

/** タスクに渡された文書 1 件(本文なし) */
export type HandedDocument = {
  documentId: string
  name: string
  directoryId: string
  directoryName: string
  currentVersion: number
  /** ディレクトリを渡したことで渡った(文書を個別にも渡していれば false) */
  viaDirectory: boolean
}
export type TaskDocuments = { documents: HandedDocument[]; documentIds: string[]; directoryIds: string[] }

/** 文書 1 件(本文つき)。`version` は本文の版 */
export type DocumentContent = {
  documentId: string
  directoryId: string
  name: string
  currentVersion: number
  version: number
  content: string
  sizeBytes: number
}

export type DraftReadDocument = { documentId: string; name: string; version: number }
export type ReportDraft = {
  draftId: string
  taskId: string
  aiName: string
  body: string
  readDocuments: DraftReadDocument[]
  status: 'pending' | 'adopted' | 'discarded'
  createdAt: string
  decidedAt: string | null
}

export type AiTokenInfo = {
  tokenId: string
  name: string
  tokenPrefix: string
  createdAt: string
  expiresAt: string
  lastUsedAt: string | null
  revokedAt: string | null
  active: boolean
}

type TaskRef = Pick<MyTask, 'productId' | 'taskId'>

/** タスクに渡された文書の一覧。`GET /api/product/:productId/task/:taskId/document` */
export function fetchTaskDocuments(fetchFn: Fetch, apiUrl: string, token: string, task: TaskRef): Promise<TaskDocuments> {
  return requestJson<TaskDocuments>(fetchFn, `${apiUrl}/api/product/${task.productId}/task/${task.taskId}/document`, token)
}

/**
 * 渡された文書の一覧。ただし、api が古くて、このエンドポイントがないとき(404)は、空として扱う。
 * `task` の詳細が、文書の機能がない api でも動くように(それ以外のエラーは、そのまま失敗)
 */
export async function fetchTaskDocumentsOrEmpty(fetchFn: Fetch, apiUrl: string, token: string, task: TaskRef): Promise<HandedDocument[]> {
  try {
    return (await fetchTaskDocuments(fetchFn, apiUrl, token, task)).documents
  } catch (e) {
    if (e instanceof CliError && e.message.includes('(404)')) return []
    throw e
  }
}

/** 文書の本文。`GET /api/product/:productId/document/:documentId`(取ると、呼び出された日時が更新される) */
export function fetchDocument(
  fetchFn: Fetch,
  apiUrl: string,
  token: string,
  ref: { productId: string; documentId: string; version?: number },
): Promise<DocumentContent> {
  const query = ref.version ? `?version=${ref.version}` : ''
  return requestJson<DocumentContent>(fetchFn, `${apiUrl}/api/product/${ref.productId}/document/${ref.documentId}${query}`, token)
}

/** 報告の下書きを保存する(AI 用のトークン)。`POST /api/product/:productId/task/:taskId/report-draft` */
export function saveReportDraft(
  fetchFn: Fetch,
  apiUrl: string,
  token: string,
  task: TaskRef,
  body: { body: string; readDocuments?: { documentId: string; version: number }[] },
): Promise<ReportDraft> {
  return requestJson<ReportDraft>(fetchFn, `${apiUrl}/api/product/${task.productId}/task/${task.taskId}/report-draft`, token, {
    method: 'POST',
    body,
  })
}

export function listAiTokens(fetchFn: Fetch, apiUrl: string, token: string): Promise<AiTokenInfo[]> {
  return requestJson<AiTokenInfo[]>(fetchFn, `${apiUrl}/api/me/ai-token`, token)
}

/** AI 用のトークンを発行する。中身(`token`)は、この応答でだけ返る */
export function createAiToken(
  fetchFn: Fetch,
  apiUrl: string,
  token: string,
  body: { name: string; expiresInDays?: number },
): Promise<AiTokenInfo & { token: string }> {
  return requestJson<AiTokenInfo & { token: string }>(fetchFn, `${apiUrl}/api/me/ai-token`, token, { method: 'POST', body })
}

export function revokeAiToken(fetchFn: Fetch, apiUrl: string, token: string, tokenId: string): Promise<void> {
  return requestJson<void>(fetchFn, `${apiUrl}/api/me/ai-token/${tokenId}`, token, { method: 'DELETE' })
}
