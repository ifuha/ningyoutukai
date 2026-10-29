import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDateTime } from '#/components/member-card'
import { Modal } from '#/components/modal'
import { IconButton } from '#/components/icon-button'
import { Check, Pencil, X } from 'lucide-react'
import type { TreeMember, TreeTask } from '#/lib/tree'
import { eden, edenData } from '#/lib/eden'

export type TaskDetailTarget = { task: TreeTask; member: TreeMember }

function Detail({
  productId,
  target,
  onEdit,
  onClose,
}: {
  productId: string
  target: TaskDetailTarget
  onEdit?: () => void
  onClose: () => void
}) {
  const { task } = target
  const queryClient = useQueryClient()
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
      <h2 className="text-l font-bold break-words">{task.taskName}</h2>
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
      {report.isError && (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {report.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {!task.reportedAt && (
          <IconButton
            icon={Check}
            label="完了を報告"
            showLabel
            variant="outline"
            disabled={report.isPending}
            onClick={() => report.mutate()}
          />
        )}
        {onEdit && (
          <IconButton
            icon={Pencil}
            label="編集"
            variant="outline"
            disabled={report.isPending}
            onClick={onEdit}
          />
        )}
        <IconButton icon={X} label="閉じる" variant="outline" onClick={onClose} />
      </div>
    </>
  )
}

// 自分のタスクの詳細のモーダル。未報告なら「完了を報告」を出す(押すとリーダーに通知される)。
// `onEdit` はリーダーにだけ渡す(編集のフォームへ移る)。`target` が null の間は閉じている
export function TaskDetailDialog({
  productId,
  target,
  onEdit,
  onClose,
}: {
  productId: string
  target: TaskDetailTarget | null
  onEdit?: (target: TaskDetailTarget) => void
  onClose: () => void
}) {
  return (
    <Modal open={target !== null} onClose={onClose}>
      {target && (
        <Detail
          key={target.task.taskId}
          productId={productId}
          target={target}
          onEdit={onEdit && (() => onEdit(target))}
          onClose={onClose}
        />
      )}
    </Modal>
  )
}
