import { Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { IconButton } from '#/components/icon-button'

// コメントを書く入力欄。ツールバーからコメントを画面に置いた(ドロップした)位置に出る。
// 「コメントする」で保存し、「やめる」か Esc で、保存せずに閉じる。保存に失敗したら、理由を出して、書いた内容は残す(やり直せる)
// 書いている間(開いている間)は、親に伝える。編集中は、セクションなど他の操作を止める(メモと同じ)
export function CommentDraft({
  x,
  y,
  offsetX = 0,
  offsetY = 0,
  onSubmit,
  onCancel,
  onEditingChange,
}: {
  x: number
  y: number
  offsetX?: number
  offsetY?: number
  onSubmit: (content: string) => Promise<void>
  onCancel: () => void
  onEditingChange?: (editing: boolean) => void
}) {
  const [content, setContent] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editingRef = useRef(onEditingChange)
  editingRef.current = onEditingChange
  useEffect(() => {
    editingRef.current?.(true)
    return () => editingRef.current?.(false)
  }, [])

  const submit = async () => {
    const text = content.trim()
    if (!text || pending) return
    setPending(true)
    setError(null)
    try {
      await onSubmit(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。時間をおいて再度お試しください')
      setPending(false)
    }
  }

  return (
    <form
      data-no-deselect
      data-comment-draft=""
      aria-label="コメントを書く"
      className="absolute z-30 w-64 shadow-box bg-panel p-3 text-ink"
      style={{ left: x + offsetX, top: y + offsetY }}
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <textarea
        aria-label="コメントの内容"
        autoFocus
        rows={4}
        maxLength={2000}
        placeholder="コメントを書く…"
        value={content}
        disabled={pending}
        onChange={(e) => setContent(e.target.value)}
        className="block w-full resize-none bg-transparent p-1 text-m outline-none shadow-box placeholder:text-ink/45"
      />
      {error && (
        <p role="alert" className="mt-2 text-s text-danger">
          {error}
        </p>
      )}
      <p className="mt-2 text-s text-ink/60">投稿すると、メンバーにメールで知らせます</p>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <IconButton icon={X} label="やめる" showLabel size="sm" variant="outline" disabled={pending} onClick={onCancel} />
        <IconButton
          icon={Send}
          label={pending ? '送信中…' : 'コメントする'}
          showLabel
          size="sm"
          variant="solid"
          type="submit"
          disabled={pending || !content.trim()}
        />
      </div>
    </form>
  )
}
