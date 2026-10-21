// ツリーのキャンバスの、状態と計算(画面や DOM に依存しない純粋関数)
// 状態は View = { x, y, scale }。中身(自然な大きさ w × h)に `translate(x, y) scale(scale)`(原点は左上)をかけて表示する

export type View = { x: number; y: number; scale: number }
// cw / ch: 領域の大きさ、w / h: 中身の自然な大きさ(倍率をかける前)
export type Size = { cw: number; ch: number; w: number; h: number }

// 全体表示のときの、領域の端からの余白(px)
export const FIT_PADDING = 16
// 全体表示の倍率(fit)に対する、相対倍率の範囲
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
// 中身の一辺が、領域の内側に最低これだけ残るよう、動かせる範囲を制限する(px)
export const MIN_VISIBLE = 80

// 領域に全体が収まる倍率(拡大はしない = 最大 1)と、その中央寄せの位置
export function fitView({ cw, ch, w, h }: Size): View {
  const scale = Math.max(
    0.01,
    Math.min(1, (cw - FIT_PADDING * 2) / w, (ch - FIT_PADDING * 2) / h),
  )
  return { x: (cw - w * scale) / 2, y: FIT_PADDING, scale }
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
