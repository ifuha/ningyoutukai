import { Bot } from 'lucide-react'
import { formatDateTime } from '#/components/member-card'
import type { TreeAi } from '#/lib/tree'

// メンバーの AI のカード(ツリー)。AI はメンバーではなく、持ち主が使う道具。仕様は docs/v4.0/overview.md
// - 名前は全員に見える。確認待ちの下書きの数は、持ち主本人にだけ出る(他の人には `pendingCount` が null)
// - `onOpen` を渡すと(持ち主で、確認待ちがあるとき)押せて、確認待ちのタスクの詳細を開く
// - リーダーの AI はリーダーのカードの右に、メンバーの AI はそのメンバーのカードの下に、点線でつないで出す(`MemberCard` が置く)

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
  const className = 'flex w-[200px] items-center gap-2 shadow-box bg-panel p-2 text-left'
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

/** 持ち主のカードにぶら下げる、AI のカードの並び。リーダーは右、メンバーは下 */
export function AiCards({ ais, side, onOpen }: { ais: TreeAi[]; side: 'right' | 'bottom'; onOpen?: (ai: TreeAi) => void }) {
  if (ais.length === 0) return null
  const open = (ai: TreeAi) => (ai.pendingTaskIds && ai.pendingTaskIds.length > 0 ? onOpen : undefined)
  return (
    <div
      className={
        side === 'right'
          ? 'absolute top-3 left-full flex items-start pl-0'
          : 'absolute top-full left-4 flex flex-col'
      }
    >
      <ul className={side === 'right' ? 'flex flex-col gap-2' : 'flex flex-col gap-2 border-l border-dashed border-ink/50 pt-4 pl-4'}>
        {ais.map((ai) => (
          <li key={ai.tokenId} className={side === 'right' ? 'flex items-center' : ''}>
            {side === 'right' && <span aria-hidden="true" className="w-6 border-t border-dashed border-ink/50" />}
            <AiCard ai={ai} onOpen={open(ai)} />
          </li>
        ))}
      </ul>
    </div>
  )
}
