// セクションの編集(置く・大きさを変える・動かす・カードを動かす)の計算(画面や DOM に依存しない純粋関数)
// 座標はすべて「キャンバスの座標」。画面の座標(px、拡大率、パン)への変換は、別の層が行う
// api の検証(api/src/lib/section-input.ts)と、セクション更新の規則(api/src/routes/section/update-section.ts)に揃える

export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; width: number; height: number }
export type Size = { width: number; height: number }
// 大きさを変えるハンドル。n / s / e / w は辺(北・南・東・西)、ne / nw / se / sw は角
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

// 座標(セクションの x・y、カードの位置)の絶対値の上限(api の COORD_MAX と同じ)
export const COORD_MAX = 1_000_000
// セクションの幅・高さの上限(api の SIZE_MAX と同じ。下限は「0 より大きい」だけだが、画面では MIN_SECTION_SIZE を下回らせない)
export const SIZE_MAX = 100_000
// 画面で扱うセクションの最小の大きさ
export const MIN_SECTION_SIZE = 80
// 置いたときの既定の大きさ(Figma の section-* と同じ 300×400)
export const DEFAULT_SECTION_SIZE: Size = { width: 300, height: 400 }
// メンバーのカードの大きさ(Figma の task カード)
export const CARD_SIZE: Size = { width: 236, height: 138 }

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

// NaN は 0 として扱う(Infinity は上限に収まる)
function clampCoord(value: number): number {
  return Number.isNaN(value) ? 0 : clamp(value, -COORD_MAX, COORD_MAX)
}

// カードの位置を、座標の上限に収める
export function clampCardPosition(position: Point): Point {
  return { x: clampCoord(position.x), y: clampCoord(position.y) }
}

// 2 つの四角が、まったく同じか
export function isSameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

// 2 つの四角が、どの値も epsilon 以内の差か(クリックだけで動いていない操作の判定に使う。既定は 0.5)
export function rectsEqualWithin(a: Rect, b: Rect, epsilon = 0.5): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.width - b.width) <= epsilon &&
    Math.abs(a.height - b.height) <= epsilon
  )
}

// 動かす前と後の、実際の差分。座標の上限で丸められたときは、求めた差分と違うので、
// 所属メンバーを一緒に動かす差分(applyDeltaToMembers)には、こちらを使う
export function rectDelta(before: Rect, after: Rect): Point {
  return { x: after.x - before.x, y: after.y - before.y }
}
