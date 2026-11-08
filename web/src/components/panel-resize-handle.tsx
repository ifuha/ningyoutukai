import { useRef } from 'react'
import { PANEL_MAX_PX, PANEL_MIN_PX, widthFromKey, widthFromPointer } from '#/lib/panel-width'

// 右側のパネルの、左の縁につける、幅を変えるつまみ(広い画面だけ。スマホは全面なので出さない)。
// - マウス(タッチ)で掴んで、左右にドラッグする。左へ動かすと広がり、右へ動かすと狭まる
// - キーボードでも変えられる: フォーカスして ← で広げ、→ で狭める、Home で最小、End で最大
// - ダブルクリックで、既定の幅に戻す
// 幅の範囲は `lib/panel-width.ts`。置き場所(パネルの親の要素)の幅を見て、広がりすぎないようにする
export function PanelResizeHandle({
  width,
  onChange,
  onCommit,
  onReset,
}: {
  width: number
  /** ドラッグ中・キー操作中に、新しい幅を渡す */
  onChange: (width: number) => void
  /** 操作が終わったとき(離した・キーを押した)に、確定した幅を渡す(保存に使う) */
  onCommit: (width: number) => void
  onReset: () => void
}) {
  const dragging = useRef(false)
  const latest = useRef(width)
  latest.current = width

  const container = (el: HTMLElement) => el.parentElement?.offsetParent as HTMLElement | null

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="文書のパネルの幅(左右にドラッグ、または ← → で変える。ダブルクリックで元に戻す)"
      aria-valuemin={PANEL_MIN_PX}
      aria-valuemax={PANEL_MAX_PX}
      aria-valuenow={width}
      tabIndex={0}
      data-panel-resize=""
      className="group absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize touch-none select-none outline-none md:block"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        dragging.current = true
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return
        const box = container(e.currentTarget)?.getBoundingClientRect()
        if (!box) return
        onChange(widthFromPointer(box.right, e.clientX, box.width))
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return
        dragging.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
        onCommit(latest.current)
      }}
      onPointerCancel={() => {
        dragging.current = false
        onCommit(latest.current)
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const box = container(e.currentTarget)?.getBoundingClientRect()
        const next = widthFromKey(latest.current, e.key, box?.width ?? 1280)
        if (next === null) return
        e.preventDefault()
        onChange(next)
        onCommit(next)
      }}
    >
      {/* つまみの見た目: 縁に細い線。ホバーとフォーカスで濃くする */}
      <span aria-hidden="true" className="mx-auto block h-full w-px bg-line transition-colors group-hover:w-0.5 group-hover:bg-ink group-focus-visible:w-0.5 group-focus-visible:bg-ink motion-reduce:transition-none" />
    </div>
  )
}
