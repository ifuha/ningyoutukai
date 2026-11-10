import { Check, Ellipsis, MessageSquare, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ContextMenu } from '#/components/context-menu'
import { IconButton } from '#/components/icon-button'
import type { ProductComment, ProductCommentPatch } from '#/lib/comment-api'
import { commentMenuItems } from '#/lib/comment-menu'
import { commentScaleStyle } from '#/lib/comment-scale'
import { useCanvasView } from '#/lib/canvas-view'
import { useLongPress } from '#/lib/use-long-press'

// コメントのピン(画面の座標に置く)。見られるのは参加者全員
// - **ホバー(とキーボードのフォーカス)で、本文のカードが開く**(ふわっと出る。`.comment-card-in`)。押すと開いたままにする(もう一度押すと閉じる。タッチの操作はこちら)
// - **メニュー**: リーダーは、カードの右上の「…」ボタン、またはピン(とカード)の右クリック(スマホは長押し)で、「編集」「削除」のメニューを出す(`comment-menu.ts`)。誰ができるかは API が決める(`comment.canEdit`)
//   - 編集: カードの本文を入力欄にする(保存・やめる)
//   - 削除: カードに確認(「削除する」「やめる」)を出す。2 段階
// - **動かす**: リーダーは、ピンをマウスで掴んでドラッグする(メニューには「移動」を置かない)。離したら座標を保存する。押しただけ(動いていない)ときは、開閉
// - 編集の間は、親に伝える。編集中は、セクションなど他の操作を止める(メモと同じ)
// ピンは、作成者のアバター(なければ名前の頭文字、名前もなければコメントのアイコン)の丸。ボタンは、アイコンだけ(名前は、ホバーのツールチップと `aria-label`)
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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null)
  // ドラッグで動かした直後の click は、開閉にしない
  const justDragged = useRef(false)
  const [position, setPosition] = useState({ x: comment.x, y: comment.y })
  const canEdit = comment.canEdit
  const open = pinned || hover || editing || confirmingDelete

  // 長押し(タッチで 500ms。指が 8px 動いたら取り消す)。成立したら、ドラッグを止めてメニューを開く
  const longPress = useLongPress(({ x, y }) => {
    drag.current = null
    setMenu({ x, y })
  })

  // 編集を始めた・終えたときだけ、親に伝える(していないピンが、他のメモの編集中の状態を、上書きしないように)
  const busy = editing
  const editingRef = useRef(onEditingChange)
  editingRef.current = onEditingChange
  const wasBusy = useRef(false)
  useEffect(() => {
    if (busy || wasBusy.current) editingRef.current?.(busy)
    wasBusy.current = busy
  }, [busy])
  useEffect(() => () => {
    if (wasBusy.current) editingRef.current?.(false)
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
      style={{ left: position.x + offsetX, top: position.y + offsetY, ...commentScaleStyle(scale) }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHover(false)
      }}
      onContextMenu={(e) => {
        // ブラウザ標準のメニューは出さない。リーダーには、コメントのメニューを出す
        e.preventDefault()
        e.stopPropagation()
        longPress.cancel()
        if (!canEdit) return
        // キーボード(メニューキー・Shift + F10)では座標が 0 になるので、ピンの左上にする
        const rect = e.currentTarget.getBoundingClientRect()
        const keyboard = e.clientX === 0 && e.clientY === 0
        setMenu({ x: keyboard ? rect.left : e.clientX, y: keyboard ? rect.top : e.clientY })
      }}
    >
      <button
        type="button"
        aria-label={pinned ? 'コメントを閉じる' : 'コメントを開く'}
        aria-expanded={open}
        aria-haspopup={canEdit ? 'menu' : undefined}
        className={`flex size-8 touch-none select-none items-center justify-center overflow-hidden rounded-full shadow-box bg-panel text-ink outline-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
        // ブラウザ標準のドラッグ(画像・リンクの持ち出し)は始めない
        onDragStart={(e) => e.preventDefault()}
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
          // タッチは、長押しでメニューを開く(指が動いたら取り消す)
          longPress.start(e)
        }}
        onPointerMove={(e) => {
          longPress.move(e)
          const next = positionAt(e)
          if (!next || !drag.current) return
          if (Math.hypot(next.x - drag.current.x, next.y - drag.current.y) * scale >= 3) drag.current.moved = true
          if (drag.current.moved) setPosition(next)
        }}
        onPointerUp={(e) => {
          longPress.cancel()
          const start = drag.current
          const next = positionAt(e)
          drag.current = null
          if (!start || !next || !start.moved) return
          justDragged.current = true
          setPosition(next)
          onUpdate(comment.commentId, next)
        }}
        onPointerCancel={() => {
          longPress.cancel()
          drag.current = null
        }}
      >
        <CommentAvatar name={comment.authorName} src={comment.authorAvatarUrl} fallback={<MessageSquare size={18} aria-hidden="true" />} />
      </button>
      {open && (
        <div
          role="group"
          aria-label="コメントの内容"
          className="comment-card-in absolute top-full left-0 z-10 mt-1 w-64 cursor-default shadow-box bg-panel p-3 text-ink"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-box">
              <CommentAvatar name={comment.authorName} src={comment.authorAvatarUrl} fallback={<MessageSquare size={14} aria-hidden="true" />} />
            </span>
            <p data-comment-author="" className="min-w-0 flex-1 truncate text-s font-medium">
              {comment.authorName ?? '退会したユーザー'}
            </p>
            {canEdit && (
              <IconButton
                icon={Ellipsis}
                label="メニュー"
                size="sm"
                aria-haspopup="menu"
                // ボタンの左下に出す(右クリックと同じメニュー)
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setMenu({ x: rect.left, y: rect.bottom })
                }}
              />
            )}
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
          {canEdit && (editing || confirmingDelete) && (
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
              ) : (
                <>
                  <IconButton icon={Trash2} label="削除する" size="sm" variant="danger-solid" onClick={() => onDelete(comment.commentId)} />
                  <IconButton icon={X} label="やめる" size="sm" variant="outline" onClick={() => setConfirmingDelete(false)} />
                </>
              )}
            </div>
          )}
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label="コメントのメニュー"
          onClose={() => setMenu(null)}
          items={commentMenuItems({
            onEdit: () => {
              setDraft(comment.content)
              setEditing(true)
            },
            onDelete: () => setConfirmingDelete(true),
          })}
        />
      )}
    </article>
  )
}

/** 作成者のアバター。画像があれば画像、なければ名前の頭文字、名前もなければ代わりの表示(親の丸の中いっぱいに出す) */
function CommentAvatar({ name, src, fallback }: { name: string | null; src: string | null; fallback: ReactNode }) {
  // 画像は、ブラウザの標準で「ドラッグして持ち出せる」。ピンを掴んで動かすとき、画像のドラッグが始まって、ピンの操作が打ち切られるので、画像はドラッグさせない
  if (src) return <img src={src} alt="" draggable={false} className="pointer-events-none size-full object-cover select-none" />
  const initial = name ? ([...name][0] ?? null) : null
  return initial ? (
    <span aria-hidden="true" data-comment-initial="" className="text-s font-bold">
      {initial}
    </span>
  ) : (
    <>{fallback}</>
  )
}
