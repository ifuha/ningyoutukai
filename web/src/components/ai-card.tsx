import { Bot } from 'lucide-react'
import { useContext } from 'react'
import { formatDateTime } from '#/components/member-card'
import { CanvasViewContext } from '#/lib/canvas-view'
import type { TreeAi } from '#/lib/tree'
import { useOffsetDrag, type Offset } from '#/lib/use-offset-drag'

// メンバーの AI のカード(ツリー)。AI はメンバーではなく、持ち主が使う道具。仕様は docs/v4.0/overview.md
// - 名前は全員に見える。確認待ちの下書きの数は、持ち主本人にだけ出る(他の人には `pendingCount` が null)
// - `onOpen` を渡すと(持ち主で、確認待ちがあるとき)押せて、確認待ちのタスクの詳細を開く
// - **リーダーだけ**、カードをつかんで動かせる(メンバーのカードと同じ)。位置は、初めの置き場所からのずれ(px)。持ち主のカードに付いて動く。動かすロジックは `lib/use-offset-drag.ts`
// - リーダーの AI はリーダーのカードの右に、メンバーの AI はそのメンバーのカードの下に、点線でつなぐ(`MemberCard` が置く)。**点線は、持ち主のカードからカードまで引き直す**(動かしても、つながったまま)

/** カードの高さ(px)。点線の端の位置を決めるため、固定する(`h-12`) */
export const AI_CARD_HEIGHT = 48
const ROW_GAP = 8
/** 右に置くとき: 持ち主のカードとの間の点線の長さ */
const STUB = 24
/** 下に置くとき: 左の余白 */
const INDENT = 16

export type AiSide = 'right' | 'bottom'

/**
 * 持ち主のカードからカードまでの点線の座標(`points` 用)。原点は、そのカードの行の左上。`(dx, dy)` は動かしたずれ
 * - 右: 持ち主のカードの右の縁(0, 高さの半分)から、カードの左の中央まで
 * - 下: 持ち主のカードの下の縁から、まっすぐ下げて、カードの左の中央まで(`index` 番目のカードの分だけ上から)
 */
export function aiConnectorPoints(side: AiSide, index: number, dx: number, dy: number): string {
  const mid = AI_CARD_HEIGHT / 2
  if (side === 'right') return `0,${mid} ${STUB + dx},${mid + dy}`
  const top = -(INDENT + index * (AI_CARD_HEIGHT + ROW_GAP))
  return `0,${top} 0,${mid} ${INDENT + dx},${mid + dy}`
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

/** 動かせるカード 1 枚と、持ち主のカードからの点線 */
function MovableAiCard({ ai, side, index, onOpen, onMove }: { ai: TreeAi; side: AiSide; index: number; onOpen?: (ai: TreeAi) => void; onMove?: MoveHandler }) {
  // 拡大率(キャンバスの外、たとえばテストでは 1)
  const scale = useContext(CanvasViewContext)?.scale ?? 1
  const { at, bind } = useOffsetDrag({
    saved: { x: ai.offsetX ?? 0, y: ai.offsetY ?? 0 },
    scale,
    enabled: !!onMove,
    onMove: onMove && ((o: Offset) => onMove(ai, { offsetX: o.x, offsetY: o.y })),
  })

  return (
    <div className={`relative ${side === 'right' ? 'flex items-center' : 'pl-4'}`} style={{ height: AI_CARD_HEIGHT }}>
      {/* 点線: 動かしても、持ち主のカードから、つながったまま */}
      <svg aria-hidden="true" className="pointer-events-none absolute top-0 left-0 overflow-visible text-ink/50" width={side === 'right' ? STUB : INDENT} height={AI_CARD_HEIGHT}>
        <polyline points={aiConnectorPoints(side, index, at.x, at.y)} fill="none" stroke="currentColor" strokeWidth={1} strokeDasharray="4 3" />
      </svg>
      {side === 'right' && <span aria-hidden="true" className="w-6 shrink-0" />}
      <div data-ai-slot="" style={{ translate: `${at.x}px ${at.y}px` }} className={onMove ? 'touch-none cursor-grab active:cursor-grabbing' : undefined} {...bind}>
        <AiCard ai={ai} onOpen={onOpen} />
      </div>
    </div>
  )
}

/** 持ち主のカードにぶら下げる、AI のカードの並び。リーダーは右、メンバーは下。`onMove` を渡すと(リーダーにだけ)動かせる */
export function AiCards({ ais, side, onOpen, onMove }: { ais: TreeAi[]; side: AiSide; onOpen?: (ai: TreeAi) => void; onMove?: MoveHandler }) {
  if (ais.length === 0) return null
  const open = (ai: TreeAi) => (ai.pendingTaskIds && ai.pendingTaskIds.length > 0 ? onOpen : undefined)
  return (
    <div className={side === 'right' ? 'absolute top-3 left-full flex items-start' : 'absolute top-full left-4 flex flex-col'}>
      <ul className={`flex flex-col ${side === 'right' ? '' : 'pt-4'}`} style={{ gap: ROW_GAP }}>
        {ais.map((ai, i) => (
          <li key={ai.tokenId}>
            <MovableAiCard ai={ai} side={side} index={i} onOpen={open(ai)} onMove={onMove} />
          </li>
        ))}
      </ul>
    </div>
  )
}
