import { Check, FileText, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconButton } from '#/components/icon-button'
import { MarkdownView } from '#/components/markdown-view'
import { Modal } from '#/components/modal'
import { adoptReportDraft, discardReportDraft, listReportDrafts, type ReportDraft } from '#/lib/document-api'
import { formatDocDate } from '#/lib/document-tree'
import { retryDelay, retryTransient } from '#/lib/query-retry'

// AI からの報告の下書き(担当者が確認する)。仕様は docs/v4.0/overview.md
// - AI は、担当者の道具。AI が保存した報告は、まず**下書き**になる(リーダーには見えない。担当者だけが見る)
// - 担当者は、①そのまま報告に出す ②**直して**報告に出す ③却下する、を選ぶ。**出すと、完了報告になり(確認待ち)、リーダーに知らせる**
// - AI が自分で完了にはできない。最終確認は、人のリーダー
// - 詳細のモーダルは狭いので、下書きは**詳細に 1 行(AI の名前・日時)だけ出し、「確認する」で大きいモーダルを開いて読む**(本文を広く、スクロールは本文だけ)

export const REPORT_MAX_LENGTH = 10000

/** AI が読んだ文書を、`ディレクトリ/名前(版 N)` の並びにする */
export function readDocumentsText(draft: Pick<ReportDraft, 'readDocuments'>): string {
  return draft.readDocuments.map((d) => `${d.name}(版 ${d.version})`).join('、')
}

/** 下書き 1 件(大きいモーダルの中身)。直している間は、入力欄を出す */
export function ReportDraftCard({
  draft,
  pending,
  error,
  onAdopt,
  onDiscard,
  onClose,
}: {
  draft: ReportDraft
  pending?: boolean
  error?: string | null
  /** `body` を渡すと、直した本文で出す */
  onAdopt: (body?: string) => void
  onDiscard: () => void
  /** 大きいモーダルの中で使うとき、見出しに「閉じる」を出す */
  onClose?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(draft.body)
  const empty = !text.trim()
  const tooLong = text.length > REPORT_MAX_LENGTH

  return (
    <article aria-label="報告の下書き" data-draft={draft.draftId} className="flex h-full min-h-0 flex-col bg-panel text-ink">
      <header className="space-y-1 border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-l font-black">AI「{draft.aiName}」の下書き</h2>
          <div className="flex shrink-0 items-center gap-2">
            <p className="text-s opacity-70">{formatDocDate(draft.createdAt)}</p>
            {onClose && <IconButton icon={X} label="閉じる" size="sm" side="bottom" onClick={onClose} />}
          </div>
        </div>
        {draft.readDocuments.length > 0 && (
          <p className="flex items-start gap-1 text-s opacity-80">
            <FileText size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>読んだ文書: {readDocumentsText(draft)}</span>
          </p>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {editing ? (
          <div className="flex h-full flex-col gap-1">
            <textarea
              aria-label="報告の本文(直す)"
              value={text}
              disabled={pending}
              maxLength={REPORT_MAX_LENGTH + 100}
              onChange={(e) => setText(e.target.value)}
              className="block min-h-48 w-full flex-1 resize-none bg-transparent p-2 font-mono text-m shadow-box outline-none"
            />
            {tooLong && (
              <p role="alert" className="text-s text-danger">
                {REPORT_MAX_LENGTH} 文字までです(いま {text.length} 文字)
              </p>
            )}
          </div>
        ) : (
          <MarkdownView source={draft.body} />
        )}
      </div>
      <footer className="space-y-2 border-t border-line px-4 py-3">
        {error && (
          <p role="alert" className="border-l border-line pl-3 text-m">
            ERR {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <IconButton icon={Check} label="この内容で報告に出す" showLabel size="sm" variant="solid" disabled={pending || empty || tooLong} onClick={() => onAdopt(text)} />
              <IconButton
                icon={X}
                label="直すのをやめる"
                showLabel
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setText(draft.body)
                  setEditing(false)
                }}
              />
            </>
          ) : (
            <>
              <IconButton icon={Check} label="このまま報告に出す" showLabel size="sm" variant="solid" disabled={pending} onClick={() => onAdopt()} />
              <IconButton icon={Pencil} label="直して出す" showLabel size="sm" variant="outline" disabled={pending} onClick={() => setEditing(true)} />
              <IconButton icon={X} label="却下" showLabel size="sm" variant="outline" disabled={pending} onClick={onDiscard} />
            </>
          )}
        </div>
      </footer>
    </article>
  )
}

/**
 * タスクの、未確認の AI の下書きの一覧(担当者だけに出す)。なければ何も出さない。
 * 出す(採用)と、完了報告になる。`onAdopted` で、親が閉じる・取り直す
 */
export function ReportDrafts({ productId, taskId, onAdopted }: { productId: string; taskId: string; onAdopted: () => void }) {
  const queryClient = useQueryClient()
  const key = ['products', productId, 'task', taskId, 'report-drafts'] as const
  const drafts = useQuery({
    queryKey: key,
    queryFn: () => listReportDrafts(productId, taskId, 'pending'),
    retry: retryTransient,
    retryDelay,
  })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const adopt = useMutation({
    mutationFn: ({ draftId, body }: { draftId: string; body?: string }) => adoptReportDraft(productId, taskId, draftId, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: ['products', productId, 'tree'] }),
        queryClient.invalidateQueries({ queryKey: ['products', productId, 'task', taskId, 'messages'] }),
      ])
      onAdopted()
    },
  })
  const discard = useMutation({
    mutationFn: (draftId: string) => discardReportDraft(productId, taskId, draftId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  // 下書きがなければ(AI を使っていない人には)何も出さない。取得に失敗しても、完了報告の邪魔をしない
  if (!drafts.data || drafts.data.length === 0) return null

  const openDraft = drafts.data.find((d) => d.draftId === openId) ?? null

  return (
    <section aria-label="AI からの報告の下書き" className="space-y-1">
      <h3 className="text-m font-medium">
        AI からの報告の下書き <span className="text-s font-normal opacity-70">({drafts.data.length} 件)</span>
      </h3>
      <ul className="space-y-1">
        {drafts.data.map((d) => (
          <li key={d.draftId} className="flex items-center gap-2 text-m">
            <span className="min-w-0 flex-1 truncate">AI「{d.aiName}」</span>
            <span className="shrink-0 text-s opacity-70">{formatDocDate(d.createdAt)}</span>
            <IconButton icon={FileText} label="確認する" showLabel size="sm" variant="outline" onClick={() => setOpenId(d.draftId)} />
          </li>
        ))}
      </ul>
      <Modal open={openDraft !== null} onClose={() => setOpenId(null)} size="full" closeOnBackdrop={false}>
        {openDraft && (
          <ReportDraftCard
            key={openDraft.draftId}
            draft={openDraft}
            pending={busyId === openDraft.draftId}
            error={error?.id === openDraft.draftId ? error.message : null}
            onClose={() => setOpenId(null)}
            onAdopt={(body) => {
              setBusyId(openDraft.draftId)
              setError(null)
              adopt.mutate(
                { draftId: openDraft.draftId, body },
                { onError: (e) => setError({ id: openDraft.draftId, message: e.message }), onSettled: () => setBusyId(null) },
              )
            }}
            onDiscard={() => {
              setBusyId(openDraft.draftId)
              setError(null)
              discard.mutate(openDraft.draftId, {
                onSuccess: () => setOpenId(null),
                onError: (e) => setError({ id: openDraft.draftId, message: e.message }),
                onSettled: () => setBusyId(null),
              })
            }}
          />
        )}
      </Modal>
    </section>
  )
}
