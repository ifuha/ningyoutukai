// ツリーのキャンバスの、状態と計算(画面や DOM に依存しない純粋関数)
// 状態は View = { x, y, scale }。中身(自然な大きさ w × h)に `translate(x, y) scale(scale)`(原点は左上)をかけて表示する

export type View = { x: number; y: number; scale: number }
// cw / ch: 領域の大きさ、w / h: 中身の自然な大きさ(倍率をかける前)
// top / bottom: 領域の上下に重ねている見出し・操作バーの高さ(全体表示で、その下に潜らないよう避ける。省略は 0)
export type Size = {
  cw: number
  ch: number
  w: number
  h: number
  top?: number
  bottom?: number
}

// 全体表示のときの、領域の端からの余白(px)
export const FIT_PADDING = 16
// 全体表示の倍率(fit)に対する、相対倍率の範囲
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
// 中身の一辺が、領域の内側に最低これだけ残るよう、動かせる範囲を制限する(px)
export const MIN_VISIBLE = 80

// 領域に全体が収まる倍率(拡大はしない = 最大 1)と、その中央寄せの位置
export function fitView({ cw, ch, w, h, top = 0, bottom = 0 }: Size): View {
  const availH = ch - top - bottom - FIT_PADDING * 2
  const scale = Math.max(
    0.01,
    Math.min(1, (cw - FIT_PADDING * 2) / w, availH / h),
  )
  return { x: (cw - w * scale) / 2, y: top + FIT_PADDING, scale }
}

export function clampScale(scale: number, fitScale: number): number {
  return Math.min(MAX_ZOOM * fitScale, Math.max(MIN_ZOOM * fitScale, scale))
}

// 中身が完全に領域の外へ消えないよう、位置を制限する
export function clampPan(view: View, { cw, ch, w, h }: Size): View {
  const sw = w * view.scale
  const sh = h * view.scale
  const mx = Math.min(MIN_VISIBLE, sw, cw)
  const my = Math.min(MIN_VISIBLE, sh, ch)
  return {
    scale: view.scale,
    x: Math.min(cw - mx, Math.max(mx - sw, view.x)),
    y: Math.min(ch - my, Math.max(my - sh, view.y)),
  }
}

// 領域内の点 p を固定したまま、倍率を変える(倍率の範囲と、移動範囲も守る)
export function zoomAt(
  view: View,
  p: { x: number; y: number },
  nextScale: number,
  size: Size,
  fitScale: number,
): View {
  const s = clampScale(nextScale, fitScale)
  const k = s / view.scale
  return clampPan(
    { scale: s, x: p.x - (p.x - view.x) * k, y: p.y - (p.y - view.y) * k },
    size,
  )
}

// フォーカスした要素を見える位置まで動かす
export const REVEAL_MARGIN = 16

// 要素の矩形(領域の左上を原点とした座標)を、領域の内側(余白 margin。上下は、重ねている見出しなどの inset の分も避ける)に収めるための移動量 { dx, dy }
// すでに収まっていれば 0。領域より大きい要素は、左上の端を余白の位置に合わせる
export function revealDelta(
  rect: { left: number; top: number; right: number; bottom: number },
  area: { width: number; height: number },
  margin = REVEAL_MARGIN,
  inset: { top?: number; bottom?: number } = {},
): { dx: number; dy: number } {
  // lo / hi: 見えてよい範囲(重ねている見出しなどの下は含めない)
  const axis = (start: number, end: number, lo: number, hi: number) => {
    if (end - start > hi - lo || start < lo) return lo - start
    if (end > hi) return hi - end
    return 0
  }
  return {
    dx: axis(rect.left, rect.right, margin, area.width - margin),
    dy: axis(
      rect.top,
      rect.bottom,
      margin + (inset.top ?? 0),
      area.height - margin - (inset.bottom ?? 0),
    ),
  }
}

// ボタン・キーでズームするときの中心: 上下に重ねている見出し・操作バーを除いた、見える領域の中央
export function visibleCenter({ cw, ch, top = 0, bottom = 0 }: Size): {
  x: number
  y: number
} {
  return { x: cw / 2, y: top + (ch - top - bottom) / 2 }
}
