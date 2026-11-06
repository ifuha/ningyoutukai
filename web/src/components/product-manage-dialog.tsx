import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, X } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { Modal } from '#/components/modal'
import { eden, edenData } from '#/lib/eden'
import { errorMessage } from '#/lib/error-message'
import { avatarErrorMessage } from '#/lib/product-avatar'
import { ApiError } from '#/lib/api'

const buttonClass =
  'flex h-10 shrink-0 items-center justify-center shadow-box bg-panel px-3 text-m text-ink hover:bg-side-item focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-panel'
const inputClass =
  'h-10 min-w-0 flex-1 shadow-box bg-panel px-2 text-m text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60'

function ErrorText({ message }: { message: string }) {
  return (
    <p role="alert" className="border-l border-line pl-3 text-m">
      ERR {errorMessage(message)}
    </p>
  )
}

function RenameBlock({
  productId,
  productName,
}: {
  productId: string
  productName: string
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(productName)
  const rename = useMutation({
    mutationFn: () =>
      edenData(
        eden().api.product({ productId }).patch({ productName: name.trim() }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['products', productId] })
    },
  })
  const unchanged = name.trim() === productName

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        rename.mutate()
      }}
    >
      <label htmlFor="product-name" className="block text-m font-bold">
        プロダクト名
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="product-name"
          value={name}
          maxLength={100}
          disabled={rename.isPending}
          onChange={(e) => {
            setName(e.target.value)
            rename.reset()
          }}
          className={inputClass}
        />
        <IconButton
          type="submit"
          icon={Pencil}
          label="名前の変更"
          variant="outline"
          className="bg-panel"
          disabled={rename.isPending || !name.trim() || unchanged}
        />
      </div>
      {rename.isSuccess && <p className="text-m">変更しました</p>}
      {rename.isError && <ErrorText message={rename.error.message} />}
    </form>
  )
}

// アイコンの削除(アイコンがあるときだけ出す)。確認の 2 段階は、プロダクトの削除と同じ流儀(押すと確認の文が出て、もう一度押すと消える)
function AvatarBlock({ productId }: { productId: string }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const remove = useMutation({
    mutationFn: () => edenData(eden().api.product({ productId }).avatar.delete()),
    onSuccess: () => {
      setConfirming(false)
      // `['products']` で始まるキーをすべて取り直す(一覧と、そのプロダクトのデータ・ツリー)
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  return (
    <div className="space-y-2">
      <h3 className="text-m font-bold">アイコン</h3>
      {confirming ? (
        <div className="space-y-2">
          <p className="text-m">アイコンを削除しますか?</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
              className={buttonClass}
            >
              削除する
            </button>
            <IconButton
              icon={X}
              label="やめる"
              variant="outline"
              className="bg-panel"
              disabled={remove.isPending}
              onClick={() => {
                setConfirming(false)
                remove.reset()
              }}
            />
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={buttonClass}>
          アイコンを削除
        </button>
      )}
      {remove.isError && (
        <ErrorText
          message={avatarErrorMessage(remove.error instanceof ApiError ? remove.error.status : 0)}
        />
      )}
    </div>
  )
}

function DeleteBlock({
  productId,
  productName,
  memberCount,
}: {
  productId: string
  productName: string
  memberCount?: number
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const remove = useMutation({
    mutationFn: () => edenData(eden().api.product({ productId }).delete()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void navigate({ to: '/home' })
    },
  })

  return (
    <div className="space-y-2 border-t border-line pt-4">
      <h3 className="text-m font-bold">危険な操作</h3>
      {confirming ? (
        <div className="space-y-2">
          <p className="break-words text-m">
            「{productName}」を削除しますか?{' '}
            {memberCount === undefined ? 'メンバー' : `メンバー(${memberCount} 人)`}
            、タスク、招待、タスクの種類が、すべて消えます。元に戻せません
          </p>
          <label htmlFor="delete-confirm" className="block text-m">
            確認のため、プロダクト名を入力してください
          </label>
          <input
            id="delete-confirm"
            autoFocus
            value={typed}
            disabled={remove.isPending}
            onChange={(e) => setTyped(e.target.value)}
            className={`${inputClass} w-full`}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={remove.isPending || typed !== productName}
              onClick={() => remove.mutate()}
              className={buttonClass}
            >
              削除する
            </button>
            <IconButton
              icon={X}
              label="やめる"
              variant="outline"
              className="bg-panel"
              disabled={remove.isPending}
              onClick={() => {
                setConfirming(false)
                setTyped('')
                remove.reset()
              }}
            />
          </div>
        </div>
      ) : (
        <IconButton
          icon={Trash2}
          label="このプロダクトを削除"
          variant="outline"
          className="bg-panel"
          onClick={() => setConfirming(true)}
        />
      )}
      {remove.isError && <ErrorText message={remove.error.message} />}
    </div>
  )
}

// リーダー用。プロダクト名の変更と、アイコンの削除と、プロダクトの削除。開閉は親が制御する
export function ProductManageDialog({
  productId,
  productName,
  memberCount,
  avatarUrl,
  open,
  onClose,
}: {
  productId: string
  productName: string
  /** 知っていれば、削除の確認文にメンバー数を出す */
  memberCount?: number
  /** 現在のアイコンの URL。あるときだけ「アイコンを削除」を出す */
  avatarUrl?: string | null
  open: boolean
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-l font-bold">プロダクトの管理</h2>
      <RenameBlock productId={productId} productName={productName} />
      {avatarUrl && <AvatarBlock productId={productId} />}
      <DeleteBlock
        productId={productId}
        productName={productName}
        memberCount={memberCount}
      />
      <IconButton
        icon={X}
        label="閉じる"
        variant="outline"
        className="bg-panel"
        onClick={onClose}
      />
    </Modal>
  )
}
