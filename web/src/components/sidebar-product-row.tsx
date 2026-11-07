import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AvatarPreviewDialog } from '#/components/avatar-preview-dialog'
import { ContextMenu } from '#/components/context-menu'
import { ProductAvatar } from '#/components/product-avatar'
import { ApiError } from '#/lib/api'
import { eden, edenData } from '#/lib/eden'
import { avatarErrorMessage, validateAvatarFile } from '#/lib/product-avatar'
import { sidebarMenuItems } from '#/lib/sidebar-menu'
import { useLongPress } from '#/lib/use-long-press'

// エラーを出しておく時間(ミリ秒)
const ERROR_MS = 5000

// サイドバーのプロダクトの 1 行(`li`)。
// - アイコンは、行の左から 3px、上下中央に重ねる(押せない表示。行の大きさは変わらない)。名前は、その分(18px + 余白 8px)だけ右にずらす
// - リーダーの行だけ、右クリック(スマホは長押し)でメニューを出す: アイコンを変更・アイコンを削除・プロダクト管理。メンバーの行は、何も出さない(ブラウザ標準のメニューもそのまま)
//   - アイコンの変更: メニューの「アイコンを変更」を押すと、**まずモーダルが開き**、中で画像を選ぶ → ブラウザ側の確認(種類・大きさ。合わなければ、送らずに、モーダルの中に理由を出す)
//     → プレビュー(大きな表示と、サイドバーでの見え方)→「設定する」で送る。送信に失敗したら、モーダルの中にエラーを出して、開いたままにする(やり直せる)。成功したら、モーダルを閉じる
//   - 行の下のエラー(`role="alert"`)は、約 5 秒で消える。次の操作でも消える
//   - 長押しが成立したあとの click(プロダクトを選ぶ)は、無視する。指が 8px 動いたら取り消す(サイドバーのスクロールとぶつからない)
export function SidebarProductRow({
  productId,
  name,
  avatarUrl,
  isLeader = false,
  active,
  onSelect,
  onManage,
}: {
  productId: string
  name: string
  avatarUrl?: string | null
  isLeader?: boolean
  active: boolean
  onSelect?: (productId: string) => void
  // メニューの「プロダクト管理」(そのプロダクトへ移動して、管理のダイアログを開く)
  onManage?: (productId: string) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  // アイコンを変更するモーダルを開いているか。と、その中で選んだ画像(条件に合ったもの。送る前)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  // メニュー(押した位置 = 画面の座標)。右クリックと、長押しで開く
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const longPress = useLongPress(({ x, y }) => setMenu({ x, y }))

  // 成功したら、`['products']` で始まるキーをすべて取り直す(一覧と、そのプロダクトのデータ・ツリー)
  const onSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }
  const onError = (e: unknown) => setError(avatarErrorMessage(e instanceof ApiError ? e.status : 0))
  const upload = useMutation({
    // Eden の `file` は `File`(multipart で送られる)
    mutationFn: (file: File) => edenData(eden().api.product({ productId }).avatar.put({ file })),
    onSuccess: () => {
      setDialogOpen(false)
      setPreviewFile(null)
      onSuccess()
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: () => edenData(eden().api.product({ productId }).avatar.delete()),
    onSuccess,
    onError,
  })

  // エラーは約 5 秒で消す(モーダルを開いている間は、消さない。やり直す人が、見落とさないように)
  useEffect(() => {
    if (error === null || dialogOpen) return
    const timer = setTimeout(() => setError(null), ERROR_MS)
    return () => clearTimeout(timer)
  }, [error, dialogOpen])

  const busy = upload.isPending || remove.isPending

  return (
    <li className="relative">
      <span
        className={`pointer-events-none absolute top-0 left-[3px] flex h-12 items-center ${busy ? 'opacity-50' : ''}`}
      >
        <ProductAvatar src={avatarUrl} name={name} />
      </span>
      <button
        type="button"
        onClick={() => {
          // 長押しでメニューを開いたあとの click は、プロダクトを選ばない
          if (longPress.consumeFired()) return
          onSelect?.(productId)
        }}
        aria-current={active ? 'page' : undefined}
        aria-busy={isLeader ? busy : undefined}
        aria-haspopup={isLeader ? 'menu' : undefined}
        onContextMenu={
          isLeader
            ? (e) => {
                // ブラウザ標準のメニューは出さない(リーダーの行だけ)
                e.preventDefault()
                longPress.cancel()
                // キーボード(メニューキー・Shift + F10)では座標が 0 になるので、行の左上にする
                const rect = e.currentTarget.getBoundingClientRect()
                const keyboard = e.clientX === 0 && e.clientY === 0
                setMenu({ x: keyboard ? rect.left : e.clientX, y: keyboard ? rect.top : e.clientY })
              }
            : undefined
        }
        onPointerDown={isLeader ? longPress.start : undefined}
        onPointerMove={isLeader ? longPress.move : undefined}
        onPointerUp={isLeader ? longPress.cancel : undefined}
        onPointerCancel={isLeader ? longPress.cancel : undefined}
        className={`flex h-12 w-full items-center truncate border-b-2 border-transparent pr-2 pl-[29px] text-left text-l font-medium transition-[border-color,background-color] duration-200 ease-out motion-reduce:transition-none hover:bg-side-item aria-[current=page]:border-ink aria-[current=page]:bg-surface aria-[current=page]:hover:bg-surface${isLeader ? ' select-none [-webkit-touch-callout:none]' : ''}`}
      >
        <span className="truncate">{name}</span>
      </button>
      {error !== null && !dialogOpen && (
        <p role="alert" className="px-2 pb-1 text-s break-words">
          {error}
        </p>
      )}
      {isLeader && (
        <AvatarPreviewDialog
          open={dialogOpen}
          file={previewFile}
          currentUrl={avatarUrl}
          productName={name}
          pending={upload.isPending}
          error={error}
          onSelectFile={(file) => {
            // 条件に合わなければ、送らずに、モーダルの中に理由を出す(前に選んだ画像は、外す)
            const problem = validateAvatarFile(file)
            upload.reset()
            if (problem) {
              setError(problem)
              setPreviewFile(null)
              return
            }
            setError(null)
            setPreviewFile(file)
          }}
          onConfirm={() => {
            if (!previewFile) return
            setError(null)
            upload.mutate(previewFile)
          }}
          onCancel={() => {
            setDialogOpen(false)
            setPreviewFile(null)
            setError(null)
            upload.reset()
          }}
        />
      )}
      {isLeader && menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label="プロダクトのメニュー"
          onClose={closeMenu}
          items={sidebarMenuItems({
            hasAvatar: Boolean(avatarUrl),
            // まずモーダルを開く(画像は、モーダルの中で選ぶ)
            onChangeAvatar: () => {
              setError(null)
              setPreviewFile(null)
              upload.reset()
              setDialogOpen(true)
            },
            // 確認は出さない(アイコンは、あとから設定し直せる)
            onDeleteAvatar: () => {
              setError(null)
              remove.mutate()
            },
            onManage: () => onManage?.(productId),
          })}
        />
      )}
    </li>
  )
}
