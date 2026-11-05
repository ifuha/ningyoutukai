import { useEffect, useRef, useState } from 'react'
import type { ProductNote, ProductNotePatch } from '#/lib/memo-api'
import { useCanvasView } from '#/lib/canvas-view'

// メモ(付箋)。見た目はセクションに近づける: 破線の枠(2px)と、同じ色の薄い塗り(色は文字色 = ink)。タイトルの帯や、ゴミ箱のボタンは持たない
// - 動かす: 入力欄のまわりの余白をつかんでドラッグ(入力欄の中は、文字の選択になる)
// - 消す: 余白を押してメモにフォーカスし(枠が実線になる)、Delete / Backspace
export function StickyNote({ note, offsetX = 0, offsetY = 0, onUpdate, onDelete, onEditingChange, autoEdit = false }: { note: ProductNote; offsetX?: number; offsetY?: number; onUpdate: (id: string, patch: ProductNotePatch) => void; onDelete: (id: string) => void; onEditingChange?: (editing: boolean) => void; autoEdit?: boolean }) {
  const { scale } = useCanvasView()
  // 内容を編集中(文字入力欄にフォーカスがある間)を親に伝える。編集中は、セクションなど他の操作を止める。メモが消えるときも、編集中を終わらせる
  const editingRef = useRef(onEditingChange)
  editingRef.current = onEditingChange
  useEffect(() => () => editingRef.current?.(false), [])
  // autoEdit が true になったとき(追加したばかりのメモ)、内容の入力欄にフォーカスして、そのまま編集できる状態にする
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (autoEdit) textareaRef.current?.focus({ preventScroll: true })
  }, [autoEdit])
  const [content, setContent] = useState(note.content)
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)
  const [position, setPosition] = useState({ x: note.x, y: note.y })

  const positionAt = (e: { clientX: number; clientY: number }) => {
    const d = drag.current
    return d ? { x: d.x + (e.clientX - d.startX) / scale, y: d.y + (e.clientY - d.startY) / scale } : null
  }

  return (
    <article
      data-no-deselect
      data-sticky-note=""
      tabIndex={0}
      aria-label="メモ(Delete で削除)"
      className="absolute z-20 flex h-52 w-56 cursor-grab flex-col border-2 border-dashed border-ink bg-ink/20 p-2 text-ink outline-none focus-visible:border-solid active:cursor-grabbing"
      style={{ left: position.x + offsetX, top: position.y + offsetY }}
      onPointerDown={(e) => {
        // 入力欄の中は、文字の選択のために、動かさない
        e.stopPropagation()
        if (e.target instanceof HTMLTextAreaElement) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: position.x, y: position.y, startX: e.clientX, startY: e.clientY }
      }}
      onPointerMove={(e) => {
        const next = positionAt(e)
        if (next) setPosition(next)
      }}
      onPointerUp={(e) => {
        const next = positionAt(e)
        const start = drag.current
        if (!next || !start) return
        drag.current = null
        setPosition(next)
        // 押しただけ(動いていない)ときは、保存しない
        if (Math.hypot(next.x - start.x, next.y - start.y) >= 1) onUpdate(note.noteId, next)
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onKeyDown={(e) => {
        // メモそのもの(入力欄ではなく)にフォーカスがあるときだけ消す
        if (e.target !== e.currentTarget) return
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          onDelete(note.noteId)
        }
      }}
    >
      <textarea
        ref={textareaRef}
        aria-label="メモの内容"
        className="min-h-0 flex-1 resize-none cursor-text bg-transparent p-1 text-sm leading-5 outline-none placeholder:text-ink/45"
        placeholder="メモを書く…"
        maxLength={2000}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onFocus={() => onEditingChange?.(true)}
        onBlur={() => {
          onEditingChange?.(false)
          if (content !== note.content) onUpdate(note.noteId, { content })
        }}
      />
    </article>
  )
}
