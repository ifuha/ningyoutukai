import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { ProductNote, ProductNotePatch } from '#/lib/memo-api'
import { useCanvasView } from '#/lib/canvas-view'

export function StickyNote({ note, offsetX = 0, offsetY = 0, onUpdate, onDelete }: { note: ProductNote; offsetX?: number; offsetY?: number; onUpdate: (id: string, patch: ProductNotePatch) => void; onDelete: (id: string) => void }) {
  const { scale } = useCanvasView()
  const [content, setContent] = useState(note.content)
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)
  const [position, setPosition] = useState({ x: note.x, y: note.y })
  return <article data-no-deselect data-sticky-note="" className="absolute z-20 flex h-52 w-56 flex-col border border-amber-900/30 bg-[#fff3a6] text-ink shadow-[3px_3px_0_rgba(0,0,0,.2)]" style={{ left: position.x + offsetX, top: position.y + offsetY }} onPointerDown={(e) => e.stopPropagation()}>
    <header className="flex h-9 shrink-0 cursor-grab items-center justify-between border-b border-amber-900/20 bg-[#ffe878] px-2 active:cursor-grabbing" onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: position.x, y: position.y, startX: e.clientX, startY: e.clientY } }} onPointerMove={(e) => { const d = drag.current; if (!d) return; const next = { x: d.x + (e.clientX - d.startX) / scale, y: d.y + (e.clientY - d.startY) / scale }; setPosition(next) }} onPointerUp={(e) => { const d = drag.current; if (!d) return; drag.current = null; const x = d.x + (e.clientX - d.startX) / scale; const y = d.y + (e.clientY - d.startY) / scale; setPosition({ x, y }); onUpdate(note.noteId, { x, y }) }} onPointerCancel={() => { drag.current = null }}>
      <span className="text-xs font-semibold">メモ</span><button type="button" aria-label="メモを削除" className="p-1 hover:bg-amber-900/10" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(note.noteId) }}><Trash2 size={15} /></button>
    </header>
    <textarea aria-label="メモの内容" className="min-h-0 flex-1 resize-none bg-transparent p-3 text-sm leading-5 outline-none placeholder:text-ink/45" placeholder="メモを書く…" maxLength={2000} value={content} onChange={(e) => setContent(e.target.value)} onBlur={() => { if (content !== note.content) onUpdate(note.noteId, { content }) }} onPointerDown={(e) => e.stopPropagation()} />
  </article>
}
