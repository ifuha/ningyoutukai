import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { SectionEditorMenu } from '#/components/section-editor-menu'
import { SectionNameEditor } from '#/components/section-name-editor'
import type { SectionColor } from '#/lib/section'
import type { Point, Rect } from '#/lib/section-edit-geometry'
import {
  IDLE,
  NUDGE_SETTLE_MS,
  TAG_RECT,
  bandBoxes,
  cancelDrag,
  dragPreview,
  endDrag,
  handleBoxes,
  handleCursor,
  isClick,
  keyAction,
  menuReduce,
  moveDrag,
  nudgeRect,
  pickColor,
  pressDrag,
  confirmDelete,
  screenSize,
  settleNudge,
  startDrag,
  type DragKind,
  type DragState,
  type MenuState,
} from '#/lib/section-editor-state'
import { sectionStyle } from '#/lib/section-style'

// セクションの編集枠。`SectionBox`(セクションの見た目を描く)の上に重ねる、編集用の層
// 親は、キャンバスの変換された層(パン・ズームの `transform` の内側)で、`SectionBox` と同じ座標系に置く
//
// できること(`canEdit` のときだけ。リーダーのみは、親が `canEdit` で渡す。false のときは、何も描かず、何も受けない)
// - 選択: 枠の線の近く(帯)・札のクリックで `onSelect()`。四角の内側は、ポインタを通す(カードのドラッグ・キャンバスの移動を妨げない)
//   ただし `interiorSelectable` のとき(カードより下の層に置くとき)は、内側のクリックでも選択できる
// - 札・枠の線の近く(帯)は、未選択でも、押した時点で選択し、4px を超えて動かすと移動する(カードと同じ。パンは始めない)
//   四角の内側の空いた場所のドラッグは、カードの下の層の `SectionMoveSurface` が受ける
// - 選択中: 8 つのハンドルで大きさを変える
// - ドラッグ中は、見た目だけを更新する(破線のプレビュー)。確定は、ポインタを離したときに 1 回だけ `onChange(rect)`。動かなかったら呼ばない。Esc で取り消し
// - 名前: 札をダブルクリックで、その場で編集(Enter・外のクリックで `onRename`、Esc で取り消し)
// - 色・削除: 札のとなりの「⋯」メニュー。削除は確認を挟む。選択中の Delete / Backspace でも、確認を開く
// - 矢印キー: 1px(Shift で 10px)。連打は、待ち時間(350ms)のあとに 1 回にまとめて `onChange`
// 座標は、すべてキャンバスの座標(`offsetX` / `offsetY` は、`SectionBox` と同じ全体のずらし量で、表示の位置にだけ足す)

export type SectionEditorSection = {
  sectionId: string
  sectionName: string
  color: SectionColor
  x: number
  y: number
  width: number
  height: number
}

export type SectionEditorProps = {
  section: SectionEditorSection
  selected: boolean
  canEdit: boolean
  /** キャンバスの拡大率。ドラッグの差分の換算と、ハンドル・帯・メニューの見た目の大きさ(一定)に使う */
  scale: number
  onSelect: () => void
  /** 移動・大きさの変更の確定(ドラッグの終わり、矢印キーのまとめ)。キャンバスの座標 */
  onChange: (rect: Rect) => void
  /** 名前の確定(前後の空白を取り除いた、1〜50 文字) */
  onRename: (name: string) => void
  onColorChange: (color: SectionColor) => void
  /** 削除の確認で「削除する」を押したとき */
  onDelete: () => void
  /** `SectionBox` と同じ、負の座標があるときの全体のずらし量(表示の位置にだけ足す)。省略は 0 */
  offsetX?: number
  offsetY?: number
  /** 四角の内側のクリックでも選択できる(カードより下の層に置くとき)。省略は false(内側は、ポインタを通す) */
  interiorSelectable?: boolean
  /** ドラッグ・矢印キーの途中の、見た目だけの四角を知らせる(終わったら `null`)。`SectionBox` を追従させたいときに使う */
  onPreview?: (rect: Rect | null) => void
}

type Latest = {
  base: Rect
  scale: number
  selected: boolean
  onSelect: () => void
  onChange: (rect: Rect) => void
  onPreview?: (rect: Rect | null) => void
}

export function SectionEditor({
  section,
  selected,
  canEdit,
  scale,
  onSelect,
  onChange,
  onRename,
  onColorChange,
  onDelete,
  offsetX = 0,
  offsetY = 0,
  interiorSelectable = false,
  onPreview,
}: SectionEditorProps) {
  const base: Rect = { x: section.x, y: section.y, width: section.width, height: section.height }

  // イベントの中(古い render の関数)から、最新の値を読むための入れ物
  const latest = useRef<Latest>({ base, scale, selected, onSelect, onChange, onPreview })
  latest.current = { base, scale, selected, onSelect, onChange, onPreview }

  const [drag, setDrag] = useState<DragState>(IDLE)
  const dragRef = useRef<DragState>(IDLE)
  const [nudge, setNudge] = useState<Rect | null>(null)
  const nudgeRef = useRef<Rect | null>(null)
  const nudgeTimer = useRef<number | undefined>(undefined)
  const [menu, setMenu] = useState<MenuState>('closed')
  const [renaming, setRenaming] = useState(false)
  // 押した位置(画面の座標)。クリックとドラッグの区別に使う
  const downPoint = useRef<Point | null>(null)

  const preview = (rect: Rect | null) => latest.current.onPreview?.(rect)

  const updateDrag = (next: DragState) => {
    dragRef.current = next
    setDrag(next)
    preview(dragPreview(next))
  }

  const clearNudgeTimer = () => {
    window.clearTimeout(nudgeTimer.current)
    nudgeTimer.current = undefined
  }
  // 矢印キーの移動を、待ち時間のあとに 1 回だけ確定する(選択が外れるときにも、残りを確定する)
  const flushNudge = () => {
    clearNudgeTimer()
    const pending = nudgeRef.current
    if (!pending) return
    nudgeRef.current = null
    setNudge(null)
    preview(null)
    const commit = settleNudge(latest.current.base, pending)
    if (commit) latest.current.onChange(commit)
  }
  const cancelNudge = () => {
    clearNudgeTimer()
    nudgeRef.current = null
    setNudge(null)
    preview(null)
  }

  // 選択中のキー操作(Delete・矢印・Esc)。入力欄の中のキーは、取らない
  useEffect(() => {
    if (!canEdit || !selected) return
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const inEditable =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      const action = keyAction({
        key: e.key,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        inEditable,
      })
      if (action === null) return
      if (action.type === 'ask-delete') {
        e.preventDefault()
        setMenu((m) => menuReduce(m, { type: 'ask-delete' }))
      } else if (action.type === 'nudge') {
        if (dragRef.current.phase !== 'idle') return
        e.preventDefault()
        const next = nudgeRect(nudgeRef.current ?? latest.current.base, action.delta)
        nudgeRef.current = next
        setNudge(next)
        preview(next)
        clearNudgeTimer()
        nudgeTimer.current = window.setTimeout(flushNudge, NUDGE_SETTLE_MS)
      } else {
        // Esc: ドラッグ中 → ドラッグの取り消し。矢印キーの移動の途中 → 取り消し。メニューが開いている → 閉じる
        if (dragRef.current.phase !== 'idle') {
          updateDrag(cancelDrag())
        } else if (nudgeRef.current) {
          cancelNudge()
        } else {
          setMenu((m) => (m === 'closed' ? m : menuReduce(m, { type: 'close' })))
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      flushNudge()
    }
  }, [canEdit, selected])

  // メニューの外を押したら閉じる
  useEffect(() => {
    if (menu === 'closed') return
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-section-menu]')) return
      setMenu('closed')
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menu])

  // 選択が外れたら、メニューも閉じる
  useEffect(() => {
    if (!selected) setMenu('closed')
  }, [selected])

  useEffect(() => clearNudgeTimer, [])

  if (!canEdit) return null

  const live = dragPreview(drag) ?? nudge ?? base
  const moving = drag.phase === 'dragging' || nudge !== null
  const style = sectionStyle(section.color)

  // 移動・大きさの変更のつかみ場所に付ける、ポインタのイベント
  // 押したら、その場でつかむ(カードと同じ)。**未選択でも、押した時点で選択し**、キャンバスの移動(パン)は始めない。
  // 移動は、動きが 4px を超えたらドラッグになる(`pressDrag`。クリックだけなら、選択するだけ)。大きさの変更(ハンドル)は、すぐ始まる
  const grab = (kind: DragKind) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || !e.isPrimary) return
      downPoint.current = { x: e.clientX, y: e.clientY }
      e.stopPropagation()
      e.preventDefault()
      flushNudge()
      e.currentTarget.setPointerCapture(e.pointerId)
      if (!latest.current.selected) latest.current.onSelect()
      const client = { x: e.clientX, y: e.clientY }
      updateDrag(
        kind.type === 'move'
          ? pressDrag(kind, latest.current.base, client, e.pointerId)
          : startDrag(kind, latest.current.base, client, e.pointerId),
      )
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (dragRef.current.phase === 'idle') return
      const next = moveDrag(dragRef.current, { x: e.clientX, y: e.clientY }, latest.current.scale, e.pointerId)
      if (next !== dragRef.current) updateDrag(next)
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const result = endDrag(dragRef.current, e.pointerId)
      if (result.state === dragRef.current) return // ほかのポインタ・待機中
      updateDrag(result.state)
      if (result.commit) latest.current.onChange(result.commit)
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      const d = dragRef.current
      if (d.phase !== 'idle' && d.pointerId === e.pointerId) updateDrag(cancelDrag())
    },
    onLostPointerCapture: (e: ReactPointerEvent<HTMLElement>) => {
      const d = dragRef.current
      if (d.phase !== 'idle' && d.pointerId === e.pointerId) updateDrag(cancelDrag())
    },
    onClick: (e: { clientX: number; clientY: number }) => {
      if (latest.current.selected || !downPoint.current) return
      if (isClick(downPoint.current, { x: e.clientX, y: e.clientY })) latest.current.onSelect()
    },
  })

  const grabCursor = selected ? 'move' : 'pointer'
  const handleSize = screenSize(2, scale)

  return (
    <div
      role="group"
      aria-label={`セクション ${section.sectionName} の編集`}
      data-section-editor={section.sectionId}
      data-selected={selected ? 'true' : undefined}
      className="pointer-events-none absolute isolate"
      style={{
        left: live.x + offsetX,
        top: live.y + offsetY,
        width: live.width,
        height: live.height,
      }}
    >
      {/* ドラッグ・矢印キーの途中の、見た目だけの四角(確定するまで、元の四角はそのまま) */}
      {moving && (
        <div
          aria-hidden="true"
          data-section-preview
          className={`absolute inset-0 border-2 border-dashed ${style.box}`}
        />
      )}
      {/* 選択中の印 */}
      {selected && (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ outline: `${handleSize}px solid var(--color-ink)`, outlineOffset: handleSize }}
        />
      )}

      {/* 内側(カードより下の層に置くときだけ、クリックで選択できる) */}
      {interiorSelectable && (
        <div
          data-section-interior
          className="pointer-events-auto absolute inset-0"
          onPointerDown={(e) => {
            if (e.button === 0) downPoint.current = { x: e.clientX, y: e.clientY }
          }}
          onClick={grab({ type: 'move' }).onClick}
        />
      )}

      {/* 枠の線の近くの、つかめる帯(押すと選択、ドラッグで移動) */}
      {bandBoxes(live, scale).map((b) => (
        <div
          key={b.side}
          data-section-band={b.side}
          {...grab({ type: 'move' })}
          className="pointer-events-auto absolute z-10"
          style={{
            left: b.left,
            top: b.top,
            width: b.width,
            height: b.height,
            cursor: grabCursor,
            touchAction: 'none',
          }}
        />
      ))}

      {/* 札: 押すと選択、ドラッグで移動、ダブルクリックで名前の編集 */}
      <div
        className="absolute z-20"
        style={{ left: TAG_RECT.left, top: TAG_RECT.top, width: TAG_RECT.width, height: TAG_RECT.height }}
      >
        {renaming ? (
          <SectionNameEditor
            initial={section.sectionName}
            className={style.tag}
            onCommit={(name) => {
              setRenaming(false)
              onRename(name)
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <div
            data-section-tag
            title="ダブルクリックで名前を変更"
            {...grab({ type: 'move' })}
            onDoubleClick={() => setRenaming(true)}
            className="pointer-events-auto size-full"
            style={{ cursor: grabCursor, touchAction: 'none' }}
          />
        )}
      </div>

      {/* 選択中: 8 つのハンドル(見た目の大きさは、拡大率に関わらず一定) */}
      {selected &&
        handleBoxes(live, scale).map((h) => (
          <div
            key={h.handle}
            data-resize-handle={h.handle}
            aria-hidden="true"
            {...grab({ type: 'resize', handle: h.handle })}
            className="pointer-events-auto absolute z-30 border-ink bg-surface"
            style={{
              left: h.cx - h.size / 2,
              top: h.cy - h.size / 2,
              width: h.size,
              height: h.size,
              borderStyle: 'solid',
              borderWidth: handleSize,
              cursor: handleCursor(h.handle),
              touchAction: 'none',
            }}
          />
        ))}

      {/* 選択中: 色と削除のメニュー */}
      {selected && (
        <SectionEditorMenu
          name={section.sectionName}
          color={section.color}
          menu={menu}
          scale={scale}
          onToggle={() => setMenu((m) => menuReduce(m, { type: 'toggle' }))}
          onPickColor={(chosen) => {
            const r = pickColor(section.color, chosen)
            setMenu(r.menu)
            if (r.color !== null) onColorChange(r.color)
          }}
          onAskDelete={() => setMenu((m) => menuReduce(m, { type: 'ask-delete' }))}
          onCancelDelete={() => setMenu((m) => menuReduce(m, { type: 'cancel-delete' }))}
          onConfirmDelete={() => {
            const r = confirmDelete(menu)
            setMenu(r.menu)
            if (r.remove) onDelete()
          }}
        />
      )}
    </div>
  )
}
