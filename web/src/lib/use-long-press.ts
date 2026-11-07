import { useCallback, useEffect, useRef } from 'react'

// 長押し(タッチで 500ms)のフック。メモ(`sticky-note.tsx`)とサイドバーのプロダクトの行で共有する。
// - タッチだけが対象(マウスの右ボタンは、`contextmenu` のメニューのためで、対象外)
// - 指が 8px 以上動いたら取り消す(スクロールや、メモの移動とぶつからないように)
// - 長押しが成立したあとの `click` は、使う側が `consumeFired()` で見分けて、無視できる
/** 長押しと見なす時間(ms)と、指がこの距離(px)以上動いたら取り消す */
export const LONG_PRESS_MS = 500
export const LONG_PRESS_MOVE_PX = 8

type PressPoint = { x: number; y: number }

/** 長押しを始める押下か(タッチの主ボタンだけ) */
export function startsLongPress(e: { pointerType: string; button: number }): boolean {
  return e.pointerType === 'touch' && e.button === 0
}

/** 押した位置から、指が取り消す距離(8px)以上動いたか */
export function movedTooFar(from: PressPoint, to: { clientX: number; clientY: number }): boolean {
  return Math.hypot(to.clientX - from.x, to.clientY - from.y) >= LONG_PRESS_MOVE_PX
}

/**
 * 長押しのフック。`start` / `move` / `cancel` を、対象の要素の pointer イベントに渡す。
 * 長押しが成立すると、押した位置(画面の座標)で `onLongPress` を呼ぶ
 */
export function useLongPress(onLongPress: (point: PressPoint) => void) {
  const latest = useRef(onLongPress)
  latest.current = onLongPress
  const press = useRef<{ timer: number; x: number; y: number } | null>(null)
  // 長押しが成立したか(そのあとの click を無視するため)。次の押下で戻す
  const fired = useRef(false)

  const cancel = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }, [])
  useEffect(() => cancel, [cancel])

  const start = useCallback(
    (e: { clientX: number; clientY: number; pointerType: string; button: number }) => {
      fired.current = false
      cancel()
      if (!startsLongPress(e)) return
      const { clientX: x, clientY: y } = e
      press.current = {
        x,
        y,
        timer: window.setTimeout(() => {
          press.current = null
          fired.current = true
          latest.current({ x, y })
        }, LONG_PRESS_MS),
      }
    },
    [cancel],
  )

  const move = useCallback(
    (e: { clientX: number; clientY: number }) => {
      if (press.current && movedTooFar(press.current, e)) cancel()
    },
    [cancel],
  )

  /** 長押しが成立したあとの click なら true(1 回だけ)。その click は、無視する */
  const consumeFired = useCallback(() => {
    const was = fired.current
    fired.current = false
    return was
  }, [])

  return { start, move, cancel, consumeFired }
}
