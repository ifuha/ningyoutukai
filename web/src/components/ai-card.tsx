import { Bot } from 'lucide-react'
import { useContext, useEffect, useState } from 'react'
import { formatDateTime } from '#/components/member-card'
import { TreeConnectors } from '#/components/tree-connectors'
import { CanvasViewContext } from '#/lib/canvas-view'
import type { Box } from '#/lib/tree-layout'
import type { TreeAi } from '#/lib/tree'
import { useOffsetDrag, type Offset } from '#/lib/use-offset-drag'

// メンバーの AI のカード(ツリー)。AI はメンバーではなく、持ち主が使う道具。仕様は docs/v4.0/overview.md
// - 名前は全員に見える。確認待ちの下書きの数は、持ち主本人にだけ出る(他の人には `pendingCount` が null)
// - `onOpen` を渡すと(持ち主で、確認待ちがあるとき)押せて、確認待ちのタスクの詳細を開く
// - **リーダーだけ**、カードをつかんで動かせる(メンバーのカードと同じ)。位置は、初めの置き場所からのずれ(px)。持ち主のカードに付いて動く。動かすロジックは `lib/use-offset-drag.ts`
// - リーダーの AI はリーダーのカードの右に、メンバーの AI はそのメンバーのカードの下に置く(`MemberCard` が置く)
// - **線は、メンバーのカードと同じ**(`connectorPath`: 持ち主のカードの下の中央から、AI のカードの上の中央まで、直角に曲がる破線 + 上向きの三角)。動かすと、端が付いていく

/** カードの大きさ(px)。線の端の位置(`Box`)を決めるため、固定する(`h-12` / `w-[200px]`) */
export const AI_CARD_WIDTH = 200
export const AI_CARD_HEIGHT = 48
/** 持ち主のカードの幅(`member-card.tsx` の `w-[240px]`) */
const OWNER_WIDTH = 240
const ROW_GAP = 8
/** 初めの置き場所: 右 = 持ち主のカードの右の縁から離す距離 / 下 = 持ち主のカードの下の縁から離す距離と、左の余白 */
const RIGHT_GAP = 24
const BOTTOM_GAP = 16
const BOTTOM_LEFT = 16

export type AiSide = 'right' | 'bottom'

/**
 * `index` 番目の AI のカードの、初めの置き場所(持ち主のカードの左上を原点にした、カードの左上)。
 * `ownerHeight` は持ち主のカードの高さ(測った値)。右は、持ち主の上から少し下げて並べる。下は、持ち主の下に並べる
 */
export function aiDefaultOrigin(side: AiSide, index: number, ownerHeight: number): { left: number; top: number } {
  const row = index * (AI_CARD_HEIGHT + ROW_GAP)
  return side === 'right' ? { left: OWNER_WIDTH + RIGHT_GAP, top: 12 + row } : { left: BOTTOM_LEFT, top: ownerHeight + BOTTOM_GAP + row }
}

/** 線に渡す、AI のカードの矩形(持ち主のカードの左上が原点)。`(dx, dy)` は動かしたずれ */
export function aiBox(side: AiSide, index: number, ownerHeight: number, dx: number, dy: number): Box {
  const o = aiDefaultOrigin(side, index, ownerHeight)
  return { left: o.left + dx, top: o.top + dy, width: AI_CARD_WIDTH, height: AI_CARD_HEIGHT }
}

export function aiCardSummary(ai: Pick<TreeAi, 'pendingCount' | 'lastDraftAt'>): string {
  if (ai.pendingCount !== null && ai.pendingCount > 0) return `確認待ち ${ai.pendingCount} 件`
  return ai.lastDraftAt ? `下書き ${formatDateTime(ai.lastDraftAt)}` : '下書きなし'
}

export function AiCard({ ai, onOpen }: { ai: TreeAi; onOpen?: (ai: TreeAi) => void }) {
  const waiting = ai.pendingCount !== null && ai.pendingCount > 0
  const body = (
    <>
      <Bot size={16} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold" title={ai.name}>
          {ai.name}
        </span>
        <span className={`block truncate text-s ${waiting ? '' : 'opacity-70'}`}>{aiCardSummary(ai)}</span>
      </span>
    </>
  )
  const className = 'flex h-12 w-[200px] items-center gap-2 shadow-box bg-panel px-2 text-left'
  return onOpen ? (
    <button
      type="button"
      data-ai-card={ai.tokenId}
      onClick={() => onOpen(ai)}
      className={`${className} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`}
    >
      {body}
    </button>
  ) : (
    <article data-ai-card={ai.tokenId} aria-label={`AI ${ai.name}`} className={className}>
      {body}
    </article>
  )
}

type MoveHandler = (ai: TreeAi, offset: { offsetX: number; offsetY: number }) => Promise<void> | void

/** 動かせるカード 1 枚。位置は、持ち主のカードの左上が原点(初めの置き場所 + 動かしたずれ)。線は親(`AiCards`)が引く */
function MovableAiCard({ ai, side, index, ownerHeight, at, bind, onOpen, onMove }: { ai: TreeAi; side: AiSide; index: number; ownerHeight: number; at: { x: number; y: number }; bind: object; onOpen?: (ai: TreeAi) => void; onMove?: MoveHandler }) {
  const o = aiDefaultOrigin(side, index, ownerHeight)
  return (
    <div
      data-ai-slot=""
      style={{ left: o.left, top: o.top, translate: `${at.x}px ${at.y}px` }}
      className={`pointer-events-auto absolute ${onMove ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
      {...bind}
    >
      <AiCard ai={ai} onOpen={onOpen} />
    </div>
  )
}

/** 1 枚分: 動かすロジック(`useOffsetDrag`)をカードごとに持つ。線のために、位置を親へ伝える */
function AiSlot({ ai, side, index, ownerHeight, onOpen, onMove, report }: { ai: TreeAi; side: AiSide; index: number; ownerHeight: number; onOpen?: (ai: TreeAi) => void; onMove?: MoveHandler; report: (id: string, at: { x: number; y: number }) => void }) {
  // 拡大率(キャンバスの外、たとえばテストでは 1)
  const scale = useContext(CanvasViewContext)?.scale ?? 1
  const { at, bind } = useOffsetDrag({
    saved: { x: ai.offsetX ?? 0, y: ai.offsetY ?? 0 },
    scale,
    enabled: !!onMove,
    onMove: onMove && ((o: Offset) => onMove(ai, { offsetX: o.x, offsetY: o.y })),
  })
  useEffect(() => report(ai.tokenId, at), [ai.tokenId, at.x, at.y]) // eslint-disable-line react-hooks/exhaustive-deps
  return <MovableAiCard ai={ai} side={side} index={index} ownerHeight={ownerHeight} at={at} bind={bind} onOpen={onOpen} onMove={onMove} />
}

/**
 * 持ち主のカードにぶら下げる、AI のカードと線。リーダーは右、メンバーは下。`onMove` を渡すと(リーダーにだけ)動かせる。
 * 持ち主のカード(`relative`)の中に置く。`ownerHeight` = 持ち主のカードの高さ
 */
export function AiCards({ ais, side, ownerHeight = 0, onOpen, onMove }: { ais: TreeAi[]; side: AiSide; ownerHeight?: number; onOpen?: (ai: TreeAi) => void; onMove?: MoveHandler }) {
  // 動かしている途中の位置(線が付いていくため)。保存された位置と、つかんでいる間の位置
  const [live, setLive] = useState<Record<string, { x: number; y: number }>>({})
  if (ais.length === 0) return null
  const open = (ai: TreeAi) => (ai.pendingTaskIds && ai.pendingTaskIds.length > 0 ? onOpen : undefined)
  const parent: Box = { left: 0, top: 0, width: OWNER_WIDTH, height: ownerHeight }
  return (
    <div className="pointer-events-none absolute inset-0">
      <TreeConnectors
        parent={parent}
        targets={ais.map((ai, i) => {
          const at = live[ai.tokenId] ?? { x: ai.offsetX ?? 0, y: ai.offsetY ?? 0 }
          return { id: ai.tokenId, box: aiBox(side, i, ownerHeight, at.x, at.y) }
        })}
      />
      {ais.map((ai, i) => (
        <AiSlot
          key={ai.tokenId}
          ai={ai}
          side={side}
          index={i}
          ownerHeight={ownerHeight}
          onOpen={open(ai)}
          onMove={onMove}
          report={(id, at) => setLive((cur) => (cur[id]?.x === at.x && cur[id]?.y === at.y ? cur : { ...cur, [id]: at }))}
        />
      ))}
    </div>
  )
}
