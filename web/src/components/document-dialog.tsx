import { Check, Pencil, Save, Timer, TimerOff, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { EditingDot } from '#/components/editing-dot'
import { IconButton } from '#/components/icon-button'
import { LockNoticeBanner } from '#/components/lock-notice'
import { MarkdownView } from '#/components/markdown-view'
import { Modal } from '#/components/modal'
import { SaveModeDialog, type SaveMode } from '#/components/save-mode-dialog'
import { canEditDocument, canSave, contentTooLarge, editingLabel, formatDocDate, lockNotice, textareaEditable } from '#/lib/document-tree'
import { useEditLock } from '#/lib/use-edit-lock'
import { useDocument, useDocumentActions, useDocumentTree, useDocumentVersions } from '#/lib/use-product-documents'

// 文書のダイアログ(大きいモーダル): プレビュー(読む)・編集・履歴。仕様は docs/v4.0/overview.md
// - 読む: 参加者全員。Markdown のプレビュー(生の HTML は描かない)。取ると、呼び出された日時が更新される(自動削除の基準)
// - 編集: そのディレクトリの書き込み権限がある人(リーダーは常に)。**同時に編集はできない**: 編集を始めるとロックを取り、他の人が編集中なら、編集できない(名前を出す)
//   - **30 分、編集がなければ外れる。解除の 1 分前に予告を出し、外れたら知らせる**(入力した内容は残る。取り直せる)
//   - 広い画面は、左に書く欄、右にプレビュー。狭い画面は、「編集」と「プレビュー」の切り替え
//   - 保存を押すと確認のモーダルが出て、「新しい版として残す」(前の版は残る)か「いまの版を上書き」(版は増えない)を選ぶ。保存のときに「割り振られたメンバーにメールで知らせる」のチェック(初期は付ける)
// - 履歴: 前の版を読める(戻す操作はない)。リーダー: 「自動削除しない」の切り替え。書き込み権限のある人: 削除(2 段階)

export function DocumentDialog({
  productId,
  documentId,
  isLeader,
  myMemberId,
  onClose,
}: {
  productId: string
  documentId: string | null
  isLeader: boolean
  myMemberId: string | undefined
  onClose: () => void
}) {
  return (
    <Modal open={documentId !== null} onClose={onClose} size="full" closeOnBackdrop={false}>
      {documentId !== null && <Body key={documentId} productId={productId} documentId={documentId} isLeader={isLeader} myMemberId={myMemberId} onClose={onClose} />}
    </Modal>
  )
}

function Body({ productId, documentId, isLeader, myMemberId, onClose }: { productId: string; documentId: string; isLeader: boolean; myMemberId: string | undefined; onClose: () => void }) {
  const actions = useDocumentActions(productId)
  const tree = useDocumentTree(productId)
  const [viewVersion, setViewVersion] = useState<number | undefined>(undefined)
  const doc = useDocument(productId, documentId, viewVersion)
  // 履歴は、読んでいる間、常に右に出す(編集中は隠す)
  const versions = useDocumentVersions(productId, documentId, true)

  // ツリーの情報(ディレクトリ・自分の権限・編集中の人)。ツリーは別の画面が取り直しているので、ここは同じキャッシュを読む
  const directory = tree.data?.find((d) => d.documents.some((x) => x.documentId === documentId))
  const summary = directory?.documents.find((x) => x.documentId === documentId)
  const level = directory?.myLevel ?? 'read'

  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [draft, setDraft] = useState('')
  const [original, setOriginal] = useState('')
  const [baseVersion, setBaseVersion] = useState(1)
  const [notify, setNotify] = useState(true)
  // 保存を押すと出す確認(新しい版として残すか、上書きか)
  const [confirmSave, setConfirmSave] = useState(false)
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const lock = useEditLock(productId, documentId, mode === 'edit')
  const notice = lockNotice(lock.state, lock.now)
  const dirty = mode === 'edit' && draft !== original

  // 編集中に画面を離れる・閉じるとき、書きかけの内容を失わないよう、ブラウザの確認を出す
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const current = doc.data
  const isLatest = current !== undefined && current.version === current.currentVersion
  const mayEdit = current !== undefined && isLatest && canEditDocument(level, summary?.editingBy ?? null, myMemberId) && mode === 'view'
  const others = summary?.editingBy && summary.editingBy.memberId !== myMemberId ? editingLabel(summary, myMemberId) : null

  const requestClose = () => {
    if (dirty && !window.confirm('保存していない変更があります。閉じると、内容は失われます。閉じますか?')) return
    onClose()
  }

  const startEdit = () => {
    if (!current) return
    setOriginal(current.content)
    setDraft(current.content)
    setBaseVersion(current.currentVersion)
    setNotify(true)
    setConfirmSave(false)
    setTab('edit')
    setError(null)
    setMode('edit')
  }
  const cancelEdit = () => {
    if (dirty && !window.confirm('保存していない変更を捨てます。よろしいですか?')) return
    setMode('view')
    setError(null)
  }
  const save = async (saveMode: SaveMode) => {
    setConfirmSave(false)
    setSaving(true)
    setError(null)
    try {
      await actions.save(documentId, { content: draft, baseVersion, notify, mode: saveMode })
      setMode('view')
      setViewVersion(undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。時間をおいて、もう一度お試しください')
    } finally {
      setSaving(false)
    }
  }
  const remove = async () => {
    setError(null)
    try {
      await actions.remove(documentId)
      onClose()
    } catch (e) {
      setConfirmDelete(false)
      setError(e instanceof Error ? e.message : '削除できませんでした')
    }
  }
  const toggleKeep = async () => {
    setError(null)
    try {
      await actions.update(documentId, { keepForever: !(current?.keepForever ?? false) })
    } catch (e) {
      setError(e instanceof Error ? e.message : '変更できませんでした')
    }
  }

  const previewSource = mode === 'edit' ? draft : (current?.content ?? '')
  const tooLarge = useMemo(() => mode === 'edit' && contentTooLarge(draft), [mode, draft])

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel text-ink">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-l font-black" title={current?.name}>
            {directory ? `${directory.name}/` : ''}
            {current?.name ?? '文書'}
          </h2>
          <p className="flex flex-wrap items-center gap-x-3 text-s opacity-70">
            {current && (
              <>
                <span>
                  版 {current.version}
                  {!isLatest && `(最新は版 ${current.currentVersion})`}
                </span>
                {summary && <span>更新 {formatDocDate(summary.updatedAt)}</span>}
                {summary?.keepForever && <span>自動削除しない</span>}
              </>
            )}
            {others && (
              <span data-editing="" className="flex items-center gap-1">
                <EditingDot />
                {others}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {mode === 'view' && (
            <>
              {isLeader && current && (
                <IconButton icon={current.keepForever ? Timer : TimerOff} label={current.keepForever ? '自動削除する設定に戻す' : '自動削除しない'} size="sm" side="bottom" onClick={() => void toggleKeep()} />
              )}
              {level === 'write' &&
                (confirmDelete ? (
                  <>
                    <IconButton icon={Trash2} label="削除する" showLabel size="sm" variant="danger-solid" onClick={() => void remove()} />
                    <IconButton icon={X} label="やめる" size="sm" variant="outline" onClick={() => setConfirmDelete(false)} />
                  </>
                ) : (
                  <IconButton icon={Trash2} label="削除" size="sm" side="bottom" variant="danger" onClick={() => setConfirmDelete(true)} />
                ))}
              {mayEdit && <IconButton icon={Pencil} label="編集" showLabel size="sm" variant="solid" onClick={startEdit} />}
            </>
          )}
          <IconButton icon={X} label="閉じる" size="sm" side="bottom" onClick={requestClose} />
        </div>
      </header>

      <LockNoticeBanner notice={notice} onReacquire={() => void lock.reacquire()} />
      {error && (
        <p role="alert" className="border-b border-line px-4 py-2 text-m text-danger">
          {error}
        </p>
      )}
      {confirmDelete && mode === 'view' && (
        <p role="alert" className="border-b border-line px-4 py-2 text-m text-danger">
          「{current?.name}」を削除します。全ての版が消え、戻せません。
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {doc.isPending ? (
            <p className="p-4 text-m opacity-60">読み込み中…</p>
          ) : doc.isError ? (
            <p role="alert" className="p-4 text-m">
              ERR {doc.error.message}
            </p>
          ) : mode === 'edit' ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex gap-1 border-b border-line px-4 py-2 md:hidden" role="tablist" aria-label="編集とプレビュー">
                {(['edit', 'preview'] as const).map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`cursor-pointer px-3 py-1 text-m ${tab === t ? 'bg-side-item' : ''}`}>
                    {t === 'edit' ? '編集' : 'プレビュー'}
                  </button>
                ))}
              </div>
              <div className="grid min-h-0 flex-1 md:grid-cols-2">
                <textarea
                  aria-label="文書の本文(Markdown)"
                  value={draft}
                  readOnly={!textareaEditable(lock.state)}
                  spellCheck={false}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    lock.markEdited()
                  }}
                  className={`${tab === 'edit' ? 'block' : 'hidden'} min-h-[40dvh] resize-none bg-transparent p-4 font-mono text-m leading-relaxed outline-none md:block md:border-r md:border-line`}
                />
                <div className={`${tab === 'preview' ? 'block' : 'hidden'} min-h-0 overflow-y-auto p-4 md:block`}>
                  <MarkdownView source={previewSource} />
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl p-4">
              {!isLatest && current && (
                <p role="status" className="mb-3 border-l-4 border-line bg-side-item px-3 py-2 text-m">
                  前の版(版 {current.version})を表示しています。{' '}
                  <button type="button" className="cursor-pointer underline" onClick={() => setViewVersion(undefined)}>
                    最新(版 {current.currentVersion})に戻る
                  </button>
                </p>
              )}
              <MarkdownView source={current?.content ?? ''} />
            </div>
          )}
        </div>

        {mode === 'view' && (
          <aside aria-label="履歴" className="w-56 shrink-0 overflow-y-auto border-l border-line p-2">
            <h3 className="px-2 pb-1 text-m font-medium">履歴</h3>
            {versions.isPending ? (
              <p className="px-2 text-s opacity-60">読み込み中…</p>
            ) : versions.data === undefined ? (
              <p role="alert" className="px-2 text-s">ERR 履歴を読めませんでした</p>
            ) : (
              <ul>
                {versions.data.map((v) => (
                  <li key={v.version}>
                    <button
                      type="button"
                      aria-current={(viewVersion ?? current?.currentVersion) === v.version ? 'true' : undefined}
                      onClick={() => setViewVersion(v.version === current?.currentVersion ? undefined : v.version)}
                      className={`w-full cursor-pointer px-2 py-1 text-left text-m hover:bg-side-item ${(viewVersion ?? current?.currentVersion) === v.version ? 'bg-side-item' : ''}`}
                    >
                      版 {v.version}
                      <span className="block text-s font-normal opacity-70">
                        {formatDocDate(v.createdAt)} {v.authorName ?? '退会したユーザー'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>

      <SaveModeDialog open={confirmSave} onChoose={(m) => void save(m)} onClose={() => setConfirmSave(false)} />
      {mode === 'edit' && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-m">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            割り振られたメンバーにメールで知らせる
          </label>
          <div className="flex items-center gap-2">
            {tooLarge && <span role="alert" className="text-s text-danger">本文は 1MB までです</span>}
            <IconButton icon={X} label="編集をやめる" showLabel variant="outline" disabled={saving} onClick={cancelEdit} />
            <IconButton icon={saving ? Check : Save} label={saving ? '保存中…' : '保存'} showLabel variant="solid" disabled={saving || !canSave(lock.state, draft, original)} onClick={() => setConfirmSave(true)} />
          </div>
        </footer>
      )}
    </div>
  )
}
