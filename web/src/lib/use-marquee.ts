import { useEffect, useRef, useState } from 'react'
import type { DragTarget } from '#/lib/drag-session'
import type { Point, Rect } from '#/lib/section-edit-geometry'
import { createMarqueeController } from '#/lib/marquee-controller'
import type { MarqueeController, MarqueeStart } from '#/lib/marquee-controller'

// 範囲選択の制御部(`marquee-controller.ts`)を、React の状態につなぐフック。
// `live`: いま描いている範囲選択の四角(キャンバス座標)。`active`: 範囲選択が始まっているか(Esc の優先順位に使う)

// 範囲選択のあとに来る click を、1 回だけ捨てる
function suppressNextClick() {
  if (typeof window === 'undefined') return
  const swallow = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}

export type UseMarqueeOptions = {
  toCanvas: (client: Point) => Point
  onLive?: (rect: Rect, additive: boolean) => void
  onCommit: (rect: Rect, additive: boolean) => void
  onCancel?: () => void
  onActiveChange?: (active: boolean) => void
}

export function useMarquee(options: UseMarqueeOptions) {
  const [live, setLive] = useState<Rect | null>(null)
  const [active, setActive] = useState(false)
  const latest = useRef(options)
  latest.current = options

  const controllerRef = useRef<MarqueeController | null>(null)
  if (controllerRef.current === null) {
    controllerRef.current = createMarqueeController({
      getTarget: () => window as unknown as DragTarget,
      getLock: () => ({ body: document.body, cursor: 'crosshair' }),
      toCanvas: (client) => latest.current.toCanvas(client),
      onLive: (rect, additive) => {
        setLive(rect)
        latest.current.onLive?.(rect, additive)
      },
      onCommit: (rect, additive) => {
        setLive(null)
        latest.current.onCommit(rect, additive)
      },
      onCancel: () => {
        setLive(null)
        latest.current.onCancel?.()
      },
      onActive: (on) => {
        setActive(on)
        latest.current.onActiveChange?.(on)
      },
      suppressClick: suppressNextClick,
    })
  }
  const controller = controllerRef.current

  useEffect(() => () => controller.dispose(), [controller])

  return {
    live,
    active,
    start: (event: MarqueeStart) => {
      setLive(null)
      controller.start(event)
    },
    cancel: () => controller.cancel(),
  }
}
