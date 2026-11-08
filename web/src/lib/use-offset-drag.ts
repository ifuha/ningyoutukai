import { useEffect, useRef, useState } from 'react'

// つかんで動かせる部品の、位置のロジック(画面に依存しない部分は `moveBy` / `settle` の純粋関数)。
// 位置は「初めの置き場所からのずれ(px)」。つかんでいる間は手元の位置を使い、離したら `onMove` で保存して、終わるまでは手元の位置のまま。
// 使う側は、返す `bind` を要素に展開し、`at` で位置を決める(AI のカード。メモ・コメントなど、同じ形のものにも使える)

export type Offset = { x: number; y: number }

/** ドラッグと見なす最小の動き(画面の px)。これより小さい動きは、クリック */
export const MOVE_THRESHOLD = 3

/** つかんだ位置 `base` から、画面で `(dxClient, dyClient)` 動いたときの位置(拡大率 `scale` で割る)。0 以下の拡大率は 1 として扱う */
export function moveBy(base: Offset, dxClient: number, dyClient: number, scale: number): Offset {
  const s = scale > 0 ? scale : 1
  return { x: base.x + dxClient / s, y: base.y + dyClient / s }
}

/** ドラッグと見なすか(画面の動きが、しきい値以上) */
export function isDrag(dxClient: number, dyClient: number): boolean {
  return Math.hypot(dxClient, dyClient) >= MOVE_THRESHOLD
}

/** 保存する値: 整数(px)に丸める */
export function settle(p: Offset): Offset {
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

export function useOffsetDrag({
  saved,
  scale,
  enabled,
  onMove,
}: {
  /** 保存されている位置(ずれ)。変わったら、手元の位置はやめる */
  saved: Offset
  scale: number
  /** false なら、つかめない */
  enabled: boolean
  onMove?: (offset: Offset) => Promise<void> | void
}) {
  const [local, setLocal] = useState<Offset | null>(null)
  const drag = useRef<{ startX: number; startY: number; base: Offset; moved: boolean } | null>(null)
  const justDragged = useRef(false)
  useEffect(() => {
    setLocal(null)
  }, [saved.x, saved.y])
  const at = local ?? saved

  const bind = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      // 持ち主のカード(ドラッグで動くカード)や、キャンバスのパンに、渡さない
      e.stopPropagation()
      if (!enabled || e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { startX: e.clientX, startY: e.clientY, base: at, moved: false }
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (!d.moved && !isDrag(dx, dy)) return
      d.moved = true
      setLocal(moveBy(d.base, dx, dy, scale))
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current
      drag.current = null
      if (!d?.moved || !onMove) return
      justDragged.current = true
      const next = moveBy(d.base, e.clientX - d.startX, e.clientY - d.startY, scale)
      setLocal(next)
      void Promise.resolve(onMove(settle(next))).finally(() => setLocal(null))
    },
    onPointerCancel: () => {
      drag.current = null
      setLocal(null)
    },
    // ドラッグのあとの click は、開く操作にしない
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
      if (justDragged.current) {
        justDragged.current = false
        e.stopPropagation()
        e.preventDefault()
      }
    },
    onDragStart: (e: React.DragEvent<HTMLElement>) => e.preventDefault(),
  }
  return { at, bind }
}
