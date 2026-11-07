import { MessageSquare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { IconButton } from '#/components/icon-button'

// ツールバーの「コメント」。Figma のコメントに近い置き方:
// - ボタンを押したまま画面(ツリー)へドラッグして、離した位置に置く(ドラッグ&ドロップ)。ドラッグ中は、ピンが指に付いてくる
// - 動かさずに離した(クリック)ときと、キーボード(Enter / Space)では、画面の中央に置く
// 置いたあとの入力欄は、親(`ProductTree`)が出す。ここは「どこに置くか」を `onPlace` で渡すだけ。リーダーだけが使える(親が渡す)
/** これ以上(px)動いたら、ドラッグとみなす。それまでは、クリック */
const DRAG_THRESHOLD_PX = 4

export type CommentPlacement = { x: number; y: number } | 'center'

export function CommentToolButton({
  disabled = false,
  tip,
  onPlace,
}: {
  disabled?: boolean
  tip?: string
  /** 置く位置(画面の座標)。クリックとキーボードは `'center'` */
  onPlace: (placement: CommentPlacement) => void
}) {
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const onPlaceRef = useRef(onPlace)
  onPlaceRef.current = onPlace
  const cleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanupRef.current?.(), [])

  const begin = (e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return
    startRef.current = { x: e.clientX, y: e.clientY }
    let dragging = false
    const move = (ev: PointerEvent) => {
      const s = startRef.current
      if (!s) return
      if (!dragging && Math.hypot(ev.clientX - s.x, ev.clientY - s.y) >= DRAG_THRESHOLD_PX) dragging = true
      if (dragging) setGhost({ x: ev.clientX, y: ev.clientY })
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      cleanupRef.current = null
      startRef.current = null
      setGhost(null)
    }
    const up = (ev: PointerEvent) => {
      const wasDragging = dragging
      stop()
      onPlaceRef.current(wasDragging ? { x: ev.clientX, y: ev.clientY } : 'center')
    }
    const cancel = () => stop()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    cleanupRef.current = stop
  }

  return (
    <>
      <IconButton
        icon={MessageSquare}
        label="コメント"
        tip={tip ?? 'コメントを置く(ドラッグして、置きたい場所で離す)'}
        disabled={disabled}
        onPointerDown={begin}
        // キーボード(detail が 0)の Enter / Space は、画面の中央に置く。マウスのクリックは、ポインタの操作で扱い済み
        onClick={(e) => {
          if (e.detail === 0) onPlace('center')
        }}
      />
      {ghost && (
        <span
          aria-hidden="true"
          className="pointer-events-none fixed z-50 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-box bg-panel text-ink"
          style={{ left: ghost.x, top: ghost.y }}
        >
          <MessageSquare size={18} />
        </span>
      )}
    </>
  )
}
