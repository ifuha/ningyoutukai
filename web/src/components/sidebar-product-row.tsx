import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ContextMenu } from '#/components/context-menu'
import { ProductAvatar } from '#/components/product-avatar'
import { ApiError } from '#/lib/api'
import { eden, edenData } from '#/lib/eden'
import { AVATAR_ACCEPT, avatarErrorMessage, validateAvatarFile } from '#/lib/product-avatar'
import { sidebarMenuItems } from '#/lib/sidebar-menu'
import { useLongPress } from '#/lib/use-long-press'

// エラーを出しておく時間(ミリ秒)
const ERROR_MS = 5000

// サイドバーのプロダクトの 1 行(`li`)。
// - アイコンは、行の左から 3px、上下中央に重ねる(押せない表示。行の大きさは変わらない)。名前は、その分(18px + 余白 8px)だけ右にずらす
// - リーダーの行だけ、右クリック(スマホは長押し)でメニューを出す: アイコンを変更・アイコンを削除・プロダクト管理。メンバーの行は、何も出さない(ブラウザ標準のメニューもそのまま)
//   - 画像の確認・送信・エラーは、アイコンを変更するときの処理。エラーは、行の下に小さく出し(`role="alert"`)、約 5 秒で消える。次の操作でも消える
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
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
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
    onSuccess,
    onError,
  })
  const remove = useMutation({
    mutationFn: () => edenData(eden().api.product({ productId }).avatar.delete()),
    onSuccess,
    onError,
  })

  // エラーは約 5 秒で消す
  useEffect(() => {
    if (error === null) return
    const timer = setTimeout(() => setError(null), ERROR_MS)
    return () => clearTimeout(timer)
  }, [error])

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
      {isLeader && (
        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          hidden
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0]
            // 同じファイルをもう一度選べるように、選択を空に戻す
            e.target.value = ''
            if (!file) return
            const problem = validateAvatarFile(file)
            if (problem) {
              setError(problem)
              return
            }
            setError(null)
            upload.mutate(file)
          }}
        />
      )}
      {error !== null && (
        <p role="alert" className="px-2 pb-1 text-s break-words">
          {error}
        </p>
      )}
      {isLeader && menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label="プロダクトのメニュー"
          onClose={closeMenu}
          items={sidebarMenuItems({
            hasAvatar: Boolean(avatarUrl),
            onChangeAvatar: () => {
              setError(null)
              inputRef.current?.click()
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
