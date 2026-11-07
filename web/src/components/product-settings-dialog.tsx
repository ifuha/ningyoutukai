import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImageIcon, Pencil, Settings, Trash2, TriangleAlert, X } from 'lucide-react'
import { AvatarSettings } from '#/components/avatar-settings'
import { IconButton } from '#/components/icon-button'
import { SettingsShell, type SettingsShellSection } from '#/components/settings-shell'
import { eden, edenData } from '#/lib/eden'
import { errorMessage } from '#/lib/error-message'

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
    <div className="space-y-2">
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

/** プロダクト設定のカテゴリ(左の並び順)。最初は「一般」 */
export function productSettingsSections({
  productId,
  productName,
  memberCount,
  avatarUrl,
}: {
  productId: string
  productName: string
  memberCount?: number
  avatarUrl?: string | null
}): SettingsShellSection[] {
  return [
    {
      id: 'general',
      label: '一般',
      icon: Settings,
      render: () => <RenameBlock productId={productId} productName={productName} />,
    },
    {
      id: 'icon',
      label: 'アイコン',
      icon: ImageIcon,
      render: () => (
        <AvatarSettings productId={productId} productName={productName} avatarUrl={avatarUrl} />
      ),
    },
    {
      id: 'danger',
      label: '危険な操作',
      icon: TriangleAlert,
      render: () => (
        <DeleteBlock productId={productId} productName={productName} memberCount={memberCount} />
      ),
    },
  ]
}

// プロダクト設定のモーダル(リーダー用)。左にカテゴリ(一般・アイコン・危険な操作)、右に中身。枠は `settings-shell.tsx`。
// 一般: プロダクト名の変更 / アイコン: アイコンの設定のすべて(選ぶ・設定する・削除) / 危険な操作: プロダクトの削除。開閉は親が制御する
export function ProductSettingsDialog({
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
  /** 現在のアイコンの URL。なければ null */
  avatarUrl?: string | null
  open: boolean
  onClose: () => void
}) {
  return (
    <SettingsShell
      open={open}
      onClose={onClose}
      title="プロダクト設定"
      ariaLabel="プロダクト設定の項目"
      sections={productSettingsSections({ productId, productName, memberCount, avatarUrl })}
    />
  )
}
