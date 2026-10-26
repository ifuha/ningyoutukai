import type { ReactNode } from 'react'
import { MemberCard } from '#/components/member-card'
import type { CardDragHandlers } from '#/lib/section-interaction-types'
import type { TreeMember } from '#/lib/tree'

// カードのドラッグ(`useCardDrag`)のための、ツリーの部品(F1 セクション画面)

/**
 * カードを包む要素。ハンドラ(押す・動かす・離す・取り消し)と、`touch-action: none`(タッチで、ブラウザのスクロールに
 * 奪われない)を付ける。ドラッグ中は、元のカードを薄くする(プレビューは、`CardGhost` が別に描く)。
 * ハンドラがない(リーダーでない・「セクション」の道具で描いている間)ときは、何も包まない(これまでと同じ DOM のまま)。
 */
export function DragSlot({
  handlers,
  dragging,
  children,
}: {
  handlers?: CardDragHandlers
  dragging: boolean
  children: ReactNode
}) {
  if (!handlers) return <>{children}</>
  return (
    <div {...handlers} data-drag-slot="" className={`touch-none ${dragging ? 'opacity-40' : ''}`}>
      {children}
    </div>
  )
}

/**
 * ドラッグ中のカードの影。プレビューの位置(カードの左上のキャンバス座標。`offsetX` / `offsetY` は、負の座標があるときの
 * 全体のずらし量)に描く。`cardId` は付けない(カードの位置を測る目印が、元のカードと重ならないように)。ポインタは通す。
 * 重ね順は z-40(描く層 z-30・編集枠の上)。
 */
export function CardGhost({
  member,
  position,
  offsetX = 0,
  offsetY = 0,
}: {
  member: TreeMember
  position: { x: number; y: number }
  offsetX?: number
  offsetY?: number
}) {
  return (
    <div
      data-card-ghost={member.productMemberId}
      className="pointer-events-none absolute z-40 opacity-90 shadow-lg"
      style={{ left: position.x + offsetX, top: position.y + offsetY }}
    >
      <MemberCard member={member} />
    </div>
  )
}
