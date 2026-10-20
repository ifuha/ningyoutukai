import { MemberCard } from '#/components/member-card'
import type {
  ProductTree as ProductTreeData,
  TreeMember,
  TreeTask,
} from '#/lib/api'
import { useFitScale } from '#/lib/use-fit-scale'

// リーダーを一番上、その下にメンバーを横に並べる木構造。線は破線(CSS だけ)、矢印は子から親へ向く
// 幅に収まらないときは、全体を縮小する(横スクロールはなし)
// `onEditTask` を渡すと(リーダーだけ)、タスクが押せて、押した人とタスクを渡す
export function ProductTree({
  tree,
  onEditTask,
}: {
  tree: ProductTreeData
  onEditTask?: (member: TreeMember, task: TreeTask) => void
}) {
  const { leader, members } = tree
  const editFor = (m: TreeMember) =>
    onEditTask && ((task: TreeTask) => onEditTask(m, task))
  const last = members.length - 1
  const { containerRef, contentRef, scale, height } = useFitScale()

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={{ height }}
    >
      <div
        ref={contentRef}
        className="absolute top-0 left-1/2 flex w-max flex-col items-center"
        style={{
          transform: `translateX(-50%) scale(${scale ?? 1})`,
          transformOrigin: 'top center',
          visibility: scale === null ? 'hidden' : 'visible',
        }}
      >
        <MemberCard member={leader} onEditTask={editFor(leader)} />
        {members.length === 0 ? (
          <p className="mt-4 text-sm opacity-60"># メンバーは、まだいません</p>
        ) : (
          <>
            <div
              aria-hidden="true"
              className="h-6 border-l border-dashed border-ink/50"
            />
            <ul className="flex">
              {members.map((m, i) => (
                <li key={m.productMemberId} className="relative px-3 pt-6">
                  <span aria-hidden="true">
                    {members.length > 1 && (
                      <span
                        className={`absolute top-0 h-0 border-t border-dashed border-ink/50 ${
                          i === 0
                            ? 'left-1/2 w-1/2'
                            : i === last
                              ? 'left-0 w-1/2'
                              : 'left-0 w-full'
                        }`}
                      />
                    )}
                    {/* 縦線(幅 1px)と三角(幅 10px)は、どちらも left-1/2 に置き、-translate-x-1/2 で、自分の幅の半分だけ左へ戻す。
                      線は [c-0.5, c+0.5]、三角は [c-5, c+5] で、中心はどちらも c(li の中央)になる */}
                    <span className="absolute top-0 left-1/2 h-4 -translate-x-1/2 border-l border-dashed border-ink/50" />
                    <span className="absolute top-4 left-1/2 size-0 -translate-x-1/2 border-x-[5px] border-b-[7px] border-x-transparent border-b-ink/50" />
                  </span>
                  <MemberCard member={m} onEditTask={editFor(m)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
