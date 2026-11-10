import { Bot, Trash2 } from 'lucide-react'
import { useContext, useEffect, useState } from 'react'
import { IconButton } from '#/components/icon-button'
import { formatDateTime } from '#/components/member-card'
import { TreeConnectors } from '#/components/tree-connectors'
import { aiConnectorTargets, aiDefaultOrigin, ownerBox, useLiveOffsets, type AiSide } from '#/lib/ai-connector'
import { CanvasViewContext } from '#/lib/canvas-view'
import type { TreeAi } from '#/lib/tree'
import { useOffsetDrag, type Offset } from '#/lib/use-offset-drag'

// メンバーの AI のカード(ツリー)。AI はメンバーではなく、持ち主が使う道具。仕様は docs/v4.0/overview.md
// - 名前は全員に見える。確認待ちの下書きの数は、持ち主本人にだけ出る(他の人には `pendingCount` が null)
// - `onOpen` を渡すと(持ち主で、確認待ちがあるとき)押せて、確認待ちのタスクの詳細を開く
// - `onRevoke` を渡すと(自分のトークンのカードだけ)、カードに「取り消す」が出る(2 回押すと取り消す。取り消すとすぐ使えなくなり、カードも消える)
// - **リーダーだけ**、カードをつかんで動かせる(メンバーのカードと同じ)。位置は、初めの置き場所からのずれ(px)。持ち主のカードに付いて動く。動かすロジックは `lib/use-offset-drag.ts`
// - リーダーの AI はリーダーのカードの右に、メンバーの AI はそのメンバーのカードの下に置く(`MemberCard` が置く)
// - **線は、メンバーのカードと同じ**(`connectorPath`: 持ち主のカードの下の中央から、AI のカードの上の中央まで、直角に曲がる破線 + 上向きの三角)。動かすと、端が付いていく。置き場所と線の入力の計算は `lib/ai-connector.ts`

export function aiCardSummary(ai: Pick<TreeAi, 'pendingCount' | 'lastDraftAt'>): string {
  if (ai.pendingCount !== null && ai.pendingCount > 0) return `確認待ち ${ai.pendingCount} 件`
  return ai.lastDraftAt ? `下書き ${formatDateTime(ai.lastDraftAt)}` : '下書きなし'
}

export function AiCard({ ai, onOpen, onRevoke }: { ai: TreeAi; onOpen?: (ai: TreeAi) => void; onRevoke?: (ai: TreeAi) => Promise<void> | void }) {
  const waiting = ai.pendingCount !== null && ai.pendingCount > 0
  const body = (
    <>
      <Bot size={16} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium" title={ai.name}>
          {ai.name}
        </span>
        <span className={`block truncate text-s ${waiting ? '' : 'opacity-70'}`}>{aiCardSummary(ai)}</span>
      </span>
    </>
  )
  const className = 'flex h-12 w-[200px] items-center gap-2 rounded-sm shadow-box bg-panel px-2 text-left'
  const main = onOpen ? (
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
  if (!onRevoke) return main
  return (
    <div className="relative">
      {main}
      <RevokeButton ai={ai} onRevoke={onRevoke} />
    </div>
  )
}

/** 自分のトークンの「取り消す」。2 回押すと取り消す(1 回目は、赤くなって確認)。カードを動かす操作と、取り違えないよう、ポインタは渡さない */
function RevokeButton({ ai, onRevoke }: { ai: TreeAi; onRevoke: (ai: TreeAi) => Promise<void> | void }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <span className="absolute top-0.5 right-0.5" onPointerDown={(e) => e.stopPropagation()}>
      <IconButton
        icon={Trash2}
        label={confirm ? 'もう一度押すと、この AI のトークンを取り消します' : 'この AI のトークンを取り消す'}
        size="sm"
        side="bottom"
        variant={confirm ? 'danger-solid' : 'plain'}
        disabled={busy}
        onClick={() => {
          if (!confirm) return setConfirm(true)
          setBusy(true)
          void Promise.resolve(onRevoke(ai)).finally(() => {
            setBusy(false)
            setConfirm(false)
          })
        }}
      />
    </span>
  )
}

type MoveHandler = (ai: TreeAi, offset: { offsetX: number; offsetY: number }) => Promise<void> | void

/** 動かせるカード 1 枚。位置は、持ち主のカードの左上が原点(初めの置き場所 + 動かしたずれ)。線は親(`AiCards`)が引く */
function MovableAiCard({ ai, side, index, ownerHeight, at, bind, onOpen, onMove, onRevoke }: { ai: TreeAi; side: AiSide; index: number; ownerHeight: number; at: { x: number; y: number }; bind: object; onOpen?: (ai: TreeAi) => void; onMove?: MoveHandler; onRevoke?: (ai: TreeAi) => Promise<void> | void }) {
  const o = aiDefaultOrigin(side, index, ownerHeight)
  return (
    <div
      data-ai-slot=""
      style={{ left: o.left, top: o.top, translate: `${at.x}px ${at.y}px` }}
      className={`pointer-events-auto absolute ${onMove ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
      {...bind}
    >
      <AiCard ai={ai} onOpen={onOpen} onRevoke={onRevoke} />
    </div>
  )
}

/** 1 枚分: 動かすロジック(`useOffsetDrag`)をカードごとに持つ。線のために、位置を親へ伝える */
function AiSlot({ ai, side, index, ownerHeight, onOpen, onMove, onRevoke, report }: { ai: TreeAi; side: AiSide; index: number; ownerHeight: number; onOpen?: (ai: TreeAi) => void; onMove?: MoveHandler; onRevoke?: (ai: TreeAi) => Promise<void> | void; report: (id: string, at: { x: number; y: number }) => void }) {
  // 拡大率(キャンバスの外、たとえばテストでは 1)
  const scale = useContext(CanvasViewContext)?.scale ?? 1
  const { at, bind } = useOffsetDrag({
    saved: { x: ai.offsetX ?? 0, y: ai.offsetY ?? 0 },
    scale,
    enabled: !!onMove,
    onMove: onMove && ((o: Offset) => onMove(ai, { offsetX: o.x, offsetY: o.y })),
  })
  useEffect(() => report(ai.tokenId, at), [ai.tokenId, at.x, at.y]) // eslint-disable-line react-hooks/exhaustive-deps
  return <MovableAiCard ai={ai} side={side} index={index} ownerHeight={ownerHeight} at={at} bind={bind} onOpen={onOpen} onMove={onMove} onRevoke={ai.mine ? onRevoke : undefined} />
}

/**
 * 持ち主のカードにぶら下げる、AI のカードと線。リーダーは右、メンバーは下。`onMove` を渡すと(リーダーにだけ)動かせる。
 * 持ち主のカード(`relative`)の中に置く。`ownerHeight` = 持ち主のカードの高さ
 */
export function AiCards({ ais, side, ownerHeight = 0, onOpen, onMove, onRevoke }: { ais: TreeAi[]; side: AiSide; ownerHeight?: number; onOpen?: (ai: TreeAi) => void; onMove?: MoveHandler; onRevoke?: (ai: TreeAi) => Promise<void> | void }) {
  // つかんでいる間の位置(線の端が付いていくため)
  const { live, report } = useLiveOffsets()
  if (ais.length === 0) return null
  const open = (ai: TreeAi) => (ai.pendingTaskIds && ai.pendingTaskIds.length > 0 ? onOpen : undefined)
  return (
    <div className="pointer-events-none absolute inset-0">
      <TreeConnectors parent={ownerBox(ownerHeight)} targets={aiConnectorTargets(ais, side, ownerHeight, live)} />
      {ais.map((ai, i) => (
        <AiSlot
          key={ai.tokenId}
          ai={ai}
          side={side}
          index={i}
          ownerHeight={ownerHeight}
          onOpen={open(ai)}
          onMove={onMove}
          onRevoke={onRevoke}
          report={report}
        />
      ))}
    </div>
  )
}
