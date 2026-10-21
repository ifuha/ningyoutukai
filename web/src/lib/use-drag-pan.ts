import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, PointerEvent, RefObject } from 'react'

const DRAG_THRESHOLD = 5
const KEY_STEP = 48

// 横にはみ出した中身を、ドラッグ(マウス)・スワイプ(タッチ)・左右キーで動かす。scrollLeft を直接変えるので、端で止まる
// 5px 以上動くまでは、ただのクリック扱い(ボタンはそのまま押せる)。動かしたあとの解放では、click を捨てる
// `deps` が変わったら、動かせるかを測り直す(倍率など)
export function useDragPan(
  ref: RefObject<HTMLElement | null>,
  deps: ReadonlyArray<unknown>,
) {
  const [canPan, setCanPan] = useState(false)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ id: number; x: number; left: number } | null>(null)
  const moved = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setCanPan(el.scrollWidth > el.clientWidth + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps])

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!canPan || (e.pointerType === 'mouse' && e.button !== 0)) return
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      left: e.currentTarget.scrollLeft,
    }
    moved.current = false
  }
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    if (!moved.current) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return
      moved.current = true
      setDragging(true)
      // キャプチャは動かし始めてから(先にすると、ボタンへの click が届かなくなる)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    e.currentTarget.scrollLeft = d.left - dx
  }
  const end = (e: PointerEvent<HTMLElement>) => {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null
    setDragging(false)
    // click が来なかった場合に備えて、少しあとで戻す
    setTimeout(() => {
      moved.current = false
    }, 0)
  }
  const onClickCapture = (e: MouseEvent) => {
    if (moved.current) {
      e.preventDefault()
      e.stopPropagation()
    }
  }
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!canPan || e.target !== e.currentTarget) return
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    e.currentTarget.scrollLeft += e.key === 'ArrowLeft' ? -KEY_STEP : KEY_STEP
  }

  return {
    canPan,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onClickCapture,
      onKeyDown,
    },
  }
}
