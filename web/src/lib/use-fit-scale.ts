import { useCallback, useLayoutEffect, useRef, useState } from 'react'

type Fit = { scale: number; height: number }

// コンテナの幅に収まるよう、中身を縮小する倍率を測る。収まるときは 1(拡大はしない)
// 測定前(サーバー描画・初回)は null を返すので、呼び出し側は中身を隠しておく
export function useFitScale() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [fit, setFit] = useState<Fit | null>(null)

  const measure = useCallback(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return
    // offsetWidth / offsetHeight は transform の影響を受けない(縮小前の自然な大きさ)
    const contentWidth = content.offsetWidth
    if (contentWidth === 0) return
    const scale = Math.min(1, container.clientWidth / contentWidth)
    const height = content.offsetHeight * scale
    setFit((prev) =>
      prev &&
      Math.abs(prev.scale - scale) < 0.001 &&
      Math.abs(prev.height - height) < 0.5
        ? prev
        : { scale, height },
    )
  }, [])

  useLayoutEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    if (contentRef.current) observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [measure])

  return {
    containerRef,
    contentRef,
    scale: fit ? fit.scale : null,
    height: fit ? fit.height : undefined,
  }
}
