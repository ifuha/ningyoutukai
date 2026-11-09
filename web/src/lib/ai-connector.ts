import { useCallback, useState } from 'react'
import type { Box } from '#/lib/tree-layout'

// ツリーの AI のカードの、置き場所と線の処理(plugin)。画面(`components/ai-card.tsx`)から切り離してある。
// - **線は、メンバーのカードと同じ**: `connectorPath`(`lib/tree-layout.ts`)と `TreeConnectors` で引く。ここは、その入力(持ち主のカードと AI のカードの矩形 `Box`)を作る
// - 座標は、**持ち主のカードの左上が原点**(線の SVG もその原点に置く)
// - 動かしている途中の位置(`useLiveOffsets`)を持ち、つかんでいる間も、線の端が付いていく

/** カードの大きさ(px)。線の端の位置(`Box`)を決めるため、固定する(`h-12` / `w-[200px]`) */
export const AI_CARD_WIDTH = 200
export const AI_CARD_HEIGHT = 48
/** 持ち主のカードの幅(`member-card.tsx` の `w-[240px]`) */
export const OWNER_WIDTH = 240
const ROW_GAP = 8
/** 初めの置き場所: 右 = 持ち主のカードの右の縁から離す距離と、上から下げる量 / 下 = 持ち主のカードの下の縁から離す距離と、左の余白 */
const RIGHT_GAP = 24
const RIGHT_TOP = 12
const BOTTOM_GAP = 16
const BOTTOM_LEFT = 16

export type AiSide = 'right' | 'bottom'
export type Offset = { x: number; y: number }
/** 線を引く対象が持つ、保存された位置(動かしていなければ null) */
export type AiLike = { tokenId: string; offsetX: number | null; offsetY: number | null }

/**
 * `index` 番目の AI のカードの、初めの置き場所(カードの左上)。
 * `ownerHeight` は持ち主のカードの高さ(測った値)。右は、持ち主の上から少し下げて並べる。下は、持ち主の下に並べる
 */
export function aiDefaultOrigin(side: AiSide, index: number, ownerHeight: number): { left: number; top: number } {
  const row = index * (AI_CARD_HEIGHT + ROW_GAP)
  return side === 'right' ? { left: OWNER_WIDTH + RIGHT_GAP, top: RIGHT_TOP + row } : { left: BOTTOM_LEFT, top: ownerHeight + BOTTOM_GAP + row }
}

/** AI のカードの矩形。`(dx, dy)` は動かしたずれ */
export function aiBox(side: AiSide, index: number, ownerHeight: number, dx: number, dy: number): Box {
  const o = aiDefaultOrigin(side, index, ownerHeight)
  return { left: o.left + dx, top: o.top + dy, width: AI_CARD_WIDTH, height: AI_CARD_HEIGHT }
}

/** 持ち主のカードの矩形(線の親) */
export function ownerBox(ownerHeight: number): Box {
  return { left: 0, top: 0, width: OWNER_WIDTH, height: ownerHeight }
}

/** 保存された位置(なければ 0)。つかんでいる間の位置(`live`)があれば、そちらを使う */
export function currentOffset(ai: AiLike, live: Readonly<Record<string, Offset>>): Offset {
  return live[ai.tokenId] ?? { x: ai.offsetX ?? 0, y: ai.offsetY ?? 0 }
}

/** `TreeConnectors` に渡す、線の行き先(AI ごとに 1 本) */
export function aiConnectorTargets(ais: readonly AiLike[], side: AiSide, ownerHeight: number, live: Readonly<Record<string, Offset>> = {}): { id: string; box: Box }[] {
  return ais.map((ai, i) => {
    const at = currentOffset(ai, live)
    return { id: ai.tokenId, box: aiBox(side, i, ownerHeight, at.x, at.y) }
  })
}

/** つかんでいる間の位置を持つ。各カードが `report` で伝え、線は `live` を見て引き直す(同じ位置なら、状態を変えない) */
export function useLiveOffsets() {
  const [live, setLive] = useState<Record<string, Offset>>({})
  const report = useCallback((id: string, at: Offset) => setLive((cur) => (cur[id]?.x === at.x && cur[id]?.y === at.y ? cur : { ...cur, [id]: at })), [])
  return { live, report }
}
