import { ChevronDown, ChevronRight, FilePlus, FileText, Folder, FolderPlus, Pencil, ShieldCheck, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '#/components/icon-button'
import type { DocDirectory } from '#/lib/document-api'
import { directoryNameError, documentNameError, editingLabel, ensureMdName } from '#/lib/document-tree'
import { useDocumentActions, useDocumentTree } from '#/lib/use-product-documents'

// 画面の右側に出す、ディレクトリのツリー(スマホは、画面いっぱいの 1 ページ)。仕様は docs/v4.0/overview.md
// - ディレクトリ(1 段)と、中の文書。文書を押すと、文書のダイアログ(プレビュー・編集)が開く
// - **編集中の文書には、緑の点と、編集している人の名前を出す。** 12 秒おきに取り直して更新する(リアルタイム通信は使わない)
// - リーダー: ディレクトリの追加・名前の変更・削除(文書が入っていると消せない)、権限の設定。書き込み権限のある人: 文書の追加
// - **ディレクトリも文書も、ツリーの中で名前を入力して追加する**(モーダルは開かない)。文書は、名前(`.md` は自動で付く)だけで作り、作ったら文書のダイアログを開く(本文は、そこで書く)
// 表示(`DocumentsPanelView`)と、データを取る・操作する部分(`DocumentsPanel`)に分けてある

export type DocumentsPanelViewProps = {
  directories: DocDirectory[] | undefined
  loading?: boolean
  error?: string | null
  myMemberId: string | undefined
  isLeader: boolean
  activeDocumentId?: string | null
  onClose: () => void
  onOpenDocument: (documentId: string) => void
  /** 書き込み権限のあるディレクトリに、名前だけで文書を作る(`.md` は付いた名前で渡る)。作れたら、親が文書を開く */
  onCreateDocument: (directory: DocDirectory, name: string) => Promise<void>
  /** リーダーだけ。渡さなければ、ボタンを出さない */
  onAddDirectory?: (name: string) => Promise<void>
  onRenameDirectory?: (directory: DocDirectory, name: string) => Promise<void>
  onDeleteDirectory?: (directory: DocDirectory) => Promise<void>
  onOpenPermissions?: (directory: DocDirectory) => void
}

export function DocumentsPanelView({
  directories,
  loading,
  error,
  myMemberId,
  isLeader,
  activeDocumentId,
  onClose,
  onOpenDocument,
  onCreateDocument,
  onAddDirectory,
  onRenameDirectory,
  onDeleteDirectory,
  onOpenPermissions,
}: DocumentsPanelViewProps) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // 文書を追加している最中のディレクトリと、入力中の名前
  const [addingDocIn, setAddingDocIn] = useState<string | null>(null)
  const [docName, setDocName] = useState('')
  // 閉じているディレクトリ(開閉は画面の中だけで覚える。既定は、すべて開いている)
  const [closedIds, setClosedIds] = useState<ReadonlySet<string>>(new Set())
  const toggleClosed = (id: string) =>
    setClosedIds((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const run = async (action: () => Promise<void>, done: () => void) => {
    try {
      await action()
      setFormError(null)
      done()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '失敗しました。時間をおいて、もう一度お試しください')
    }
  }

  return (
    <aside aria-label="文書" className="flex h-full min-h-0 flex-col bg-panel text-ink shadow-box">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="text-l font-bold">文書</h2>
        <div className="flex items-center gap-1">
          {isLeader && onAddDirectory && <IconButton icon={FolderPlus} label="ディレクトリを追加" size="sm" side="bottom" onClick={() => setAdding((a) => !a)} />}
          <IconButton icon={X} label="閉じる" size="sm" side="bottom" onClick={onClose} />
        </div>
      </header>

      {adding && onAddDirectory && (
        <form
          className="flex items-start gap-2 border-b border-line p-3"
          onSubmit={(e) => {
            e.preventDefault()
            const error = directoryNameError(newName)
            if (error) return setFormError(error)
            void run(() => onAddDirectory(newName.trim()), () => {
              setNewName('')
              setAdding(false)
            })
          }}
        >
          <input
            aria-label="ディレクトリの名前"
            autoFocus
            value={newName}
            maxLength={100}
            placeholder="ディレクトリの名前"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
            className="h-8 min-w-0 flex-1 bg-transparent px-2 text-m shadow-box outline-none placeholder:text-ink/45"
          />
          <IconButton icon={FolderPlus} label="追加" size="sm" variant="solid" type="submit" disabled={!newName.trim()} />
        </form>
      )}
      {formError && (
        <p role="alert" className="border-b border-line px-3 py-2 text-s text-danger">
          {formError}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error ? (
          <p role="alert" className="border-l border-line pl-3 text-m">
            ERR {error}
          </p>
        ) : loading || directories === undefined ? (
          <p className="p-2 text-m opacity-60">読み込み中…</p>
        ) : directories.length === 0 ? (
          <p className="p-2 text-m opacity-70"># ディレクトリはまだありません{isLeader ? '。右上の「ディレクトリを追加」から作れます' : ''}</p>
        ) : (
          <ul className="space-y-3">
            {directories.map((dir) => (
              <li key={dir.directoryId}>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-expanded={!closedIds.has(dir.directoryId)}
                    aria-label={closedIds.has(dir.directoryId) ? `${dir.name} を開く` : `${dir.name} を閉じる`}
                    onClick={() => toggleClosed(dir.directoryId)}
                    className="flex shrink-0 cursor-pointer items-center gap-0.5 hover:opacity-70 focus-visible:outline-none focus-visible:opacity-70"
                  >
                    {closedIds.has(dir.directoryId) ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                    <Folder size={16} aria-hidden="true" />
                  </button>
                  {renamingId === dir.directoryId && onRenameDirectory ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault()
                        const error = directoryNameError(renameValue)
                        if (error) return setFormError(error)
                        void run(() => onRenameDirectory(dir, renameValue.trim()), () => setRenamingId(null))
                      }}
                    >
                      <input aria-label="新しい名前" autoFocus value={renameValue} maxLength={100} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)} className="h-7 min-w-0 flex-1 bg-transparent px-2 text-m shadow-box outline-none" />
                      <IconButton icon={Pencil} label="名前を変える" size="sm" variant="solid" type="submit" />
                    </form>
                  ) : (
                    <>
                      <button type="button" tabIndex={-1} onClick={() => toggleClosed(dir.directoryId)} className="min-w-0 flex-1 cursor-pointer truncate text-left font-medium" title={dir.name}>
                        {dir.name}
                      </button>
                      {closedIds.has(dir.directoryId) && dir.documents.some((d) => d.editingBy) && <span data-editing="" title="編集中の文書があります" className="size-2 shrink-0 rounded-full bg-green-500" />}
                      <span className="shrink-0 text-s opacity-60">{dir.documents.length}</span>
                    </>
                  )}
                  {dir.myLevel === 'write' && (
                    <IconButton
                      icon={FilePlus}
                      label="文書を追加"
                      size="sm"
                      side="bottom"
                      pressed={addingDocIn === dir.directoryId}
                      onClick={() => {
                        setAddingDocIn((cur) => (cur === dir.directoryId ? null : dir.directoryId))
                        setClosedIds((cur) => {
                          const next = new Set(cur)
                          next.delete(dir.directoryId)
                          return next
                        })
                        setDocName('')
                        setFormError(null)
                      }}
                    />
                  )}
                  {isLeader && onOpenPermissions && <IconButton icon={ShieldCheck} label="権限" size="sm" side="bottom" onClick={() => onOpenPermissions(dir)} />}
                  {isLeader && onRenameDirectory && renamingId !== dir.directoryId && (
                    <IconButton
                      icon={Pencil}
                      label="名前を変える"
                      size="sm"
                      side="bottom"
                      onClick={() => {
                        setRenamingId(dir.directoryId)
                        setRenameValue(dir.name)
                      }}
                    />
                  )}
                  {isLeader && onDeleteDirectory && (
                    <IconButton icon={Trash2} label="ディレクトリを削除" size="sm" side="bottom" variant={confirmDeleteId === dir.directoryId ? 'danger-solid' : 'plain'} onClick={() => {
                      if (confirmDeleteId !== dir.directoryId) return setConfirmDeleteId(dir.directoryId)
                      void run(() => onDeleteDirectory(dir), () => setConfirmDeleteId(null))
                    }} />
                  )}
                </div>
                {confirmDeleteId === dir.directoryId && (
                  <p role="alert" className="ml-5 text-s text-danger">
                    もう一度押すと「{dir.name}」を削除します(文書が入っていると削除できません)
                  </p>
                )}
                {!closedIds.has(dir.directoryId) && addingDocIn === dir.directoryId && (
                  <form
                    className="ml-5 mt-1 flex items-start gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const finalName = ensureMdName(docName)
                      const error = documentNameError(finalName)
                      if (error) return setFormError(error)
                      void run(() => onCreateDocument(dir, finalName), () => {
                        setDocName('')
                        setAddingDocIn(null)
                      })
                    }}
                  >
                    <input
                      aria-label="文書の名前"
                      autoFocus
                      value={docName}
                      maxLength={100}
                      placeholder="文書の名前(.md は自動)"
                      onChange={(e) => setDocName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setAddingDocIn(null)}
                      className="h-8 min-w-0 flex-1 bg-transparent px-2 text-m shadow-box outline-none placeholder:text-ink/45"
                    />
                    <IconButton icon={FilePlus} label="追加" size="sm" variant="solid" type="submit" disabled={!docName.trim()} />
                  </form>
                )}
                {closedIds.has(dir.directoryId) ? null : dir.documents.length === 0 ? (
                  <p className="ml-5 text-s opacity-60"># 文書なし</p>
                ) : (
                  <ul className="ml-3 mt-1 border-l border-line">
                    {dir.documents.map((doc) => {
                      const editing = editingLabel(doc, myMemberId)
                      return (
                        <li key={doc.documentId}>
                          <button
                            type="button"
                            aria-current={activeDocumentId === doc.documentId ? 'true' : undefined}
                            onClick={() => onOpenDocument(doc.documentId)}
                            className={`flex w-full cursor-pointer items-start gap-2 px-2 py-1 text-left hover:bg-side-item focus-visible:bg-side-item focus-visible:outline-none ${activeDocumentId === doc.documentId ? 'bg-side-item' : ''}`}
                          >
                            <FileText size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-m" title={doc.name}>
                                {doc.name}
                              </span>
                              {editing && (
                                <span data-editing="" className="flex items-center gap-1 text-s">
                                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-green-500" />
                                  {editing}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-s opacity-60">v{doc.currentVersion}</span>
                            {doc.keepForever && (
                              <span title="自動削除しない" className="shrink-0 text-s opacity-60">
                                📌
                              </span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

/** データを取って、操作をつなぐ。ツリーは、開いている間、12 秒おきに取り直す(編集中の緑の点と名前を更新する) */
export function DocumentsPanel({
  productId,
  isLeader,
  myMemberId,
  activeDocumentId,
  onClose,
  onOpenDocument,
  onCreateDocument,
  onOpenPermissions,
}: {
  productId: string
  isLeader: boolean
  myMemberId: string | undefined
  activeDocumentId?: string | null
  onClose: () => void
  onOpenDocument: (documentId: string) => void
  onCreateDocument: (directory: DocDirectory, name: string) => Promise<void>
  onOpenPermissions?: (directory: DocDirectory) => void
}) {
  const tree = useDocumentTree(productId, { poll: true })
  const actions = useDocumentActions(productId)
  return (
    <DocumentsPanelView
      directories={tree.data}
      loading={tree.isPending}
      error={tree.isError && tree.data === undefined ? tree.error.message : null}
      myMemberId={myMemberId}
      isLeader={isLeader}
      activeDocumentId={activeDocumentId}
      onClose={onClose}
      onOpenDocument={onOpenDocument}
      onCreateDocument={onCreateDocument}
      onAddDirectory={isLeader ? async (name) => void (await actions.createDirectory(name)) : undefined}
      onRenameDirectory={isLeader ? (dir, name) => actions.renameDirectory(dir.directoryId, name) : undefined}
      onDeleteDirectory={isLeader ? (dir) => actions.deleteDirectory(dir.directoryId) : undefined}
      onOpenPermissions={isLeader ? onOpenPermissions : undefined}
    />
  )
}
