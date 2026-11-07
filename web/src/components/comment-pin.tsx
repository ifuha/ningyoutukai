import { Check, MessageSquare, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { IconButton } from '#/components/icon-button'
import type { ProductComment, ProductCommentPatch } from '#/lib/comment-api'
import { useCanvasView } from '#/lib/canvas-view'

// コメントのピン(画面の座標に置く)。**ホバー(とキーボードのフォーカス)で、コメントの本文のカードが開く**。押すと開いたままにする(もう一度押すと閉じる。タッチの操作はこちら)。見られるのは参加者全員
// - 動かす: リーダーだけ。ピンをドラッグする(押しただけ = 動いていないときは、開閉)。動かしたら座標を保存する
// - 編集・削除: リーダーだけ(API の `canEdit`)。カードの「編集」「削除」から。削除は 2 段階(「削除」→「削除する」)
// - 編集中(文字入力欄にフォーカスがある間)は、親に伝える。編集中は、セクションなど他の操作を止める(メモと同じ)
// ピンは、作成者のアバター(なければ名前の頭文字、名前もなければコメントのアイコン)の丸。本文のカードにも、アバターと名前を出す
// ボタンは、アイコンだけ(名前は、ホバーのツールチップと `aria-label`)
// メモ(付箋、黒)とは見た目を変える: 丸いピン(`bg-panel` + 枠)と、本文のカード(`bg-panel`)
export function CommentPin({
  comment,
  offsetX = 0,
  offsetY = 0,
  onUpdate,
  onDelete,
  onEditingChange,
  defaultOpen = false,
}: {
  comment: ProductComment
  offsetX?: number
  offsetY?: number
  onUpdate: (id: number, patch: ProductCommentPatch) => void
  onDelete: (id: number) => void
  onEditingChange?: (editing: boolean) => void
  defaultOpen?: boolean
}) {
  const { scale } = useCanvasView()
  // 押して開いたままにしているか(`pinned`)、ホバー・フォーカスしているか(`hover`)。どちらかなら、カードを出す。編集・削除の確認の途中は、閉じない
  const [pinned, setPinned] = useState(defaultOpen)
  const [hover, setHover] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [draft, setDraft] = useState(comment.content)
  const drag = useRef<{ x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null)
  // ドラッグで動かした直後の click は、開閉にしない
  const justDragged = useRef(false)
  const [position, setPosition] = useState({ x: comment.x, y: comment.y })
  const canEdit = comment.canEdit
  const open = pinned || hover || editing || confirmingDelete

  const editingRef = useRef(onEditingChange)
  editingRef.current = onEditingChange
  // 編集を始めた・終えたときだけ伝える(編集していないピンが、他のメモの編集中の状態を、上書きしないように)
  const wasEditing = useRef(false)
  useEffect(() => {
    if (editing || wasEditing.current) editingRef.current?.(editing)
    wasEditing.current = editing
  }, [editing])
  useEffect(() => () => {
    if (wasEditing.current) editingRef.current?.(false)
  }, [])

  const positionAt = (e: { clientX: number; clientY: number }) => {
    const d = drag.current
    return d ? { x: d.x + (e.clientX - d.startX) / scale, y: d.y + (e.clientY - d.startY) / scale } : null
  }

  const save = () => {
    const content = draft.trim()
    setEditing(false)
    if (content && content !== comment.content) onUpdate(comment.commentId, { content })
    else setDraft(comment.content)
  }

  return (
    <article
      data-no-deselect
      data-comment-pin=""
      aria-label="コメント"
      className="absolute z-20"
      style={{ left: position.x + offsetX, top: position.y + offsetY }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHover(false)
      }}
    >
      <button
        type="button"
        aria-label={pinned ? 'コメントを閉じる' : 'コメントを開く'}
        aria-expanded={open}
        className={`flex size-8 touch-none select-none items-center justify-center overflow-hidden rounded-full shadow-box bg-panel text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
        onClick={() => {
          if (justDragged.current) {
            justDragged.current = false
            return
          }
          setPinned((p) => !p)
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (!canEdit || e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: position.x, y: position.y, startX: e.clientX, startY: e.clientY, moved: false }
        }}
        onPointerMove={(e) => {
          const next = positionAt(e)
          if (!next || !drag.current) return
          if (Math.hypot(next.x - drag.current.x, next.y - drag.current.y) * scale >= 3) drag.current.moved = true
          if (drag.current.moved) setPosition(next)
        }}
        onPointerUp={(e) => {
          const start = drag.current
          const next = positionAt(e)
          drag.current = null
          if (!start || !next || !start.moved) return
          justDragged.current = true
          setPosition(next)
          onUpdate(comment.commentId, next)
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        <CommentAvatar name={comment.authorName} src={comment.authorAvatarUrl} fallback={<MessageSquare size={18} aria-hidden="true" />} />
      </button>
      {open && (
        <div
          role="group"
          aria-label="コメントの内容"
          className="absolute top-full left-0 z-10 mt-1 w-64 cursor-default shadow-box bg-panel p-3 text-ink"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-box">
              <CommentAvatar name={comment.authorName} src={comment.authorAvatarUrl} fallback={<MessageSquare size={14} aria-hidden="true" />} />
            </span>
            <p data-comment-author="" className="min-w-0 truncate text-s font-medium">
              {comment.authorName ?? '退会したユーザー'}
            </p>
          </div>
          {editing ? (
            <textarea
              aria-label="コメントの内容を編集"
              autoFocus
              rows={4}
              maxLength={2000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setDraft(comment.content)
                  setEditing(false)
                }
              }}
              className="block w-full resize-none bg-transparent p-1 text-m outline-none shadow-box"
            />
          ) : (
            <p data-comment-content="" className="text-m break-words whitespace-pre-wrap">
              {comment.content}
            </p>
          )}
          {canEdit && (
            <div className="mt-2 flex items-center justify-end gap-1.5">
              {editing ? (
                <>
                  <IconButton icon={Check} label="保存" size="sm" variant="solid" disabled={!draft.trim()} onClick={save} />
                  <IconButton
                    icon={X}
                    label="やめる"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDraft(comment.content)
                      setEditing(false)
                    }}
                  />
                </>
              ) : confirmingDelete ? (
                <>
                  <IconButton icon={Trash2} label="削除する" size="sm" variant="danger-solid" onClick={() => onDelete(comment.commentId)} />
                  <IconButton icon={X} label="やめる" size="sm" variant="outline" onClick={() => setConfirmingDelete(false)} />
                </>
              ) : (
                <>
                  <IconButton icon={Pencil} label="編集" size="sm" onClick={() => setEditing(true)} />
                  <IconButton icon={Trash2} label="削除" size="sm" variant="danger" onClick={() => setConfirmingDelete(true)} />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

/** 作成者のアバター。画像があれば画像、なければ名前の頭文字、名前もなければ代わりの表示(親の丸の中いっぱいに出す) */
function CommentAvatar({ name, src, fallback }: { name: string | null; src: string | null; fallback: ReactNode }) {
  if (src) return <img src={src} alt="" className="size-full object-cover" />
  const initial = name ? ([...name][0] ?? null) : null
  return initial ? (
    <span aria-hidden="true" data-comment-initial="" className="text-s font-bold">
      {initial}
    </span>
  ) : (
    <>{fallback}</>
  )
}
