import type { View } from '#/lib/pan-zoom'

// キャンバスの「ずらし量」の変化で、見ている画面が動かないようにする計算(純粋な関数)
//
// 中身(変換された層)の左上は、画面上で `view`(平行移動 + 倍率)の位置にある。
// 要素は、キャンバス座標 c に、ずらし量(負の座標を表示するために、中身の最小座標から決める)を足した位置に置く。
//   画面上の位置 = view の平行移動 + (c + ずらし量) × 倍率
// セクションやカードを左・上へ動かして、中身の最小座標が変わると、ずらし量が変わり、
// 何もしなければ、すべての要素が画面上で「ずらし量の変化 × 倍率」だけ動く(勝手に画面が動く)。
// それを、パンを逆向きに同じだけ動かして打ち消す。

export type Offset = { x: number; y: number }
export type CanvasPoint = { x: number; y: number }

/** キャンバス座標 `c` の、画面上の位置(領域の左上が原点) */
export function screenPositionOf(view: View, offset: Offset, c: CanvasPoint): CanvasPoint {
  return {
    x: view.x + (c.x + offset.x) * view.scale,
    y: view.y + (c.y + offset.y) * view.scale,
  }
}

/**
 * ずらし量が `prev` から `next` に変わったとき、どのキャンバス座標も、画面上の位置が変わらない見え方を返す。
 * 変わらなければ、同じ `view` をそのまま返す(補正は 0)
 */
export function compensateOffsetChange(view: View, prev: Offset, next: Offset): View {
  const dx = next.x - prev.x
  const dy = next.y - prev.y
  if (dx === 0 && dy === 0) return view
  return { scale: view.scale, x: view.x - dx * view.scale, y: view.y - dy * view.scale }
}
