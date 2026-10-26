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

// ドラッグの 1 軸ぶん。始点(s)は動かさず、終点(e)の向きに伸ばす。最小と上限の大きさに収める
function dragAxis(s: number, e: number): { lo: number; size: number } {
  const size = clamp(Math.abs(e - s), MIN_SECTION_SIZE, SIZE_MAX)
  const lo = e >= s ? s : s - size
  return { lo: clampCoord(lo), size }
}

// ドラッグで四角を描く。どの向きにドラッグしても、正の幅・高さの四角にする(始点の角は動かさない)
// - 縦も横も最小の大きさに満たない(ほぼクリックだけ)ときは、始点を左上にして、既定の大きさ(300×400)にする
// - 片方だけが最小に満たないときは、その辺だけを最小の大きさまで伸ばす(ドラッグした向きへ)
// - 座標と大きさが上限を超えるときは、上限に丸める
export function rectFromDrag(start: Point, end: Point): Rect {
  const s = clampCardPosition(start)
  const e = clampCardPosition(end)
  if (Math.abs(e.x - s.x) < MIN_SECTION_SIZE && Math.abs(e.y - s.y) < MIN_SECTION_SIZE) {
    return { x: s.x, y: s.y, ...DEFAULT_SECTION_SIZE }
  }
  const xs = dragAxis(s.x, e.x)
  const ys = dragAxis(s.y, e.y)
  return { x: xs.lo, y: ys.lo, width: xs.size, height: ys.size }
}

// 大きさを変える 1 軸ぶん。lo(小さい側の端)と size を受け取り、動かす側の端を delta だけ動かす
// - moveLow: 小さい側(西・北)の端を動かす。反対側(大きい側)の端は動かない
// - 小さい側の端は座標の上限を超えない。大きさは、最小と上限の間に収まる
// - すでに最小より小さい四角(api の既存の行)は、それ以上は縮まず、広げることだけができる
function resizeAxis(
  lo: number,
  size: number,
  delta: number,
  moveLow: boolean,
  minSize: number,
): { lo: number; size: number } {
  const hi = lo + size
  const minEff = Math.min(minSize, size)
  if (moveLow) {
    const lower = Math.min(Math.max(hi - SIZE_MAX, -COORD_MAX), hi - minEff)
    const newLo = clamp(lo + delta, lower, hi - minEff)
    return { lo: newLo, size: hi - newLo }
  }
  const newHi = clamp(hi + delta, lo + minEff, lo + SIZE_MAX)
  return { lo, size: newHi - lo }
}

// 8 つのハンドルで、大きさを変える。反対側の辺は動かない。角のハンドルは、2 辺を同時に動かす
// 最小の大きさ(options.minSize、既定は MIN_SECTION_SIZE)を下回る方向のドラッグは、そこで止まる(反転しない)
export function resizeRect(
  rect: Rect,
  handle: ResizeHandle,
  delta: Point,
  options: { minSize?: number } = {},
): Rect {
  const minSize = options.minSize ?? MIN_SECTION_SIZE
  let { x, y, width, height } = rect
  if (handle.includes('w') || handle.includes('e')) {
    const r = resizeAxis(x, width, delta.x, handle.includes('w'), minSize)
    x = r.lo
    width = r.size
  }
  if (handle.includes('n') || handle.includes('s')) {
    const r = resizeAxis(y, height, delta.y, handle.includes('n'), minSize)
    y = r.lo
    height = r.size
  }
  return { x, y, width, height }
}

// セクションを動かす。位置は座標の上限に収める(大きさは変えない)
// 上限で丸められたときの実際の差分は、rectDelta(動かす前, 動かした後)で求める
export function moveRect(rect: Rect, delta: Point): Rect {
  return { ...rect, x: clampCoord(rect.x + delta.x), y: clampCoord(rect.y + delta.y) }
}

// カードの自由な位置(positionX / positionY)を持つもの。両方 NULL は「まだ自由な位置を持たない=自動配置」
// (api の CHECK で、片方だけ NULL にはならない)
export type PositionedMember = { positionX: number | null; positionY: number | null }

// セクションを動かしたときの、所属メンバーのカードの位置(api の PATCH /section/:id と同じ規則)
// - 位置を持つメンバーだけを、同じ差分だけ動かす。位置が NULL のメンバーは、NULL のまま(自動配置のまま)
// - 動かした先が、1 人でも座標の上限(±1,000,000)を超えるなら、全体を動かさずに失敗を返す(api は 422 で何も変えない)
// - 差分が両方 0 なら、api は何も調べないので、ここも何も変えずに成功を返す
export function applyDeltaToMembers<T extends PositionedMember>(
  members: readonly T[],
  delta: Point,
): { ok: true; members: T[] } | { ok: false } {
  if (delta.x === 0 && delta.y === 0) return { ok: true, members: [...members] }
  const moved: T[] = []
  for (const m of members) {
    if (m.positionX === null || m.positionY === null) {
      moved.push(m)
      continue
    }
    const positionX = m.positionX + delta.x
    const positionY = m.positionY + delta.y
    if (Math.abs(positionX) > COORD_MAX || Math.abs(positionY) > COORD_MAX) return { ok: false }
    moved.push({ ...m, positionX, positionY })
  }
  return { ok: true, members: moved }
}
