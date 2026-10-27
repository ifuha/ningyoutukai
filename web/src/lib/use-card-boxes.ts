import { useCallback, useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { Box } from '#/lib/tree-layout'

// 中身(`content`)の左上を原点とした、`data-card-id` を持つ要素(カード)の位置と大きさを測る
// 倍率(transform)は、offsetLeft / offsetTop / offsetWidth / offsetHeight には影響しない(倍率をかける前の値)
// 親子の線(SVG)の端点を、カードの実際の位置・高さ(タスクの数で変わる)に合わせるために使う
//
// `content` は、位置を決める要素(absolute / relative)にしておくこと(offsetParent をたどる終点)
// `enabled` が false のときは、測らない(線を SVG で描く必要がないとき。観察も始めない)
// `watch`: カードの集まりが変わったら変わる値(キー)。変わったら、測り直して、観察する要素も取り直す
// サイズが変わる(カードの中身の増減、リサイズ)ときは、ResizeObserver で測り直す

/** `el` の、`content` の左上を原点とした矩形 */
// 要素から offsetParent をたどり、offsetLeft / offsetTop を足していく(`content` に着くまで)。DOM に依存するのは、この 4 つの値だけ
type Offsets = {
  offsetLeft: number
  offsetTop: number
  offsetWidth: number
  offsetHeight: number
  offsetParent: unknown
}

export function boxWithin(content: unknown, el: Offsets): Box {
  let left = 0
  let top = 0
  let node: Offsets | null = el
  while (node && node !== content) {
    left += node.offsetLeft
    top += node.offsetTop
    node = (node.offsetParent as Offsets | null) ?? null
  }
  return { left, top, width: el.offsetWidth, height: el.offsetHeight }
}

function sameBoxes(a: Map<string, Box>, b: Map<string, Box>): boolean {
  if (a.size !== b.size) return false
  for (const [id, x] of a) {
    const y = b.get(id)
    if (
      !y ||
      x.left !== y.left ||
      x.top !== y.top ||
      x.width !== y.width ||
      x.height !== y.height
    ) {
      return false
    }
  }
  return true
}

export function useCardBoxes(
  contentRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  watch: string,
): Map<string, Box> | null {
  const [boxes, setBoxes] = useState<Map<string, Box> | null>(null)

  const measure = useCallback(() => {
    const content = contentRef.current
    if (!content) return
    const next = new Map<string, Box>()
    for (const el of content.querySelectorAll<HTMLElement>('[data-card-id]')) {
      const id = el.dataset.cardId
      if (id) next.set(id, boxWithin(content, el))
    }
    setBoxes((prev) => (prev && sameBoxes(prev, next) ? prev : next))
  }, [contentRef])

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!enabled || !content) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    for (const el of content.querySelectorAll('[data-card-id]')) {
      observer.observe(el)
    }
    return () => observer.disconnect()
    // watch: カードの集まりが変わったら、測り直して観察し直す
  }, [contentRef, enabled, measure, watch])

  return enabled ? boxes : null
}
