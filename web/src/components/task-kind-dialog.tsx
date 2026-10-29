import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal } from '#/components/modal'
import { IconButton } from '#/components/icon-button'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { eden, edenData, type Json } from '#/lib/eden'
import { errorMessage } from '#/lib/error-message'

type ListResult = Awaited<
  ReturnType<ReturnType<ReturnType<typeof eden>['api']['product']>['task_kinds']['get']>
>

// 1 件分の種類。型は api の応答から取る
type TaskKind = Json<NonNullable<Extract<ListResult, { error: null }>['data']>>[number]

const buttonClass =
  'flex h-9 shrink-0 items-center justify-center border-2 border-outline bg-secondary px-3 text-m text-outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60'
const inputClass =
  'h-9 min-w-0 flex-1 border-2 border-ink bg-surface px-2 text-m text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60'

function ErrorText({ message }: { message: string }) {
  return (
    <p role="alert" className="border-l-2 border-ink pl-3 text-m">
      ERR {errorMessage(message)}
    </p>
  )
}

// 種類の変更のあとに取り直すクエリ。名前の変更・削除はツリーの taskType 表示にも関わるので、ツリーも取り直す
function useInvalidate(productId: string) {
  const queryClient = useQueryClient()
  return (withTree: boolean) => {
    void queryClient.invalidateQueries({
      queryKey: ['products', productId, 'task_kinds'],
    })
    if (withTree) {
      void queryClient.invalidateQueries({
        queryKey: ['products', productId, 'tree'],
      })
    }
  }
}

// 1 件分の行。通常 / 名前の変更 / 削除の確認(2 段階)の 3 つの表示を切り替える
function KindRow({ productId, kind }: { productId: string; kind: TaskKind }) {
  const invalidate = useInvalidate(productId)
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view')
  const [name, setName] = useState(kind.taskTypeName)
  const target = () =>
    eden().api.product({ productId }).task_kinds({ kindId: kind.taskTypeId })

  const rename = useMutation({
    mutationFn: () =>
      edenData(target().patch({ taskTypeName: name })),
    onSuccess: () => {
      setMode('view')
      invalidate(true)
    },
  })
  const remove = useMutation({
    mutationFn: () => edenData(target().delete()),
    onSuccess: () => invalidate(true),
  })
  const busy = rename.isPending || remove.isPending
  const error = rename.error ?? remove.error

  return (
    <li className="space-y-2 text-m">
      {mode === 'edit' ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            rename.mutate()
          }}
        >
          <input
            aria-label="種類の名前"
            value={name}
            maxLength={50}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
          <IconButton
            type="submit"
            icon={Check}
            label="保存"
            variant="outline"
            disabled={busy || !name.trim()}
          />
          <IconButton
            icon={X}
            label="やめる"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setMode('view')
              setName(kind.taskTypeName)
              rename.reset()
            }}
          />
        </form>
      ) : mode === 'confirm' ? (
        <div className="space-y-2">
          <p className="break-words">
            「{kind.taskTypeName}」を削除しますか? この種類のタスクは「種類なし」になります
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => remove.mutate()}
              className={buttonClass}
            >
              削除する
            </button>
            <IconButton
              icon={X}
              label="やめる"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setMode('view')
                remove.reset()
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 break-words">{kind.taskTypeName}</span>
          <IconButton
            icon={Pencil}
            label="名前を変更"
            variant="outline"
            onClick={() => {
              setName(kind.taskTypeName)
              setMode('edit')
              remove.reset()
            }}
          />
          <IconButton
            icon={Trash2}
            label="削除"
            variant="outline"
            onClick={() => {
              setMode('confirm')
              rename.reset()
            }}
          />
        </div>
      )}
      {error && <ErrorText message={error.message} />}
    </li>
  )
}

function AddForm({ productId }: { productId: string }) {
  const invalidate = useInvalidate(productId)
  const [name, setName] = useState('')
  const add = useMutation({
    mutationFn: () =>
      edenData(eden().api.product({ productId }).task_kinds.post({ taskTypeName: name })),
    onSuccess: () => {
      setName('')
      invalidate(false)
    },
  })

  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <input
          aria-label="新しい種類の名前"
          placeholder="新しい種類の名前"
          value={name}
          maxLength={50}
          disabled={add.isPending}
          onChange={(e) => {
            setName(e.target.value)
            add.reset()
          }}
          className={inputClass}
        />
        <IconButton
          type="submit"
          icon={Plus}
          label="追加"
          variant="outline"
          disabled={add.isPending || !name.trim()}
        />
      </form>
      {add.isError && <ErrorText message={add.error.message} />}
    </div>
  )
}

// リーダー用。タスクの種類の一覧・追加・名前の変更・削除
export function TaskKindDialog({
  productId,
  open,
  onClose,
}: {
  productId: string
  open: boolean
  onClose: () => void
}) {
  const kinds = useQuery({
    queryKey: ['products', productId, 'task_kinds'],
    queryFn: () => edenData(eden().api.product({ productId }).task_kinds.get()),
    enabled: open,
    retry: false,
  })

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-l font-bold">種類の管理</h2>
      <AddForm productId={productId} />
      {kinds.isPending ? (
        <p className="text-m opacity-60">読み込み中…</p>
      ) : kinds.isError ? (
        <ErrorText message={kinds.error.message} />
      ) : kinds.data.length === 0 ? (
        <p className="text-m">種類はまだありません</p>
      ) : (
        <ul className="space-y-3">
          {kinds.data.map((kind) => (
            <KindRow key={kind.taskTypeId} productId={productId} kind={kind} />
          ))}
        </ul>
      )}
      <IconButton icon={X} label="閉じる" variant="outline" onClick={onClose} />
    </Modal>
  )
}
