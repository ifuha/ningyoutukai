import { useCallback, useEffect, useRef, useState } from 'react'
import { NoteContextMenu } from '#/components/note-context-menu'
import type { ProductNote, ProductNotePatch } from '#/lib/memo-api'
import { useCanvasView } from '#/lib/canvas-view'
import { useLongPress } from '#/lib/use-long-press'
import { labelTextRect, labelTypography, titleFactor } from '#/lib/section-label'

// メモ(付箋)。見た目は黒: 背景は黒(不透明。後ろが透けない)、文字は白、枠は実線(1px、白の 25%)。タイトルの帯や、ゴミ箱のボタンは持たない
// - 動かす: 入力欄のまわりの余白をつかんでドラッグ(編集中の入力欄の中は、文字の選択になる)
// - 右クリック(スマホは長押し)でメニュー: 編集・削除・公開 / 非公開の切り替え(`NoteContextMenu`)。誰ができるかは API が決める(`note.canEdit`)。変更できないメモ(他の人のメモ)は、メニューを出さず、動かせない
// - 内容の入力欄は、ふだんは読み取り専用。メニューの「編集」で編集できる状態にする(追加したばかりのメモ = `autoEdit` は、すぐ編集できる)。フォーカスが外れると、読み取り専用に戻る
/** メモの幅(px。`w-56`)と、枠線の太さ(px。`border`)。作成者の名前の位置に使う */
const NOTE_WIDTH_PX = 224
const NOTE_BORDER_PX = 1

export function StickyNote({ note, offsetX = 0, offsetY = 0, selected = false, canStartDrag, onUpdate, onDelete, onEditingChange, autoEdit = false }: { note: ProductNote; offsetX?: number; offsetY?: number; /** 選択中(選択の輪を付ける) */ selected?: boolean; /** この押しで、動かしてよいか。Space を押している間は false にして、パンに譲る */ canStartDrag?: () => boolean; onUpdate: (id: string, patch: ProductNotePatch) => void; onDelete: (id: string) => void; onEditingChange?: (editing: boolean) => void; autoEdit?: boolean }) {
  const { scale } = useCanvasView()
  // 内容を編集中(文字入力欄にフォーカスがある間)を親に伝える。編集中は、セクションなど他の操作を止める。メモが消えるときも、編集中を終わらせる
  const editingRef = useRef(onEditingChange)
  editingRef.current = onEditingChange
  useEffect(() => () => editingRef.current?.(false), [])
  // 編集できる状態か。autoEdit が true になったとき(追加したばかりのメモ)と、メニューの「編集」で true になる。フォーカスが外れると false に戻る
  const [editing, setEditing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (autoEdit) setEditing(true)
  }, [autoEdit])
  // 編集できる状態になったら、内容の入力欄にフォーカスして、末尾にカーソルを置く
  useEffect(() => {
    const el = textareaRef.current
    if (!editing || !el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing])
  // メニュー(押した位置 = 画面の座標)。右クリックと、長押しで開く
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  // 長押し(タッチで 500ms。指が 8px 動いたら取り消す)。成立したら、ドラッグを止めてメニューを開く
  const longPress = useLongPress(({ x, y }) => {
    drag.current = null
    setMenu({ x, y })
  })
  const isPublic = note.isPublic ?? false
  // 見ている人が、変更・削除・公開の切り替えをできるか(API の `canEdit`)。できないメモは、メニューを出さず、動かせない
  const canEdit = note.canEdit
  // 作成者の名前: セクションの名前と同じ位置(枠の外側の上辺の上、左)と大きさ。縮小しても、読める大きさを保つ(`section-box.tsx` と同じ)
  const factor = titleFactor(scale)
  const authorRect = labelTextRect(NOTE_WIDTH_PX, factor)
  const [content, setContent] = useState(note.content)
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)
  const [position, setPosition] = useState({ x: note.x, y: note.y })

  const positionAt = (e: { clientX: number; clientY: number }) => {
    const d = drag.current
    return d ? { x: d.x + (e.clientX - d.startX) / scale, y: d.y + (e.clientY - d.startY) / scale } : null
  }

  return (
    <>
      <article
        data-no-deselect
        data-sticky-note=""
        data-note-id={note.noteId}
        data-selected={selected || undefined}
        tabIndex={0}
        aria-label="メモ"
        className={`absolute z-20 flex h-52 w-56 ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} touch-none select-none flex-col border border-white/25 bg-black p-2 text-white outline-none focus-visible:border-white/60 [-webkit-touch-callout:none] ${
          selected ? 'ring-2 ring-ink' : ''
        }`}
        style={{ left: position.x + offsetX, top: position.y + offsetY }}
        onContextMenu={(e) => {
          // ブラウザ標準のメニューは出さない
          e.preventDefault()
          e.stopPropagation()
          longPress.cancel()
          if (!canEdit) return
          // キーボード(メニューキー・Shift + F10)では座標が 0 になるので、メモの左上にする
          const rect = e.currentTarget.getBoundingClientRect()
          const keyboard = e.clientX === 0 && e.clientY === 0
          setMenu({ x: keyboard ? rect.left : e.clientX, y: keyboard ? rect.top : e.clientY })
        }}
        onPointerDown={(e) => {
          // 変更できないメモ(他の人のメモ)は、動かさない・長押しのメニューも出さない。
          // 押下は止めない(範囲選択・パンに譲る)
          if (!canEdit) return
          // 右ボタンは、メニュー(contextmenu)のためで、動かさない
          if (e.button !== 0) return
          // 編集中の入力欄の中は、文字の選択のために、動かさない
          if (editing && e.target instanceof HTMLTextAreaElement) return
          // Space を押している間は、動かさない(パンに譲る。押下を止めない)
          if (canStartDrag && !canStartDrag()) return
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: position.x, y: position.y, startX: e.clientX, startY: e.clientY }
          // タッチは、長押しでメニューを開く(指が動いたら取り消す)
          longPress.start(e)
        }}
        onPointerMove={(e) => {
          longPress.move(e)
          const next = positionAt(e)
          if (next) setPosition(next)
        }}
        onPointerUp={(e) => {
          longPress.cancel()
          const next = positionAt(e)
          const start = drag.current
          if (!next || !start) return
          drag.current = null
          setPosition(next)
          // 押しただけ(動いていない)ときは、保存しない
          if (Math.hypot(next.x - start.x, next.y - start.y) >= 1) onUpdate(note.noteId, next)
        }}
        onPointerCancel={() => {
          longPress.cancel()
          drag.current = null
        }}
      >
        {note.authorName && (
          <span
            data-note-author=""
            title={note.authorName}
            className="pointer-events-none absolute truncate text-ink"
            style={{
              // 絶対配置の基準は枠線の内側。外側の左上が原点の位置から、枠線の分だけ戻す
              left: authorRect.left - NOTE_BORDER_PX,
              top: authorRect.top - NOTE_BORDER_PX,
              width: authorRect.width,
              height: authorRect.height,
              ...labelTypography(factor),
            }}
          >
            {note.authorName}
          </span>
        )}
        <textarea
          ref={textareaRef}
          aria-label="メモの内容"
          readOnly={!editing}
          // 読み取り専用の間は、Tab で入らず、押してもフォーカスしない(メモを動かす操作になる)
          tabIndex={editing ? 0 : -1}
          onMouseDown={(e) => {
            if (!editing) e.preventDefault()
          }}
          className={`min-h-0 flex-1 resize-none ${editing ? 'cursor-text select-text' : 'cursor-[inherit]'} bg-transparent p-1 text-sm leading-5 outline-none placeholder:text-white/45`}
          placeholder="メモを書く…"
          maxLength={2000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={() => onEditingChange?.(true)}
          onBlur={() => {
            setEditing(false)
            onEditingChange?.(false)
            if (content !== note.content) onUpdate(note.noteId, { content })
          }}
        />
      </article>
      {menu && (
        <NoteContextMenu
          x={menu.x}
          y={menu.y}
          isPublic={isPublic}
          onEdit={() => setEditing(true)}
          onDelete={() => onDelete(note.noteId)}
          onTogglePublic={() => onUpdate(note.noteId, { isPublic: !isPublic })}
          onClose={closeMenu}
        />
      )}
    </>
  )
}
