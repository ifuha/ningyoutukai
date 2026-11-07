import { useCallback, useState } from 'react'
import { ContextMenu } from '#/components/context-menu'
import { ProductAvatar } from '#/components/product-avatar'
import { sidebarMenuItems } from '#/lib/sidebar-menu'
import { useLongPress } from '#/lib/use-long-press'

// サイドバーのプロダクトの 1 行(`li`)。
// - アイコンは、行の左から 8px、上下中央に重ねる(押せない表示。行の大きさは変わらない)。名前は、その分(24px + 余白 8px)だけ右にずらす
// - リーダーの行だけ、右クリック(スマホは長押し)でメニューを出す: 「プロダクト設定」の 1 つだけ(押すと、そのプロダクトへ移動して、設定のモーダルを開く。アイコンの変更・削除も、そのモーダルの中)。メンバーの行は、何も出さない(ブラウザ標準のメニューもそのまま)
//   - 長押しが成立したあとの click(プロダクトを選ぶ)は、無視する。指が 8px 動いたら取り消す(サイドバーのスクロールとぶつからない)
export function SidebarProductRow({
  productId,
  name,
  avatarUrl,
  isLeader = false,
  active,
  onSelect,
  onOpenSettings,
}: {
  productId: string
  name: string
  avatarUrl?: string | null
  isLeader?: boolean
  active: boolean
  onSelect?: (productId: string) => void
  // メニューの「プロダクト設定」(そのプロダクトへ移動して、設定のモーダルを開く)
  onOpenSettings?: (productId: string) => void
}) {
  // メニュー(押した位置 = 画面の座標)。右クリックと、長押しで開く
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const longPress = useLongPress(({ x, y }) => setMenu({ x, y }))

  return (
    <li className="relative">
      <span className="pointer-events-none absolute top-0 left-2 flex h-12 items-center">
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
        className={`flex h-12 w-full items-center truncate border-b-2 border-transparent pr-2 pl-[40px] text-left text-l font-medium transition-[border-color,background-color] duration-200 ease-out motion-reduce:transition-none hover:bg-side-item aria-[current=page]:border-ink aria-[current=page]:bg-surface aria-[current=page]:hover:bg-surface${isLeader ? ' select-none [-webkit-touch-callout:none]' : ''}`}
      >
        <span className="truncate">{name}</span>
      </button>
      {isLeader && menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label="プロダクトのメニュー"
          onClose={closeMenu}
          items={sidebarMenuItems({ onOpenSettings: () => onOpenSettings?.(productId) })}
        />
      )}
    </li>
  )
}
