import { MemberCard } from '#/components/member-card'
import { TreeZoomBar } from '#/components/tree-zoom-bar'
import type {
  ProductTree as ProductTreeData,
  TreeMember,
  TreeTask,
} from '#/lib/api'
import { useCanvasSize } from '#/lib/use-canvas-size'
import { usePanZoom } from '#/lib/use-pan-zoom'

// リーダーを一番上、その下にメンバーを横に並べる木構造。線は破線(CSS だけ)、矢印は子から親へ向く
// 領域は、自由にパン(移動)とズームができるキャンバス(スクロールバーは出さない)。初期表示は、全体が収まる倍率
// 入力は `usePanZoom`(ドラッグ・二本指スクロール・ピンチ・キー)。ページの縦スクロールは、領域の外で行う
// `onEditTask` を渡すと、タスクが押せて、押した人とタスクを渡す(`canOpenTask` があれば、それが true の人のタスクだけ)
// `onShowTasks` を渡すと、「他 N 件」が押せて、その人を渡す(全員向け)
export function ProductTree({
  tree,
  onEditTask,
  canOpenTask,
  onShowTasks,
}: {
  tree: ProductTreeData
  onEditTask?: (member: TreeMember, task: TreeTask) => void
  canOpenTask?: (member: TreeMember) => boolean
  onShowTasks?: (member: TreeMember) => void
}) {
  const { leader, members } = tree
  const editFor = (m: TreeMember) =>
    onEditTask && (canOpenTask?.(m) ?? true)
      ? (task: TreeTask) => onEditTask(m, task)
      : undefined
  const last = members.length - 1
  const { containerRef, contentRef, size } = useCanvasSize()
  const { view, dragging, canZoomIn, canZoomOut, zoomIn, zoomOut, reset, handlers } =
    usePanZoom(containerRef, size)

  return (
    <div>
      <TreeZoomBar
        percent={Math.round((view?.scale ?? 1) * 100)}
        canZoomIn={canZoomIn}
        canZoomOut={canZoomOut}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onReset={reset}
      />
      <div
        ref={containerRef}
        role="region"
        aria-label="ツリー(ドラッグか矢印キーで移動、+ と - で拡大縮小、0 で全体表示)"
        tabIndex={0}
        {...handlers}
        className={`relative w-full touch-none select-none overflow-clip overscroll-contain border border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ height: 'max(420px, calc(100dvh - 14rem))' }}
      >
        <div
          ref={contentRef}
          className="absolute top-0 left-0 flex w-max origin-top-left flex-col items-center"
          style={{
            transform: view
              ? `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
              : undefined,
            visibility: view ? 'visible' : 'hidden',
          }}
        >
          <MemberCard
            member={leader}
            onEditTask={editFor(leader)}
            onShowTasks={onShowTasks}
          />
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
                    <MemberCard
                      member={m}
                      onEditTask={editFor(m)}
                      onShowTasks={onShowTasks}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <p
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1 left-2 text-xs opacity-50"
        >
          <span className="pointer-coarse:hidden">
            ドラッグ・二本指スクロールで移動、Ctrl+ホイール・ピンチで拡大縮小
          </span>
          <span className="hidden pointer-coarse:inline">
            1 本指で移動、2 本指で拡大縮小
          </span>
        </p>
      </div>
    </div>
  )
}
