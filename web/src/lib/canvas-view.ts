import { createContext, useContext } from 'react'
import type { Point, Rect } from '#/lib/section-edit-geometry'
import type { CanvasView } from '#/lib/section-interaction-types'
import type { Box } from '#/lib/tree-layout'

// キャンバスの見え方(拡大率と、画面の座標 → キャンバス座標の変換)。
// ツリーの「変換された層」(パンとズームがかかる層)の中の部品が、props を通さずに使える(`useCanvasView`)。
// 部品に props で渡す場合は、`ProductTree` が同じ値(`scale` と `toCanvas`)を渡す。
//
// キャンバス座標: セクションの `x` / `y` とカードの `positionX` / `positionY` と同じ座標系
//   (自動配置の左上が原点。負の座標があるとき、画面に描くときは `offset` だけずらす)。
//   拡大率とパンは含まない。

export const CanvasViewContext = createContext<CanvasView | null>(null)

/** 変換された層の中で使う。`CanvasViewContext` の外では、例外を投げる(置き場所の間違いに気づくため) */
export function useCanvasView(): CanvasView {
  const view = useContext(CanvasViewContext)
  if (!view) throw new Error('CanvasViewContext の外では使えません')
  return view
}

/**
 * 画面の座標(`clientX` / `clientY`)をキャンバス座標にする。
 * @param contentOrigin 変換された層(パンとズームがかかった中身)の左上の、画面上の位置(`getBoundingClientRect()` の left / top)。
 *   パンは、この位置に含まれる。
 * @param scale 拡大率(1 = 100%)。0 以下は、1 として扱う
 * @param offset 負の座標があるとき、中身を描くためにずらしている量(`canvasBounds` の offsetX / offsetY)
 */
export function clientToCanvas(
  client: Point,
  contentOrigin: Point,
  scale: number,
  offset: Point,
): Point {
  const s = scale > 0 ? scale : 1
  return {
    x: (client.x - contentOrigin.x) / s - offset.x,
    y: (client.y - contentOrigin.y) / s - offset.y,
  }
}

/** `clientToCanvas` の逆。キャンバス座標を、画面の座標にする */
export function canvasToClient(
  canvas: Point,
  contentOrigin: Point,
  scale: number,
  offset: Point,
): Point {
  const s = scale > 0 ? scale : 1
  return {
    x: (canvas.x + offset.x) * s + contentOrigin.x,
    y: (canvas.y + offset.y) * s + contentOrigin.y,
  }
}

/**
 * 中身の左上を原点に測った矩形(`boxWithin`。倍率をかける前の値)を、キャンバス座標の矩形にする。
 * 位置は `offset` だけ戻す(中身を描くときにずらしているため)。大きさは、そのまま
 */
export function boxToCanvasRect(box: Box, offset: Point): Rect {
  return {
    x: box.left - offset.x,
    y: box.top - offset.y,
    width: box.width,
    height: box.height,
  }
}
