import { ApiError } from '#/lib/api'
import { eden, edenData, type Json } from '#/lib/eden'

// 文書(Markdown)・ディレクトリ・編集ロック・権限・自動削除の設定・報告の下書き・AI 用のトークンの、api の呼び出し。
// 型は api から取る(Eden)。仕様は docs/v4.0/overview.md

type Client = ReturnType<typeof eden>
type Product = ReturnType<Client['api']['product']>
type Success<R extends { data: unknown; error: unknown }> = NonNullable<Extract<R, { error: null }>['data']>

/** ディレクトリ(中の文書の概要つき。本文は含まない) */
export type DocDirectory = Json<Success<Awaited<ReturnType<Product['directory']['get']>>>>[number]
/** 文書の概要(一覧に出す項目。`editingBy` = いま編集している人 = 緑の点と名前) */
export type DocSummary = DocDirectory['documents'][number]
/** 文書 1 件(本文つき) */
export type DocDetail = Json<Success<Awaited<ReturnType<ReturnType<Product['document']>['get']>>>>
export type DocVersion = Json<Success<Awaited<ReturnType<ReturnType<Product['document']>['version']['get']>>>>[number]
/** ディレクトリごとの権限(リーダー以外の全メンバー) */
export type DirectoryPermission = Json<Success<Awaited<ReturnType<ReturnType<Product['directory']>['permission']['get']>>>>[number]

const product = (productId: string) => eden().api.product({ productId })

// ---- ディレクトリ ----
export const listDirectories = (productId: string) => edenData(product(productId).directory.get())
export const createDirectory = (productId: string, name: string) => edenData(product(productId).directory.post({ name }))
export const renameDirectory = (productId: string, directoryId: string, name: string) => edenData(product(productId).directory({ directoryId }).patch({ name }))
export const deleteDirectory = (productId: string, directoryId: string) => edenData(product(productId).directory({ directoryId }).delete())

// ---- ディレクトリの権限(リーダーだけ) ----
export const listDirectoryPermissions = (productId: string, directoryId: string) => edenData(product(productId).directory({ directoryId }).permission.get())
export const setDirectoryPermission = (productId: string, directoryId: string, memberId: string, level: 'read' | 'write') =>
  edenData(product(productId).directory({ directoryId }).permission({ memberId }).put({ level }))

// ---- 文書 ----
export const getDocument = (productId: string, documentId: string, version?: number) =>
  edenData(product(productId).document({ documentId }).get({ query: version ? { version } : {} }))
export const listDocumentVersions = (productId: string, documentId: string) => edenData(product(productId).document({ documentId }).version.get())
export const createDocument = (productId: string, directoryId: string, input: { name: string; content: string }) =>
  edenData(product(productId).directory({ directoryId }).document.post(input))
/** 保存(`mode` 省略は新しい版。'overwrite' はいまの版を上書き)。`baseVersion` = 開いたときの版。`notify` = 割り振られたメンバーにメールで知らせるか(省略は知らせる) */
export const saveDocument = (productId: string, documentId: string, input: { content: string; baseVersion: number; notify?: boolean; mode?: 'new' | 'overwrite' }) =>
  edenData(product(productId).document({ documentId }).put(input))
export const updateDocument = (productId: string, documentId: string, patch: { name?: string; directoryId?: string; keepForever?: boolean }) =>
  edenData(product(productId).document({ documentId }).patch(patch))
export const deleteDocument = (productId: string, documentId: string) => edenData(product(productId).document({ documentId }).delete())

// ---- 編集ロック ----
export type DocLock = { held: true; idleMsLeft: number; msLeft: number; warnBeforeMs: number; lockedBy: { memberId: string; userName: string } }
/** ロックが取れない・外れている、ときの結果。`taken` = 他の人が編集中 / `released` = 外れている(30 分の編集なし、通信の途絶) */
export type LockConflict = { ok: false; reason: 'taken' | 'released'; message: string; lockedBy: { memberId: string; userName: string } | null }
export type LockResult = { ok: true; lock: DocLock } | LockConflict

/**
 * ロックの呼び出し。409(取れない・外れている)は、例外にせず、`reason` つきの結果で返す(`edenData` は `reason` を残さないため)。
 * それ以外のエラーは、`edenData` と同じく `ApiError` を投げる
 */
async function lockCall(call: Promise<{ data: unknown; error: unknown; status?: number }>): Promise<LockResult> {
  const res = await call
  if (res.error === null) return { ok: true, lock: res.data as DocLock }
  const { status, value } = res.error as { status: number; value: unknown }
  if (status === 409 && typeof value === 'object' && value !== null) {
    const v = value as { message?: string; reason?: string; lockedBy?: LockConflict['lockedBy'] }
    if (v.reason === 'taken' || v.reason === 'released') {
      return { ok: false, reason: v.reason, message: v.message ?? '編集ロックが取れません', lockedBy: v.lockedBy ?? null }
    }
  }
  const message = typeof value === 'object' && value !== null && typeof (value as { message?: unknown }).message === 'string' ? (value as { message: string }).message : 'エラーが発生しました'
  throw new ApiError(value instanceof Error ? 0 : status, value instanceof Error ? 'サーバーに接続できませんでした。時間をおいて、もう一度お試しください' : message)
}
export const acquireDocumentLock = (productId: string, documentId: string) => lockCall(product(productId).document({ documentId }).lock.post())
/** 知らせ(ハートビート)。`edited` = 前回から今回の間に、内容を編集したか。外れていたら `ok: false`(`released` か `taken`) */
export const heartbeatDocumentLock = (productId: string, documentId: string, edited: boolean) =>
  lockCall(product(productId).document({ documentId }).lock.put({ edited }))
export const releaseDocumentLock = (productId: string, documentId: string) => edenData(product(productId).document({ documentId }).lock.delete())

// ---- 自動削除の設定(プロダクトの設定。リーダーだけ) ----
export const updateDocumentSetting = (productId: string, documentAutoDeleteDays: number) =>
  edenData(product(productId)['document-setting'].patch({ documentAutoDeleteDays }))

// ---- タスクに渡す文書 ----
export type TaskDocuments = Json<Success<Awaited<ReturnType<ReturnType<Product['task']>['document']['get']>>>>
export const getTaskDocuments = (productId: string, taskId: string) => edenData(product(productId).task({ taskId }).document.get())
export const setTaskDocuments = (productId: string, taskId: string, input: { documentIds: string[]; directoryIds: string[] }) =>
  edenData(product(productId).task({ taskId }).document.put(input))

// ---- AI の報告の下書き(担当者が確認する) ----
export type ReportDraft = Json<Success<Awaited<ReturnType<ReturnType<Product['task']>['report-draft']['get']>>>>[number]
export const listReportDrafts = (productId: string, taskId: string, status: 'pending' | 'adopted' | 'discarded' | 'all' = 'pending') =>
  edenData(product(productId).task({ taskId })['report-draft'].get({ query: { status } }))
export const adoptReportDraft = (productId: string, taskId: string, draftId: string, body?: string) =>
  edenData(product(productId).task({ taskId })['report-draft']({ draftId }).adopt.post(body === undefined ? undefined : { body }))
export const discardReportDraft = (productId: string, taskId: string, draftId: string) =>
  edenData(product(productId).task({ taskId })['report-draft']({ draftId }).discard.post())

// ---- AI 用のトークン(自分の分) ----
export type AiTokenInfo = Json<Success<Awaited<ReturnType<Client['api']['me']['ai-token']['get']>>>>[number]
export const listAiTokens = () => edenData(eden().api.me['ai-token'].get())
export const createAiToken = (input: { name: string; expiresInDays?: number }) => edenData(eden().api.me['ai-token'].post(input))
export const revokeAiToken = (tokenId: string) => edenData(eden().api.me['ai-token']({ tokenId }).delete())
