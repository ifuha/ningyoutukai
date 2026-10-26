// ツリーのキャンバスの、配置の計算(画面や DOM に依存しない純粋関数)
//
// 座標の考え方:
// - 「自動配置」(位置を持たないカード。リーダーを上、メンバーを横に並べる、これまでの配置)の左上が、キャンバスの原点(0, 0)
// - セクションと、位置を持つカード(`positionX` / `positionY` が両方ある)は、その原点からの絶対座標に置く
// - 負の座標があるときは、全体を右下へずらして(offset)、中身の左上が (0, 0) 以上になるようにする

/** カードの幅(px)。`member-card.tsx` の `w-[240px]` と同じ */
export const CARD_WIDTH = 240
/**
 * カードの高さの目安(px)。実際の高さはタスクの数で変わる(見出し + タスク 3 件まで + フッター)ので、
 * 全体の大きさ(全体表示の倍率・移動範囲)を決めるときの、余裕を見た上限として使う。線の位置には使わない(測った値を使う)
 */
export const CARD_HEIGHT_ESTIMATE = 240
/** 矢印の三角の、幅と高さ(px)。`product-tree.tsx` の自動配置の矢印(幅 10、高さ 7)と同じ */
export const ARROW_WIDTH = 10
export const ARROW_HEIGHT = 7
/** リーダーの真下に、まっすぐ下げてから横へ曲げるまでの最小の距離(px) */
export const CONNECTOR_DROP = 24

export type Positioned = {
  positionX: number | null
  positionY: number | null
}

/** 位置を持つ(`positionX` と `positionY` が両方、有限の数値)。片方だけの値は、持たない扱い(DB は両方 NULL か両方値を保証する) */
export function hasPosition(m: Positioned): boolean {
  return Number.isFinite(m.positionX) && Number.isFinite(m.positionY)
}

export type Placed<T> = { member: T; x: number; y: number }

/**
 * 位置を持たないもの(`flow`: 自動配置のまま。順番は保つ)と、持つもの(`placed`: 絶対座標に置く)に分ける
 * 一部だけ位置を持っていても、それぞれの配置で描く
 */
export function splitByPosition<T extends Positioned>(
  members: T[],
): { flow: T[]; placed: Placed<T>[] } {
  const flow: T[] = []
  const placed: Placed<T>[] = []
  for (const member of members) {
    if (hasPosition(member)) {
      placed.push({
        member,
        x: member.positionX as number,
        y: member.positionY as number,
      })
    } else {
      flow.push(member)
    }
  }
  return { flow, placed }
}

export type Rect = { x: number; y: number; width: number; height: number }

export type CanvasBounds = {
  /** 負の座標があるとき、全体を右へずらす量(なければ 0) */
  offsetX: number
  /** 負の座標があるとき、全体を下へずらす量(なければ 0) */
  offsetY: number
  /** 中身の最小の幅・高さ(ずらしたあと。セクションと位置を持つカードが収まる大きさ。なければ 0) */
  minWidth: number
  minHeight: number
}

/**
 * セクションと、位置を持つカードが収まる範囲から、ずらす量と、中身の最小の大きさを求める
 * 自動配置の左上(原点)は、いつも範囲に含める。範囲は、ずらしたあと、左上が (0, 0) から始まる
 * 何もなければ、すべて 0(これまでの自動配置の大きさのまま)
 */
export function canvasBounds({
  sections,
  cards,
}: {
  sections: Rect[]
  cards: { x: number; y: number }[]
}): CanvasBounds {
  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0
  const extend = (x: number, y: number, w: number, h: number) => {
    if (![x, y, w, h].every(Number.isFinite)) return
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }
  for (const s of sections) extend(s.x, s.y, s.width, s.height)
  for (const c of cards) extend(c.x, c.y, CARD_WIDTH, CARD_HEIGHT_ESTIMATE)
  return {
    // `-minX` だと、0 のとき -0 になるので、0 から引く
    offsetX: 0 - minX,
    offsetY: 0 - minY,
    minWidth: maxX - minX,
    minHeight: maxY - minY,
  }
}

/** 中身(`contentRef`)の左上を原点とした、要素の矩形(測った値) */
export type Box = { left: number; top: number; width: number; height: number }

/**
 * 親子の線を、SVG で描くか(`svg`)、これまでの CSS の線で描くか(`css`)
 * 自動配置のリーダーと、自動配置のメンバーの間だけ、これまでの CSS の線(横一列に並べた線)。
 * どちらかが位置を持つときは、実際の位置に合わせて SVG で描く
 */
export function connectorKind(
  leaderPlaced: boolean,
  memberPlaced: boolean,
): 'css' | 'svg' {
  return leaderPlaced || memberPlaced ? 'svg' : 'css'
}

/**
 * 親(リーダー)の下の中央から、子の上の中央までの、直角に曲がる線(`d`)と、子の上の辺に置く三角(`arrow`: points)
 * 子が親より下にあれば、2 点の中間の高さで横へ曲がる。同じ高さか上にあるときは、親の真下へ最小の距離だけ下げてから曲がる
 * 矢印は、これまでと同じく、子から親へ向く(上向きの三角)。線は、三角の頂点で終わる
 */
export function connectorPath(
  parent: Box,
  child: Pick<Box, 'left' | 'top' | 'width'>,
): { d: string; arrow: string } {
  const px = parent.left + parent.width / 2
  const py = parent.top + parent.height
  const cx = child.left + child.width / 2
  const cy = child.top
  const midY = cy > py ? py + (cy - py) / 2 : py + CONNECTOR_DROP
  const tipY = cy - ARROW_HEIGHT
  const half = ARROW_WIDTH / 2
  return {
    d: `M ${px} ${py} V ${midY} H ${cx} V ${tipY}`,
    arrow: `${cx - half},${cy} ${cx + half},${cy} ${cx},${tipY}`,
  }
}
