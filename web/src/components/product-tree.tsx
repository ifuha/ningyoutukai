import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { MemberCard } from '#/components/member-card'
import { SectionBox } from '#/components/section-box'
import { TreeToolbar } from '#/components/tree-toolbar'
import type { TreeMode } from '#/components/tree-toolbar'
import { TreeZoomBar } from '#/components/tree-zoom-bar'
import type { Section } from '#/lib/section'
import { canvasBounds } from '#/lib/tree-layout'
import type {
  ProductTree as ProductTreeData,
  TreeMember,
  TreeTask,
} from '#/lib/tree'
import { useCanvasSize } from '#/lib/use-canvas-size'
import { usePanZoom } from '#/lib/use-pan-zoom'

// セクションがないときに渡す、空の配列(毎回新しい配列を作らない)
const NO_SECTIONS: Section[] = []

// 下に重ねる道具のバー(高さ 86px、下から 12px)の分の余白(px)。全体表示は、この分を避ける
// ズームバーと操作のヒントは、道具のバーと重ならないよう、その上に置く(下から TOOLBAR_INSET + 4px)
const BOTTOM_INSET = 100
const ABOVE_TOOLBAR = 'bottom-[104px]'

// リーダーを一番上、その下にメンバーを横に並べる木構造。線は破線(CSS だけ)、矢印は子から親へ向く
// 領域は、親(メイン領域)いっぱいの、自由にパン(移動)とズームができるキャンバス(スクロールバーは出さない)。初期表示は、全体が収まる倍率
// `header`(見出しとボタン群)と操作バー・説明は、キャンバスの上に重ねる(操作できる部分だけ pointer-events を有効にし、あとは入力をキャンバスへ通す)
// 全体表示とフォーカス追従は、見出しの高さ(測る)と操作バーの高さの分を避ける
// 入力は `usePanZoom`(ドラッグ・二本指スクロール・ピンチ・キー)。ページの縦スクロールは、領域の外で行う
// `onEditTask` を渡すと、タスクが押せて、押した人とタスクを渡す(`canOpenTask` があれば、それが true の人のタスクだけ)
// `onShowTasks` を渡すと、「他 N 件」が押せて、その人を渡す(全員向け)
// 下の中央の道具のバー(`TreeToolbar`)。`onOpenMembers` を渡すと(リーダーのみ)「メンバー」が押せて、メンバーの管理を開く
// 選択 / 移動のモードは、第 1 段階では押された見た目だけ(ドラッグでの移動は、どちらでもこれまでどおり)。
// 初期は「移動」(これまでの、つかむカーソルと同じ見た目)
// `sections` を渡すと、その座標と大きさで、色つきの四角を、カードの後ろに描く(F1。表示のみ)
//   座標の原点は、自動配置(リーダーを上、メンバーを横に並べる、これまでの配置)の左上。負の座標があれば、全体をずらして収める
export function ProductTree({
  header,
  tree,
  sections = NO_SECTIONS,
  onEditTask,
  canOpenTask,
  onShowTasks,
  onOpenMembers,
}: {
  header?: ReactNode
  tree: ProductTreeData
  sections?: Section[]
  onEditTask?: (member: TreeMember, task: TreeTask) => void
  canOpenTask?: (member: TreeMember) => boolean
  onShowTasks?: (member: TreeMember) => void
  onOpenMembers?: () => void
}) {
  const { leader, members } = tree
  const [mode, setMode] = useState<TreeMode>('pan')
  // セクションが収まる大きさと、負の座標のときのずらし量(セクションがなければ、すべて 0 = これまでの大きさ)
  const bounds = canvasBounds({ sections, cards: [] })
  const editFor = (m: TreeMember) =>
    onEditTask && (canOpenTask?.(m) ?? true)
      ? (task: TreeTask) => onEditTask(m, task)
      : undefined
  const last = members.length - 1
  // 上に重ねている見出しの高さ。全体表示で、ツリーがその下に潜らないようにする(初回の描画の前に測る)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const measure = () => setHeaderHeight(el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const { containerRef, contentRef, size } = useCanvasSize(
    headerHeight,
    BOTTOM_INSET,
  )
  const { view, dragging, canZoomIn, canZoomOut, zoomIn, zoomOut, reset, handlers } =
    usePanZoom(containerRef, size)

  return (
    <div className="relative h-full w-full">
      <div
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 border-b border-ink/30 bg-surface/80 px-4 py-3"
      >
        {header}
      </div>
      <div
        ref={containerRef}
        role="region"
        aria-label="ツリー(ドラッグか矢印キーで移動、+ と - で拡大縮小、0 で全体表示)"
        tabIndex={0}
        {...handlers}
        className={`absolute inset-0 touch-none select-none overflow-clip overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${
          mode === 'select' ? 'cursor-default' : dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <div
          ref={contentRef}
          className="absolute top-0 left-0 w-max origin-top-left"
          style={{
            transform: view
              ? `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
              : undefined,
            visibility: view ? 'visible' : 'hidden',
            // セクションが収まる大きさ(なければ指定しない = 自動配置の大きさのまま)
            minWidth: bounds.minWidth || undefined,
            minHeight: bounds.minHeight || undefined,
          }}
        >
          {/* セクションの四角は、カードの後ろ(先に描く) */}
          {sections.map((s) => (
            <SectionBox
              key={s.sectionId}
              section={s}
              offsetX={bounds.offsetX}
              offsetY={bounds.offsetY}
            />
          ))}
          {/* 自動配置(リーダーを上、メンバーを横に並べる)。負の座標があるときは、その分だけずらす */}
          <div
            className="relative flex w-max flex-col items-center"
            style={{
              marginLeft: bounds.offsetX || undefined,
              marginTop: bounds.offsetY || undefined,
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
        </div>
        <p
          aria-hidden="true"
          className={`pointer-events-none absolute ${ABOVE_TOOLBAR} left-3 hidden text-xs opacity-50 sm:block`}
        >
          <span className="pointer-coarse:hidden">
            ドラッグ・二本指スクロールで移動、Ctrl+ホイール・ピンチで拡大縮小
          </span>
          <span className="hidden pointer-coarse:inline">
            1 本指で移動、2 本指で拡大縮小
          </span>
        </p>
      </div>
      <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
        <TreeToolbar
          mode={mode}
          onModeChange={setMode}
          onOpenMembers={onOpenMembers}
        />
      </div>
      <div className={`absolute right-3 ${ABOVE_TOOLBAR} z-10`}>
        <TreeZoomBar
          percent={Math.round((view?.scale ?? 1) * 100)}
          canZoomIn={canZoomIn}
          canZoomOut={canZoomOut}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onReset={reset}
        />
      </div>
    </div>
  )
}
