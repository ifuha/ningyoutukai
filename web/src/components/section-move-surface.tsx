import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { SectionEditorProps } from '#/components/section-editor'
import type { Rect } from '#/lib/section-edit-geometry'
import {
  IDLE,
  cancelDrag,
  dragPreview,
  endDrag,
  moveDrag,
  pressDrag,
  type DragState,
} from '#/lib/section-editor-state'
import { sectionStyle } from '#/lib/section-style'

// セクションの内側の「動かす面」。セクションを、カードのように、内側の空いている場所をつかんでドラッグして動かせるようにする。
//
// 置く場所: キャンバスの変換された層の中で、`SectionBox` の上、**カードの下**(カードの上のドラッグは、これまでどおりカードのドラッグ)。
//   カードのない、空いた場所のドラッグだけが、この面に届く。編集枠(`SectionEditor`。カードの上)の札・帯・ハンドルは、さらに上にあるので優先される。
// 振る舞い(`canEdit` のときだけ。false のときは、何も出さず、何も受けない):
// - 押したら、そのセクションを選択する(`onSelect`)。キャンバスの移動(パン)は始めない(押下を、親に伝えない)。
// - 動きが 4px 以内なら、クリック(選択するだけ。動かさない)。超えたらドラッグになり、**押した点を起点に**動く。
// - ドラッグ中は、見た目だけを更新する(破線のプレビュー)。確定は、離したときに 1 回だけ `onChange(rect)`。動かなかったら呼ばない。
//   所属メンバーのカードの連動は、`onChange` を受ける側(`updateSection` の楽観更新)が行う(ここでは動かさない)。
// - Esc・`pointercancel` で取り消し(`onChange` は呼ばない)。右クリックは無視。2 本目の指は、押している間は無視する(パンも始めない)。
// - `data-no-deselect`: この面のクリックが、「背景のクリック」として、選択を外さないようにする(キャンバスのクリックの判定が無視する)。
// 計算は、編集枠と同じ移動の遷移(`section-editor-state.ts`。画面の差分を拡大率で割って、座標の上限に収める)を使う。

export type SectionMoveSurfaceProps = Pick<
  SectionEditorProps,
  'section' | 'canEdit' | 'scale' | 'onSelect' | 'onChange' | 'onPreview' | 'offsetX' | 'offsetY'
>

type Latest = Pick<SectionMoveSurfaceProps, 'scale' | 'onSelect' | 'onChange' | 'onPreview'> & { base: Rect }

export function SectionMoveSurface({
  section,
  canEdit,
  scale,
  onSelect,
  onChange,
  onPreview,
  offsetX = 0,
  offsetY = 0,
}: SectionMoveSurfaceProps) {
  const base: Rect = { x: section.x, y: section.y, width: section.width, height: section.height }

  // イベントの中(古い render の関数)から、最新の値を読むための入れ物
  const latest = useRef<Latest>({ base, scale, onSelect, onChange, onPreview })
  latest.current = { base, scale, onSelect, onChange, onPreview }

  const [drag, setDrag] = useState<DragState>(IDLE)
  const dragRef = useRef<DragState>(IDLE)
  const update = (next: DragState) => {
    dragRef.current = next
    setDrag(next)
    // 親に、動かしている最中か(プレビューの四角あり)を知らせる。Esc の優先順位に使う
    latest.current.onPreview?.(dragPreview(next))
  }

  // 押している間の Esc で、取り消す
  useEffect(() => {
    if (drag.phase === 'idle') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') update(cancelDrag())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drag.phase])

  // リーダーでなくなった・消えたときは、途中のドラッグを捨てる
  useEffect(() => {
    if (!canEdit && dragRef.current.phase !== 'idle') update(cancelDrag())
  }, [canEdit])
  useEffect(
    () => () => {
      if (dragRef.current.phase === 'dragging') latest.current.onPreview?.(null)
    },
    [],
  )

  if (!canEdit) return null

  const live = dragPreview(drag)
  const dragging = drag.phase === 'dragging'
  const style = sectionStyle(section.color)

  return (
    <div
      data-section-move-surface={section.sectionId}
      data-no-deselect=""
      className="pointer-events-auto absolute"
      style={{
        left: base.x + offsetX,
        top: base.y + offsetY,
        width: base.width,
        height: base.height,
        cursor: dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onPointerDown={(e: ReactPointerEvent<HTMLElement>) => {
        // 動かしている最中の、ほかのポインタ(2 本目の指)は、無視する(パンも、始めない)
        if (dragRef.current.phase !== 'idle' && dragRef.current.pointerId !== e.pointerId) {
          e.stopPropagation()
          return
        }
        // 右クリック・中ボタン・主でないポインタは、受けない(親の処理に任せる)
        if (e.button !== 0 || !e.isPrimary) return
        e.stopPropagation()
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        latest.current.onSelect()
        update(pressDrag({ type: 'move' }, latest.current.base, { x: e.clientX, y: e.clientY }, e.pointerId))
      }}
      onPointerMove={(e: ReactPointerEvent<HTMLElement>) => {
        if (dragRef.current.phase === 'idle') return
        const next = moveDrag(dragRef.current, { x: e.clientX, y: e.clientY }, latest.current.scale, e.pointerId)
        if (next !== dragRef.current) update(next)
      }}
      onPointerUp={(e: ReactPointerEvent<HTMLElement>) => {
        const result = endDrag(dragRef.current, e.pointerId)
        if (result.state === dragRef.current) return // ほかのポインタ・待機中
        update(result.state)
        if (result.commit) latest.current.onChange(result.commit)
      }}
      onPointerCancel={(e: ReactPointerEvent<HTMLElement>) => {
        const d = dragRef.current
        if (d.phase !== 'idle' && d.pointerId === e.pointerId) update(cancelDrag())
      }}
      onLostPointerCapture={(e: ReactPointerEvent<HTMLElement>) => {
        const d = dragRef.current
        if (d.phase !== 'idle' && d.pointerId === e.pointerId) update(cancelDrag())
      }}
    >
      {/* ドラッグ中の、見た目だけの四角(確定するまで、元のセクションはそのまま) */}
      {live && (
        <div
          aria-hidden="true"
          data-section-move-preview=""
          className={`pointer-events-none absolute border-2 border-dashed ${style.box}`}
          style={{
            left: live.x - base.x,
            top: live.y - base.y,
            width: live.width,
            height: live.height,
          }}
        />
      )}
    </div>
  )
}
