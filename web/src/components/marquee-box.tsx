import type { Rect } from '#/lib/section-edit-geometry'

// 範囲選択の四角。キャンバスの変換(パン・ズーム)の内側に置く。
// 線の太さは、拡大率に関わらず画面上で 1px に見えるよう、`1 / scale` にする(キャンバスの単位)。
// 塗りは、いまの文字の色(`--color-ink`)の 8%。ポインタは通す
export function MarqueeBox({
  rect,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
}: {
  rect: Rect
  scale?: number
  offsetX?: number
  offsetY?: number
}) {
  const stroke = scale > 0 ? 1 / scale : 1
  return (
    <div
      data-marquee=""
      aria-hidden="true"
      className="pointer-events-none absolute z-50"
      style={{
        left: rect.x + offsetX,
        top: rect.y + offsetY,
        width: rect.width,
        height: rect.height,
        border: `${stroke}px solid var(--color-ink)`,
        backgroundColor: 'color-mix(in srgb, var(--color-ink) 8%, transparent)',
      }}
    />
  )
}
