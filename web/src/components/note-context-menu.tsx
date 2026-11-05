import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// メモの右クリック(スマホは長押し)のメニュー。項目: 編集・削除・公開 / 非公開の切り替え
// 画面(`position: fixed`)の座標で、押した位置の近くに出す。キャンバスの変換(パン・ズーム)の外(body)に描くので、拡大率に左右されない。画面からはみ出す分は、内側に寄せる
// 閉じる: メニューの外の押下(キャンバスのパンの開始も、これに入る)・ホイール(ズーム)・Esc・項目を選んだとき・画面のサイズが変わったとき
// 上下キーで項目を移動(端でひと回り)、Home / End で先頭 / 末尾、Enter で選ぶ。開いたとき、先頭の項目にフォーカスする
const itemClass =
  'flex w-full cursor-pointer items-center justify-between gap-4 px-2 py-1 text-left hover:bg-side-item focus-visible:bg-side-item focus-visible:outline-none'
/** 画面の端との間に空ける余白(px) */
const EDGE_PX = 8

export function NoteContextMenu({
  x,
  y,
  isPublic,
  onEdit,
  onDelete,
  onTogglePublic,
  onClose,
}: {
  /** 押した位置(画面の座標) */
  x: number
  y: number
  /** いまの状態(公開か) */
  isPublic: boolean
  onEdit: () => void
  onDelete: () => void
  onTogglePublic: () => void
  /** 閉じる(項目を選んだときは、その操作のあとに呼ぶ) */
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // 大きさを測って、画面からはみ出さない位置にする(描画の前に直すので、ちらつかない)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      left: Math.max(EDGE_PX, Math.min(x, window.innerWidth - width - EDGE_PX)),
      top: Math.max(EDGE_PX, Math.min(y, window.innerHeight - height - EDGE_PX)),
    })
  }, [x, y])

  // 開いたとき、先頭の項目にフォーカスする(開いている間に 1 回だけ)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const outside = (e: Event) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return
      onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('wheel', outside, { capture: true, passive: true })
    document.addEventListener('keydown', key)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('wheel', outside, true)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const choose = (action: () => void) => () => {
    action()
    onClose()
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="メモのメニュー"
      // メニューの中の操作は、メモ(React の親)の移動などに伝えない
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
        const i = items.indexOf(document.activeElement as HTMLElement)
        const move = (to: number) => {
          e.preventDefault()
          items[(to + items.length) % items.length]?.focus()
        }
        if (e.key === 'ArrowDown') move(i + 1)
        else if (e.key === 'ArrowUp') move(i < 0 ? -1 : i - 1)
        else if (e.key === 'Home') move(0)
        else if (e.key === 'End') move(-1)
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 w-56 shadow-box bg-surface p-1 text-m text-ink"
      style={{ left: pos.left, top: pos.top }}
    >
      <button type="button" role="menuitem" className={itemClass} onClick={choose(onEdit)}>
        編集
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={choose(onDelete)}>
        削除
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={choose(onTogglePublic)}>
        <span>{isPublic ? '非公開にする' : '公開にする'}</span>
        <span className="text-ink/60">いま: {isPublic ? '公開' : '非公開'}</span>
      </button>
    </div>,
    document.body,
  )
}
