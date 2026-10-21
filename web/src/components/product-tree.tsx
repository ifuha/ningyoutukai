import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MemberCard } from '#/components/member-card'
import { TreeZoomBar } from '#/components/tree-zoom-bar'
import type {
  ProductTree as ProductTreeData,
  TreeMember,
  TreeTask,
} from '#/lib/api'
import { useFitScale } from '#/lib/use-fit-scale'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 4
const STEP = 1.25

// リーダーを一番上、その下にメンバーを横に並べる木構造。線は破線(CSS だけ)、矢印は子から親へ向く
// 既定は、幅に収まるよう全体を縮小する(横スクロールなし)。操作バーで拡大すると、ツリーの領域だけがスクロールする
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
  const { containerRef, contentRef, scale, width, height } = useFitScale()
  // zoom は、幅合わせ(scale)を 1 とした相対倍率。shown が実際にかける倍率
  const [zoom, setZoom] = useState(1)
  const shown = (scale ?? 1) * zoom
  // 拡大縮小の前後で、見えている範囲の中央が動かないよう、中央の位置(全体に対する割合)を覚えて戻す
  const centerRef = useRef<number | null>(null)
  const changeZoom = (next: number) => {
    const el = containerRef.current
    if (el && el.scrollWidth > 0) {
      centerRef.current = (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth
    }
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)))
  }
  useLayoutEffect(() => {
    const el = containerRef.current
    if (el && centerRef.current !== null) {
      el.scrollLeft = centerRef.current * el.scrollWidth - el.clientWidth / 2
    }
    centerRef.current = null
  }, [zoom, containerRef])
  // Ctrl/⌘ + ホイールで拡大縮小(ツリーの上だけ。passive だと preventDefault できないので直接つける)
  const wheelRef = useRef(changeZoom)
  wheelRef.current = (next) => changeZoom(next)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      wheelRef.current(zoomRef.current * Math.exp(-e.deltaY * 0.002))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [containerRef])

  return (
    <div>
      <TreeZoomBar
        percent={Math.round(shown * 100)}
        canZoomIn={zoom < MAX_ZOOM}
        canZoomOut={zoom > MIN_ZOOM}
        onZoomIn={() => changeZoom(zoom * STEP)}
        onZoomOut={() => changeZoom(zoom / STEP)}
        onReset={() => changeZoom(1)}
      />
      <div
        ref={containerRef}
        className="relative w-full overflow-auto"
        style={{ height: height * shown + (zoom > 1 ? 16 : 0) }}
      >
        <div
          ref={contentRef}
          className="absolute top-0 flex w-max flex-col items-center"
          style={{
            left: `max(0px, calc(50% - ${(width * shown) / 2}px))`,
            transform: `scale(${shown})`,
            transformOrigin: 'top left',
            visibility: scale === null ? 'hidden' : 'visible',
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
    </div>
  )
}
