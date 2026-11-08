import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createDirectory,
  createDocument,
  deleteDirectory,
  deleteDocument,
  getDocument,
  listDirectories,
  listDirectoryPermissions,
  listDocumentVersions,
  renameDirectory,
  saveDocument,
  setDirectoryPermission,
  updateDocument,
} from '#/lib/document-api'
import { retryDelay, retryTransient } from '#/lib/query-retry'

// 文書(Markdown)とディレクトリの、取得と操作のフック。仕様は docs/v4.0/overview.md

/** ツリーを取り直す間隔(ms)。**10〜15 秒おきの確認**で、緑の点(編集中)と名前を更新する(リアルタイム通信は使わない) */
export const TREE_POLL_MS = 12_000

export const documentTreeKey = (productId: string) => ['products', productId, 'documents'] as const
export const documentKey = (productId: string, documentId: string, version?: number) =>
  ['products', productId, 'document', documentId, version ?? 'current'] as const

/**
 * ディレクトリと文書の一覧(本文なし)。`poll` が true の間(文書の画面を開いている間)だけ、一定間隔で取り直す。
 * 画面が裏に回っている間は取り直さない(react-query の既定)
 */
export function useDocumentTree(productId: string, options: { poll?: boolean; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: documentTreeKey(productId),
    queryFn: () => listDirectories(productId),
    enabled: options.enabled ?? true,
    refetchInterval: options.poll ? TREE_POLL_MS : false,
    retry: retryTransient,
    retryDelay,
  })
}

/** 文書 1 件(本文つき)。取ると、呼び出された日時が更新される(自動削除の基準)。`version` で前の版 */
export function useDocument(productId: string, documentId: string | null, version?: number) {
  return useQuery({
    queryKey: documentKey(productId, documentId ?? 'none', version),
    queryFn: () => getDocument(productId, documentId!, version),
    enabled: documentId !== null,
    retry: retryTransient,
    retryDelay,
  })
}

export function useDocumentVersions(productId: string, documentId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['products', productId, 'document', documentId ?? 'none', 'versions'] as const,
    queryFn: () => listDocumentVersions(productId, documentId!),
    enabled: enabled && documentId !== null,
    retry: retryTransient,
    retryDelay,
  })
}

/** ディレクトリごとの権限(リーダー以外の全メンバー)。リーダーだけ */
export function useDirectoryPermissions(productId: string, directoryId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['products', productId, 'directory-permissions', directoryId ?? 'none'] as const,
    queryFn: () => listDirectoryPermissions(productId, directoryId!),
    enabled: enabled && directoryId !== null,
    retry: retryTransient,
    retryDelay,
  })
}

/**
 * ディレクトリ・文書の操作。成功したら、ツリーを取り直す(画面に反映する)。失敗は、呼び出し側が受ける(`ApiError`)。
 * 保存(`save`)は、その文書の本文のキャッシュも取り直す
 */
export function useDocumentActions(productId: string) {
  const client = useQueryClient()
  const refreshTree = () => client.invalidateQueries({ queryKey: documentTreeKey(productId) })
  const refreshDocument = (documentId: string) => client.invalidateQueries({ queryKey: ['products', productId, 'document', documentId] })
  return {
    createDirectory: async (name: string) => {
      const created = await createDirectory(productId, name)
      await refreshTree()
      return created
    },
    renameDirectory: async (directoryId: string, name: string) => {
      await renameDirectory(productId, directoryId, name)
      await refreshTree()
    },
    deleteDirectory: async (directoryId: string) => {
      await deleteDirectory(productId, directoryId)
      await refreshTree()
    },
    createDocument: async (directoryId: string, input: { name: string; content: string }) => {
      const created = await createDocument(productId, directoryId, input)
      await refreshTree()
      return created
    },
    save: async (documentId: string, input: { content: string; baseVersion: number; notify?: boolean }) => {
      const saved = await saveDocument(productId, documentId, input)
      await Promise.all([refreshTree(), refreshDocument(documentId)])
      return saved
    },
    update: async (documentId: string, patch: { name?: string; directoryId?: string; keepForever?: boolean }) => {
      const updated = await updateDocument(productId, documentId, patch)
      await Promise.all([refreshTree(), refreshDocument(documentId)])
      return updated
    },
    remove: async (documentId: string) => {
      await deleteDocument(productId, documentId)
      await refreshTree()
    },
    setPermission: async (directoryId: string, memberId: string, level: 'read' | 'write') => {
      await setDirectoryPermission(productId, directoryId, memberId, level)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['products', productId, 'directory-permissions', directoryId] }),
        refreshTree(),
      ])
    },
  }
}
