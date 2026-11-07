import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/** 高さが変わるときの動きの時間(ms)。`styles.css` の `details-in`(0.18 秒)に合わせる */
export const RESIZE_MS = 180

/**
 * 中身の高さが変わったとき(詳細を開く、エラーが出るなど)に、箱の高さを、なめらかに動かす。
 * - 中身の高さを `ResizeObserver` で測り、変わったら、外側の箱の高さを、新しい高さへ動かす(下の要素が、一瞬で押し下げられない)
 * - 動いている間だけ、外側の箱ではみ出しを隠す(中身が先に伸びていても、箱の動きに合わせて現れる)。動いていないときは隠さない(フォーカスの枠などが切れない)
 * - 最初の高さは、動かさずに決める。「動きを減らす」設定のときは、動かさない
 * - 高さを固定するので、中の要素の高さは、中身が決める(`height: 100%` のような、親の高さに頼る指定は使わない)
 */
export function ResizeBox({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  const [animating, setAnimating] = useState(false)
  const lastHeight = useRef<number | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const observer = new ResizeObserver(() => {
      const next = el.getBoundingClientRect().height
      const prev = lastHeight.current
      lastHeight.current = next
      // 最初の高さ、動きを減らす設定、ほぼ同じ高さのときは、動かさずに決める
      if (prev === null || reduced || Math.abs(next - prev) < 1) {
        setHeight(next)
        return
      }
      setAnimating(true)
      setHeight(next)
      // 動きが終わったら、はみ出しの隠しを外す(transitionend が来なかったときの保険も兼ねる)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setAnimating(false), RESIZE_MS + 60)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  return (
    <div
      data-resize-box=""
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget) setAnimating(false)
      }}
      style={{
        height: height ?? 'auto',
        transition: animating ? `height ${RESIZE_MS}ms ease-out` : undefined,
        overflow: animating ? 'hidden' : undefined,
      }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  )
}
