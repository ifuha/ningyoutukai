import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { formatDateTime } from '#/components/member-card'
import { Modal } from '#/components/modal'
import { IconButton } from '#/components/icon-button'
import { ReportDrafts } from '#/components/report-drafts'
import { TaskMessages } from '#/components/task-messages'
import { Check, FileText, Pencil, Undo2, X } from 'lucide-react'
import type { TreeMember, TreeTask } from '#/lib/tree'
import { statusLabel } from '#/lib/tree'
import { getTaskDocuments } from '#/lib/document-api'
import { eden, edenData } from '#/lib/eden'
import { errorMessage } from '#/lib/error-message'
import {
  canSubmitMessage,
  normalizeMessageBody,
} from '#/lib/message-body'
import { retryDelay, retryTransient } from '#/lib/query-retry'

export type TaskDetailTarget = { task: TreeTask; member: TreeMember }

// 詳細の項目(説明・期限など)を 1 枚のカードにまとめる。項目の間は、薄い区切り線。
// 背景は side-item(ダークでは bg-side と bg-panel が同じ色で、差が出ないため)。
// 枠線は、背景で区切れているので薄く(line の半分)、角丸は 2px(rounded-xs)。
// 背景は、上(説明)を濃く、下(短い項目)を淡くして、2 段に見分ける
const fieldCardClass = 'overflow-hidden rounded-xs border border-line/50'
// 項目 1 つ分の余白。格子の中で長い語でも折り返すよう min-w-0
const fieldClass = 'min-w-0 space-y-0.5 p-2'
const fieldTopBg = 'bg-side-item/50'
const fieldBottomBg = 'bg-side-item/20'

function Detail({
  productId,
  target,
  canReport,
  canComment,
  canReject,
  viewerMemberId,
  onEdit,
  onClose,
}: {
  productId: string
  target: TaskDetailTarget
  canReport: boolean
  canComment: boolean
  canReject: boolean
  /** 閲覧者自身の productMemberId(自分が押したリアクションを示す) */
  viewerMemberId?: string
  onEdit?: () => void
  onClose: () => void
}) {
  const { task } = target
  const queryClient = useQueryClient()
  // 渡された Markdown(文書)。なければ(機能がない・取得に失敗)何も出さない
  const handed = useQuery({
    queryKey: ['products', productId, 'task', task.taskId, 'documents', 'handed'],
    queryFn: () => getTaskDocuments(productId, task.taskId),
    retry: retryTransient,
    retryDelay,
  })
  const invalidateTree = () =>
    void queryClient.invalidateQueries({ queryKey: ['products', productId, 'tree'] })
  // 開いたことを見える(タスク行の未読の点を消す)。取得し直すまで点が残るので、成功したらツリーを取り直す。
  // 失敗しても詳細は開いたままにする(コメントは読めているので)。次の開き直しでもう一度送られる
  useEffect(() => {
    let alive = true
    edenData(eden().api.product({ productId }).task({ taskId: task.taskId }).read.post())
      .then(() => {
        if (alive) invalidateTree()
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // invalidateTree は毎レンダー作り直すので、ここには入れない(入れると取り直しの無限ループになる)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, task.taskId])
  // 完了報告(本文はやり取りのログに残る)。差し戻し中からの再提出も同じ API。
  // 本文は、やりとりの入力欄に書いたものをそのまま送る(報告専用の入力欄は無い)
  const report = useMutation({
    mutationFn: (body: string) =>
      edenData(
        eden()
          .api.product({ productId })
          .task({ taskId: task.taskId })['complete-report'].post({ body }),
      ),
    // 失敗(409 など)では取り直さない。完了済みでツリーから消えると、エラーを出す前にモーダルごと閉じるため
    onSuccess: () => {
      invalidateTree()
      void queryClient.invalidateQueries({
        queryKey: ['products', productId, 'task', task.taskId, 'messages'],
      })
      onClose()
    },
  })
  // 差し戻し(再提出の要求)。理由は必須(空ならボタンを押せない)。やり取りに「差し戻し」のログが残り、担当者にメールがいく。
  // 理由も、やりとりの入力欄に書いたものをそのまま送る
  const reject = useMutation({
    mutationFn: (body: string) =>
      edenData(
        eden().api.product({ productId }).task({ taskId: task.taskId }).reject.post({ body }),
      ),
    onSuccess: () => {
      invalidateTree()
      // 差し戻しのログをすぐ出すため、モーダルは開いたままにする
      void queryClient.invalidateQueries({
        queryKey: ['products', productId, 'task', task.taskId, 'messages'],
      })
    },
  })

  // 報告できるのは、作業中と差し戻し中(確認待ちになったら報告済み)
  const reportable = task.status === 'in_progress' || task.status === 'rejected'
  const rejecting = canReject && task.status === 'reported'

  // やりとりの「送信」の左に並べるボタン。報告(作業中・差し戻し中)と差し戻し(確認待ち)は
  // 状態が競合しないので、片方だけが出る。押すと、入力欄に書いた本文をそのまま送る
  // (報告は complete-report、差し戻しは reject)。送れたら `clear` で入力欄を空にする
  // (報告は成功するとモーダルごと閉じる)
  function beforeSend(text: string, clear: () => void) {
    if (canReport && reportable) {
      return (
        <IconButton
          icon={Check}
          label={task.status === 'rejected' ? '再提出' : '完了を報告'}
          showLabel
          variant="outline"
          className="bg-panel"
          disabled={report.isPending}
          onClick={() => report.mutate(normalizeMessageBody(text), { onSuccess: clear })}
        />
      )
    }
    if (rejecting) {
      return (
        <IconButton
          icon={Undo2}
          label="差し戻す"
          showLabel
          variant="outline"
          className="bg-panel"
          // 理由は必須。空なら押せない(押せない理由はツールチップに出す)
          tip={canSubmitMessage(text) ? undefined : '理由を書くと押せます'}
          disabled={reject.isPending || !canSubmitMessage(text)}
          onClick={() => reject.mutate(normalizeMessageBody(text), { onSuccess: clear })}
        />
      )
    }
    return null
  }

  return (
    <>
      <h2 className="text-l font-black break-words">{task.taskName}</h2>
      {/* 項目は 1 枚のカードにまとめる。説明は横幅いっぱい、短い項目は、その下に区切り線を挟んで格子に */}
      <dl className={`grid grid-cols-2 text-m md:grid-cols-4 ${fieldCardClass}`}>
        <div className={`col-span-full ${fieldClass} ${fieldTopBg}`}>
          <dt className="text-s opacity-60">説明</dt>
          <dd className="break-words whitespace-pre-wrap">
            {task.description || '—'}
          </dd>
        </div>
        <div className={`${fieldClass} ${fieldBottomBg} border-t border-line/50`}>
          <dt className="text-s opacity-60">期限</dt>
          <dd>{task.timeLimit ? formatDateTime(task.timeLimit) : '—'}</dd>
        </div>
        <div className={`${fieldClass} ${fieldBottomBg} border-t border-l border-line/50`}>
          <dt className="text-s opacity-60">種類</dt>
          <dd className="break-words">{task.taskType?.taskTypeName ?? '—'}</dd>
        </div>
        <div className={`${fieldClass} ${fieldBottomBg} border-t border-line/50 md:border-l`}>
          <dt className="text-s opacity-60">公開</dt>
          <dd>{task.isVisible ? '公開' : '非公開'}</dd>
        </div>
        <div className={`${fieldClass} ${fieldBottomBg} border-t border-l border-line/50`}>
          <dt className="text-s opacity-60">状態</dt>
          <dd>
            {statusLabel[task.status]}
            {task.status === 'reported' && task.reportedAt
              ? `(${formatDateTime(task.reportedAt)} に報告)`
              : ''}
          </dd>
        </div>
      </dl>
      {handed.data && handed.data.documents.length > 0 && (
        <section aria-label="渡された文書" className="space-y-1">
          <h3 className="text-m font-medium">
            渡された文書 <span className="text-s font-normal opacity-70">({handed.data.documents.length} 件)</span>
          </h3>
          <ul className="space-y-0.5 text-m">
            {handed.data.documents.map((d) => (
              <li key={d.documentId} className="flex items-center gap-2">
                <FileText size={14} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 truncate">
                  {d.directoryName}/{d.name}
                </span>
                <span className="shrink-0 text-s opacity-60">版 {d.currentVersion}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* AI からの報告の下書き: 担当者だけ。確認して、完了報告に出す */}
      {canReport && reportable && (
        <ReportDrafts productId={productId} taskId={task.taskId} onAdopted={onClose} />
      )}
      <TaskMessages
        productId={productId}
        taskId={task.taskId}
        canComment={canComment}
        // リアクションはコメントを書ける人と同じ。完了済みのタスクでは付けられない(api 同じ判定)
        reactable={canComment && task.status !== 'completed'}
        viewerMemberId={viewerMemberId}
        // 完了報告・差し戻しは、やりとりの「送信」の左に並べる(片方だけ出る)。
        // 押すと、入力欄に書いた本文をそのまま送る(コメントにはしない)
        beforeSend={beforeSend}
      />
      {report.isError && (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {errorMessage(report.error.message)}
        </p>
      )}
      {reject.isError && (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {errorMessage(reject.error.message)}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {onEdit && (
          <IconButton
            icon={Pencil}
            label="編集"
            variant="outline"
            className="bg-panel"
            disabled={report.isPending}
            onClick={onEdit}
          />
        )}
        <IconButton icon={X} label="閉じる" variant="outline" className="bg-panel" onClick={onClose} />
      </div>
    </>
  )
}

// タスクの詳細のモーダル。やりとり(メッセージの履歴)を出す。
// `canReport` は担当者本人にだけ渡す: 未報告なら「完了を報告」を出す(押すとリーダーに通知される。担当者でなければ、api が 403 にする)。
// `canComment` はリーダーと担当者にだけ渡す: コメントの入力欄を出す(それ以外は、api が 403 にする)。
// `canReject` はリーダーにだけ渡す: 確認待ちのとき「差し戻す」を出す(理由は必須で、やりとりの入力欄の本文を使う。
//   空なら押せない。api も本文なしを 400 にする)。
// `onEdit` はリーダーにだけ渡す(編集のフォームへ移る)。`target` が null の間は閉じている
export function TaskDetailDialog({
  productId,
  target,
  canReport = false,
  canComment = false,
  canReject = false,
  viewerMemberId,
  onEdit,
  onClose,
}: {
  productId: string
  target: TaskDetailTarget | null
  canReport?: boolean
  canComment?: boolean
  canReject?: boolean
  /** 閲覧者自身の productMemberId */
  viewerMemberId?: string
  onEdit?: (target: TaskDetailTarget) => void
  onClose: () => void
}) {
  return (
    <Modal open={target !== null} onClose={onClose} size="lg">
      {target && (
        <Detail
          key={target.task.taskId}
          productId={productId}
          target={target}
          canReport={canReport}
          canComment={canComment}
          canReject={canReject}
          viewerMemberId={viewerMemberId}
          onEdit={onEdit && (() => onEdit(target))}
          onClose={onClose}
        />
      )}
    </Modal>
  )
}