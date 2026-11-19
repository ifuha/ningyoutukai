import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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
  MAX_MESSAGE_LENGTH,
  normalizeMessageBody,
} from '#/lib/message-body'
import { retryDelay, retryTransient } from '#/lib/query-retry'

export type TaskDetailTarget = { task: TreeTask; member: TreeMember }

const textareaClass =
  'min-h-16 w-full resize-y border border-line bg-panel p-2 text-m text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60'

/** 報告・差し戻しの本文の入力欄(送信は下のボタンで行う。ここでは書くだけ)。
 * `hint` を渡さなければ、プレースホルダー(入力欄の中の薄い文)は出さない */
function BodyInput({
  label,
  hint,
  required,
  text,
  onChangeText,
  disabled,
}: {
  label: string
  hint?: string
  required: boolean
  text: string
  onChangeText: (text: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-1">
      <label className="block text-s opacity-60">
        {label}
        {required ? '(必須)' : '(任意)'}
      </label>
      <textarea
        aria-label={label}
        placeholder={hint}
        value={text}
        maxLength={MAX_MESSAGE_LENGTH}
        disabled={disabled}
        onChange={(e) => onChangeText(e.target.value)}
        className={textareaClass}
      />
      <p className="text-s opacity-60">
        {text.length} / {MAX_MESSAGE_LENGTH}
      </p>
    </div>
  )
}

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
  const [reportText, setReportText] = useState('')
  const [rejectText, setRejectText] = useState('')
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
  // 完了報告(本文はやり取りのログに残る)。差し戻し中からの再提出も同じ API
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
  // 差し戻し(再提出の要求)。理由は必須。やり取りに「差し戻し」のログが残り、担当者にメールがいく
  const reject = useMutation({
    mutationFn: (body: string) =>
      edenData(
        eden().api.product({ productId }).task({ taskId: task.taskId }).reject.post({ body }),
      ),
    onSuccess: () => {
      setRejectText('')
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

  return (
    <>
      <h2 className="text-l font-black break-words">{task.taskName}</h2>
      <dl className="space-y-2 text-m">
        <div>
          <dt className="text-s opacity-60">説明</dt>
          <dd className="break-words whitespace-pre-wrap">
            {task.description || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-s opacity-60">期限</dt>
          <dd>{task.timeLimit ? formatDateTime(task.timeLimit) : '—'}</dd>
        </div>
        <div>
          <dt className="text-s opacity-60">種類</dt>
          <dd className="break-words">{task.taskType?.taskTypeName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-s opacity-60">公開</dt>
          <dd>{task.isVisible ? '公開' : '非公開'}</dd>
        </div>
        <div>
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
        // 完了報告は、やりとりの「送信」の左に並べる(報告できるときだけ)
        beforeSend={
          canReport && reportable ? (
            <IconButton
              icon={Check}
              label={task.status === 'rejected' ? '再提出' : '完了を報告'}
              showLabel
              variant="outline"
              className="bg-panel"
              disabled={report.isPending}
              onClick={() => report.mutate(normalizeMessageBody(reportText))}
            />
          ) : undefined
        }
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
      {canReport && reportable && (
        <BodyInput
          label="報告の内容"
          required={false}
          text={reportText}
          onChangeText={setReportText}
          disabled={report.isPending}
        />
      )}
      {rejecting && (
        <BodyInput
          label="差し戻しの理由"
          hint="何を直すべきか(担当者にメールでも知らせる)"
          required
          text={rejectText}
          onChangeText={setRejectText}
          disabled={reject.isPending}
        />
      )}
      <div className="flex flex-wrap gap-3">
        {rejecting && (
          <IconButton
            icon={Undo2}
            label="差し戻す"
            showLabel
            variant="outline"
            className="bg-panel"
            disabled={reject.isPending || !canSubmitMessage(rejectText)}
            onClick={() => reject.mutate(normalizeMessageBody(rejectText))}
          />
        )}
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
// `canReject` はリーダーにだけ渡す: 確認待ちのとき「差し戻す」を出す(理由は必須。api も本文なしを 400 にする)。
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