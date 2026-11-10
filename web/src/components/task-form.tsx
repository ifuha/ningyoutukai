import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '#/lib/api'
import type { TreeMember, TreeTask } from '#/lib/tree'
import { eden, edenData } from '#/lib/eden'
import { errorMessage } from '#/lib/error-message'
import { CheckBox, SelectMenu } from '#/components/form-controls'
import { IconButton } from '#/components/icon-button'
import { TaskDocumentPicker, sameSelection, type TaskLinkSelection } from '#/components/task-document-picker'
import { getTaskDocuments, setTaskDocuments } from '#/lib/document-api'
import { useDocumentTree } from '#/lib/use-product-documents'
import { Check, ChevronRight, Plus, Trash2, X } from 'lucide-react'

// 期限は日本時間(+09:00)として扱う。`datetime-local` の値(`2026-12-01T09:00`)と ISO を行き来する
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** ISO の日時を、日本時間の `datetime-local` の値にする */
function toInputValue(iso: string | null): string {
  if (!iso) return ''
  return new Date(new Date(iso).getTime() + JST_OFFSET_MS)
    .toISOString()
    .slice(0, 16)
}

/** `datetime-local` の値(日本時間)を、api に送る ISO 8601 にする */
function toIso(value: string): string {
  return `${value}${value.length === 16 ? ':00' : ''}+09:00`
}

const fieldClass =
  'w-full shadow-box bg-panel px-3 font-mono text-l focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60'
const buttonClass =
  'flex h-10 shrink-0 items-center justify-center shadow-box bg-panel px-4 text-m text-ink hover:bg-side-item focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-panel'

type Props = {
  productId: string
  /** ツリーのリーダーとメンバー(担当者の選択肢) */
  members: TreeMember[]
  /** 渡すと編集、なければ作成。編集では担当者は変えられない(表示のみ) */
  edit?: { task: TreeTask; member: TreeMember }
  /** 作成のとき、あらかじめ選んでおく担当者(メンバーのカードの「タスクを追加」から開いたとき) */
  initialMemberId?: string
  /** 成功したとき(モーダルを閉じる) */
  onDone: () => void
}

// タスクの作成と編集のフォーム(リーダーにだけ出す)。見た目は暫定(ターミナル風)
export function TaskForm({ productId, members, edit, initialMemberId, onDone }: Props) {
  const queryClient = useQueryClient()
  const initial = edit?.task
  const [taskName, setTaskName] = useState(initial?.taskName ?? '')
  const [memberId, setMemberId] = useState(
    edit?.member.productMemberId ??
      members.find((m) => m.productMemberId === initialMemberId)?.productMemberId ??
      members[0]?.productMemberId ??
      '',
  )
  const [description, setDescription] = useState(initial?.description ?? '')
  const [timeLimit, setTimeLimit] = useState(toInputValue(initial?.timeLimit ?? null))
  const [kindId, setKindId] = useState(initial?.taskType?.taskTypeId ?? '')
  const [isVisible, setIsVisible] = useState(initial?.isVisible ?? true)
  // 詳細(説明・期限・種類・渡す文書)を開いているか。作成のときは閉じて、編集のときは開いておく
  const [detailsOpen, setDetailsOpen] = useState(Boolean(initial))

  // 渡す Markdown(文書・ディレクトリ)。作成では空から。編集では、いま結びついているものを読んで、それを初期値にする(触るまでは、読んだ値)
  const tree = useDocumentTree(productId)
  const savedLinks = useQuery({
    queryKey: ['products', productId, 'task', initial?.taskId ?? 'new', 'documents'],
    queryFn: () => getTaskDocuments(productId, initial!.taskId),
    enabled: Boolean(initial),
    retry: false,
  })
  const loadedLinks: TaskLinkSelection = { documentIds: savedLinks.data?.documentIds ?? [], directoryIds: savedLinks.data?.directoryIds ?? [] }
  const [editedLinks, setEditedLinks] = useState<TaskLinkSelection | null>(null)
  const links = editedLinks ?? loadedLinks

  const kinds = useQuery({
    queryKey: ['products', productId, 'task_kinds'],
    queryFn: () => edenData(eden().api.product({ productId }).task_kinds.get()),
    retry: false,
  })

  const save = useMutation({
    mutationFn: async () => {
      const product = eden().api.product({ productId })
      if (!initial) {
        // 作成: 空の項目は送らない
        await edenData(
          product.task.post({
            taskName: taskName.trim(),
            productMemberId: memberId,
            ...(description !== '' && { description }),
            ...(timeLimit !== '' && { timeLimit: toIso(timeLimit) }),
            ...(kindId !== '' && { taskTypeId: kindId }),
            isVisible,
            ...(links.documentIds.length > 0 && { documentIds: links.documentIds }),
            ...(links.directoryIds.length > 0 && { directoryIds: links.directoryIds }),
          }),
        )
        return
      }
      // 編集: 変更した項目だけ送る(期限と説明は、空にすると null で消す)
      const changes: {
        taskName?: string
        description?: string | null
        timeLimit?: string | null
        isVisible?: boolean
      } = {}
      if (taskName.trim() !== initial.taskName) changes.taskName = taskName.trim()
      if (description !== (initial.description ?? '')) changes.description = description
      if (timeLimit !== toInputValue(initial.timeLimit)) {
        changes.timeLimit = timeLimit === '' ? null : toIso(timeLimit)
      }
      if (isVisible !== initial.isVisible) changes.isVisible = isVisible
      const task = product.task({ taskId: initial.taskId })
      if (Object.keys(changes).length > 0) {
        await edenData(task.patch(changes))
      }
      // 渡す Markdown は別の api(置き換え)。変えたときだけ呼ぶ
      if (editedLinks && !sameSelection(editedLinks, loadedLinks)) {
        await setTaskDocuments(productId, initial.taskId, editedLinks)
      }
      // 種類は別の api。割り当てのみで、外す(なしに戻す)api はないので、選んだときだけ呼ぶ
      if (kindId !== '' && kindId !== (initial.taskType?.taskTypeId ?? '')) {
        await edenData(task.task_kinds({ kindId }).patch())
      }
    },
    onSuccess: onDone,
    // 途中まで成功していても、ツリーは最新にしておく
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'tree'] }),
  })

  // 削除は 2 段階(「削除」→ 確認)。404 は、すでに消えているので、閉じるだけでよい
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const remove = useMutation({
    // 削除ボタンは編集(`initial` あり)のときだけ出る
    mutationFn: () =>
      edenData(eden().api.product({ productId }).task({ taskId: initial!.taskId }).delete()),
    onSuccess: onDone,
    onError: (err) => {
      if (err instanceof ApiError && err.status === 404) onDone()
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'tree'] }),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (save.isPending || remove.isPending) return
    save.reset()
    save.mutate()
  }

  const heading = initial ? 'タスクを編集' : 'タスクを追加'
  const assignee = edit?.member
  const hasKind = Boolean(initial?.taskType)

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-l font-black">{heading}</h2>

      <div className="space-y-1">
        <label htmlFor="task-name" className="block text-m font-medium">
          タスク名<span className="ml-1 text-s font-normal opacity-70">(必須)</span>
        </label>
        <input
          id="task-name"
          type="text"
          required
          maxLength={200}
          autoComplete="off"
          value={taskName}
          disabled={save.isPending}
          onChange={(e) => {
            setTaskName(e.target.value)
            // 空白だけは、必須の入力として通らないようにする
            e.target.setCustomValidity(
              e.target.value.trim() === '' ? 'タスク名を入力してください' : '',
            )
          }}
          className={`${fieldClass} h-10`}
        />
      </div>

      <div className="space-y-1">
        {assignee ? (
          <span id="task-assignee-label" className="block text-m font-medium">
            担当者
          </span>
        ) : (
          <label htmlFor="task-assignee" className="block text-m font-medium">
            担当者
          </label>
        )}
        {assignee ? (
          <p aria-labelledby="task-assignee-label" className="text-m">
            {assignee.userName}(変更できません)
          </p>
        ) : (
          <SelectMenu
            id="task-assignee"
            value={memberId}
            disabled={save.isPending}
            onChange={setMemberId}
            options={members.map((m) => ({
              value: m.productMemberId,
              label: `${m.userName}${m.role === 'leader' ? '(リーダー)' : ''}`,
            }))}
            className={`${fieldClass} h-10`}
          />
        )}
      </div>

      {/* 詳細(説明・期限・種類)は畳む。作成のときは閉じて、タスク名と担当者だけを見せる。編集のときは、入っている内容が見えるよう、開いておく */}
      <details
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
        className="group"
      >
        <summary className="cursor-pointer list-none text-m font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center">
              <ChevronRight
                size={16}
                className="transition-transform group-open:rotate-90 motion-reduce:transition-none"
              />
            </span>
            詳細
            <span className="text-s font-normal opacity-70">(説明・期限・種類・渡す Markdown)</span>
          </span>
        </summary>
        <div className="details-in mt-4 space-y-4">
          <div className="space-y-1">
            <label htmlFor="task-description" className="block text-m font-medium">
              説明
            </label>
            <textarea
              id="task-description"
              rows={2}
              maxLength={5000}
              value={description}
              disabled={save.isPending}
              onChange={(e) => setDescription(e.target.value)}
              className={`${fieldClass} py-2`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="task-time-limit" className="block text-m font-medium">
                期限(日本時間)
              </label>
              <input
                id="task-time-limit"
                type="datetime-local"
                min="2000-01-01T00:00"
                max="2100-12-31T23:59"
                value={timeLimit}
                disabled={save.isPending}
                onChange={(e) => setTimeLimit(e.target.value)}
                className={`${fieldClass} h-10 min-w-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-date-and-time-value]:text-left`}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="task-kind" className="block text-m font-medium">
                種類
              </label>
              <SelectMenu
                id="task-kind"
                value={kindId}
                disabled={save.isPending || kinds.isPending}
                onChange={setKindId}
                options={[
                  // 種類を外す api はないので、すでに種類があるタスクでは「なし」を出さない
                  ...(hasKind ? [] : [{ value: '', label: 'なし' }]),
                  ...(kinds.data ?? []).map((k) => ({ value: k.taskTypeId, label: k.taskTypeName })),
                ]}
                className={`${fieldClass} h-10`}
              />
            </div>
          </div>
          {kinds.isError && (
            <p role="alert" className="border-l border-line pl-3 text-m">
              ERR {kinds.error.message}
            </p>
          )}

          <TaskDocumentPicker
            directories={tree.data}
            loading={tree.isPending || (Boolean(initial) && savedLinks.isPending)}
            error={tree.isError && tree.data === undefined ? tree.error.message : null}
            selection={links}
            onChange={setEditedLinks}
            disabled={save.isPending}
          />
        </div>
      </details>

      {save.isError && (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {errorMessage(save.error.message)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <IconButton
          type="submit"
          icon={initial ? Check : Plus}
          label={save.isPending ? (initial ? '保存中…' : '追加中…') : initial ? '保存' : '追加'}
          showLabel
          variant="solid"
          disabled={save.isPending || remove.isPending}
        />
        <IconButton
          icon={X}
          label="閉じる"
          variant="outline"
          className="bg-panel"
          disabled={save.isPending || remove.isPending}
          onClick={onDone}
        />
        <label className="ml-auto flex items-center gap-2 text-s">
          <CheckBox
            checked={isVisible}
            disabled={save.isPending}
            onChange={(e) => setIsVisible(e.target.checked)}
          />
          他のメンバーに公開する
        </label>
      </div>

      {initial && (
        <div className="space-y-3 border-t border-line pt-4">
          {remove.isError && (
            <p role="alert" className="border-l border-line pl-3 text-m">
              ERR {remove.error.message}
            </p>
          )}
          {confirmingRemove ? (
            <>
              <p className="text-m font-medium">
                「{initial.taskName}」を削除しますか? 元に戻せません
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={remove.isPending || save.isPending}
                  onClick={() => {
                    remove.reset()
                    remove.mutate()
                  }}
                  className={buttonClass}
                >
                  {remove.isPending ? '削除中…' : '削除する'}
                </button>
                <IconButton
                  icon={X}
                  label="やめる"
                  variant="outline"
                  className="bg-panel"
                  disabled={remove.isPending}
                  onClick={() => {
                    remove.reset()
                    setConfirmingRemove(false)
                  }}
                />
              </div>
            </>
          ) : (
            <IconButton
              icon={Trash2}
              label="このタスクを削除"
              variant="outline"
              className="bg-panel"
              disabled={save.isPending}
              onClick={() => setConfirmingRemove(true)}
            />
          )}
        </div>
      )}
    </form>
  )
}
