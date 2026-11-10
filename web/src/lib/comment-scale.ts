import { titleFactor } from '#/lib/section-label'

// コメント(ピン・開いたカード・置くときの入力欄)の、拡大縮小に合わせた大きさ。セクションの名前と同じ(係数は `titleFactor`)
// - 拡大・等倍(`scale ≥ 1`)は、係数 1: キャンバスの拡大に比例して大きくなる
// - 縮小(`scale < 1`)は、係数 `1 / scale`(上限 `LABEL_FACTOR_MAX`): キャンバスの単位で大きくして、画面上は、等倍と同じ大きさ(読める)を保つ
// 拡大の起点は、左上(置いた位置が動かない)

/** ピンの大きさ(px。`CommentPin` の `size-8`)。係数を掛ける前の、キャンバスの単位 */
export const COMMENT_PIN_PX = 32

/** コメントの要素に付ける style(係数が 1 のときは付けない)。左上を起点にする */
export function commentScaleStyle(scale: number): { transform: string; transformOrigin: string } | undefined {
  const factor = titleFactor(scale)
  return factor === 1 ? undefined : { transform: `scale(${factor})`, transformOrigin: 'top left' }
}

/**
 * 置いた位置(クリックした点)がピンの中心になるよう、ピンの左上を、左上へずらす量(キャンバスの単位)。
 * ピンは、キャンバスの単位で `COMMENT_PIN_PX × 係数` の大きさなので、その半分
 */
export const commentPlaceOffset = (scale: number): number => (COMMENT_PIN_PX / 2) * titleFactor(scale)
