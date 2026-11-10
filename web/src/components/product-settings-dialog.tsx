import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, ImageIcon, Pencil, Settings, Trash2, X } from 'lucide-react'
import { AvatarSettings } from '#/components/avatar-settings'
import { DocumentSettings } from '#/components/document-settings'
import { IconButton } from '#/components/icon-button'
import { SettingsShell, type SettingsShellSection } from '#/components/settings-shell'
import { eden, edenData } from '#/lib/eden'
import { errorMessage } from '#/lib/error-message'

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
      <label htmlFor="product-name" className="block text-m font-medium">
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
    <div className="space-y-3">
      <p className="text-m">
        このプロダクトを削除すると、
        {memberCount === undefined ? 'メンバー' : `メンバー(${memberCount} 人)`}
        、タスク、招待、タスクの種類が、すべて消えます。<strong className="font-medium">元に戻せません。</strong>
      </p>
      {confirming ? (
        <div className="space-y-2">
          <label htmlFor="delete-confirm" className="block break-words text-m">
            確認のため、「{productName}」と入力してください
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
            <IconButton
              type="button"
              icon={Trash2}
              label={remove.isPending ? '削除中…' : '削除する'}
              showLabel
              variant="danger-solid"
              disabled={remove.isPending || typed !== productName}
              onClick={() => remove.mutate()}
            />
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
          showLabel
          variant="danger"
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
  documentAutoDeleteDays,
}: {
  productId: string
  productName: string
  memberCount?: number
  avatarUrl?: string | null
  /** 文書の自動削除までの日数(知っていれば) */
  documentAutoDeleteDays?: number
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
      id: 'documents',
      label: '文書',
      icon: FileText,
      render: () => <DocumentSettings productId={productId} days={documentAutoDeleteDays} />,
    },
    {
      id: 'delete',
      label: 'プロダクトの削除',
      icon: Trash2,
      danger: true,
      render: () => (
        <DeleteBlock productId={productId} productName={productName} memberCount={memberCount} />
      ),
    },
  ]
}

// プロダクト設定のモーダル(リーダー用)。左にカテゴリ(一般・アイコン・文書・プロダクトの削除)、右に中身。枠は `settings-shell.tsx`。
// 一般: プロダクト名の変更 / アイコン: アイコンの設定のすべて(選ぶ・設定する・削除) / 文書: 自動削除までの日数 / プロダクトの削除(危険な操作なので、赤で示す)。開閉は親が制御する
export function ProductSettingsDialog({
  productId,
  productName,
  memberCount,
  avatarUrl,
  documentAutoDeleteDays,
  open,
  onClose,
}: {
  productId: string
  productName: string
  /** 知っていれば、削除の確認文にメンバー数を出す */
  memberCount?: number
  /** 現在のアイコンの URL。なければ null */
  avatarUrl?: string | null
  /** 文書の自動削除までの日数(「文書」の項目の初期値) */
  documentAutoDeleteDays?: number
  open: boolean
  onClose: () => void
}) {
  return (
    <SettingsShell
      open={open}
      onClose={onClose}
      title="プロダクト設定"
      ariaLabel="プロダクト設定の項目"
      sections={productSettingsSections({ productId, productName, memberCount, avatarUrl, documentAutoDeleteDays })}
    />
  )
}
