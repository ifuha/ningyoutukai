import { Check, FileText, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconButton } from '#/components/icon-button'
import { MarkdownView } from '#/components/markdown-view'
import { adoptReportDraft, discardReportDraft, listReportDrafts, type ReportDraft } from '#/lib/document-api'
import { formatDocDate } from '#/lib/document-tree'
import { retryDelay, retryTransient } from '#/lib/query-retry'

// AI からの報告の下書き(担当者が確認する)。仕様は docs/v4.0/overview.md
// - AI は、担当者の道具。AI が保存した報告は、まず**下書き**になる(リーダーには見えない。担当者だけが見る)
// - 担当者は、①そのまま報告に出す ②**直して**報告に出す ③却下する、を選ぶ。**出すと、完了報告になり(確認待ち)、リーダーに知らせる**
// - AI が自分で完了にはできない。最終確認は、人のリーダー

export const REPORT_MAX_LENGTH = 10000

/** AI が読んだ文書を、`ディレクトリ/名前(版 N)` の並びにする */
export function readDocumentsText(draft: Pick<ReportDraft, 'readDocuments'>): string {
  return draft.readDocuments.map((d) => `${d.name}(版 ${d.version})`).join('、')
}

/** 下書き 1 件(表示)。直している間は、入力欄を出す */
export function ReportDraftCard({
  draft,
  pending,
  error,
  onAdopt,
  onDiscard,
}: {
  draft: ReportDraft
  pending?: boolean
  error?: string | null
  /** `body` を渡すと、直した本文で出す */
  onAdopt: (body?: string) => void
  onDiscard: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(draft.body)
  const empty = !text.trim()
  const tooLong = text.length > REPORT_MAX_LENGTH

  return (
    <article aria-label="報告の下書き" data-draft={draft.draftId} className="space-y-2 shadow-box bg-panel p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-m font-bold">AI「{draft.aiName}」の下書き</p>
        <p className="text-s opacity-70">{formatDocDate(draft.createdAt)}</p>
      </header>
      {draft.readDocuments.length > 0 && (
        <p className="flex items-start gap-1 text-s opacity-80">
          <FileText size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>読んだ文書: {readDocumentsText(draft)}</span>
        </p>
      )}
      {editing ? (
        <div className="space-y-1">
          <textarea
            aria-label="報告の本文(直す)"
            rows={8}
            value={text}
            disabled={pending}
            maxLength={REPORT_MAX_LENGTH + 100}
            onChange={(e) => setText(e.target.value)}
            className="block max-h-[50dvh] w-full resize-y bg-transparent p-2 font-mono text-m shadow-box outline-none"
          />
          {tooLong && (
            <p role="alert" className="text-s text-danger">
              {REPORT_MAX_LENGTH} 文字までです(いま {text.length} 文字)
            </p>
          )}
        </div>
      ) : (
        <div className="max-h-[40dvh] overflow-y-auto shadow-box p-3">
          <MarkdownView source={draft.body} />
        </div>
      )}
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

  return (
    <section aria-label="AI からの報告の下書き" className="space-y-2">
      <h3 className="text-m font-bold">
        AI からの報告の下書き <span className="text-s font-normal opacity-70">({drafts.data.length} 件)</span>
      </h3>
      <p className="text-s opacity-80">内容を確認して、完了報告に出すか決めてください。出すと、リーダーに知らせます。AI が自分で完了にすることはありません。</p>
      {drafts.data.map((d) => (
        <ReportDraftCard
          key={d.draftId}
          draft={d}
          pending={busyId === d.draftId}
          error={error?.id === d.draftId ? error.message : null}
          onAdopt={(body) => {
            setBusyId(d.draftId)
            setError(null)
            adopt.mutate(
              { draftId: d.draftId, body },
              { onError: (e) => setError({ id: d.draftId, message: e.message }), onSettled: () => setBusyId(null) },
            )
          }}
          onDiscard={() => {
            setBusyId(d.draftId)
            setError(null)
            discard.mutate(d.draftId, { onError: (e) => setError({ id: d.draftId, message: e.message }), onSettled: () => setBusyId(null) })
          }}
        />
      ))}
    </section>
  )
}
