import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDateTime } from '#/components/member-card'
import { Modal } from '#/components/modal'
import { IconButton } from '#/components/icon-button'
import { ReportDrafts } from '#/components/report-drafts'
import { TaskMessages } from '#/components/task-messages'
import { Check, FileText, Pencil, X } from 'lucide-react'
import type { TreeMember, TreeTask } from '#/lib/tree'
import { getTaskDocuments } from '#/lib/document-api'
import { eden, edenData } from '#/lib/eden'
import { retryDelay, retryTransient } from '#/lib/query-retry'

export type TaskDetailTarget = { task: TreeTask; member: TreeMember }

function Detail({
  productId,
  target,
  canReport,
  canComment,
  onEdit,
  onClose,
}: {
  productId: string
  target: TaskDetailTarget
  canReport: boolean
  canComment: boolean
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
  const report = useMutation({
    mutationFn: () =>
      edenData(
        eden()
          .api.product({ productId })
          .task({ taskId: task.taskId })['complete-report'].post(),
      ),
    // 失敗(409 など)では取り直さない。完了済みでツリーから消えると、エラーを出す前にモーダルごと閉じるため
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['products', productId, 'tree'],
      })
      onClose()
    },
  })

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
            {task.reportedAt
              ? `確認待ち(${formatDateTime(task.reportedAt)} に報告)`
              : '未完了'}
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
      {canReport && !task.reportedAt && <ReportDrafts productId={productId} taskId={task.taskId} onAdopted={onClose} />}
      <TaskMessages
        productId={productId}
        taskId={task.taskId}
        canComment={canComment}
      />
      {report.isError && (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {report.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {canReport && !task.reportedAt && (
          <IconButton
            icon={Check}
            label="完了を報告"
            showLabel
            variant="outline"
            className="bg-panel"
            disabled={report.isPending}
            onClick={() => report.mutate()}
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
// `onEdit` はリーダーにだけ渡す(編集のフォームへ移る)。`target` が null の間は閉じている
export function TaskDetailDialog({
  productId,
  target,
  canReport = false,
  canComment = false,
  onEdit,
  onClose,
}: {
  productId: string
  target: TaskDetailTarget | null
  canReport?: boolean
  canComment?: boolean
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
          onEdit={onEdit && (() => onEdit(target))}
          onClose={onClose}
        />
      )}
    </Modal>
  )
}