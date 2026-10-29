import { useEffect } from 'react'
import { X } from 'lucide-react'
import { IconButton } from '#/components/icon-button'

// セクションの操作が失敗したときの通知(1 行)。`role="alert"` で、数秒で自動的に閉じる(×でも閉じられる)
// 既存のエラー表示(`border-l border-line pl-3 text-m`)の流儀に合わせる
const AUTO_DISMISS_MS = 6000

export function SectionNotice({
  id,
  message,
  onDismiss,
}: {
  /** 通知ごとに変わる番号(同じ文が続いても、閉じるまでの時間を数え直す) */
  id: number
  message: string
  onDismiss: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
    // onDismiss は毎回新しい関数でも、時間を数え直さない(id が変わったときだけ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  return (
    <p
      role="alert"
      className="flex items-center gap-3 border-l border-line bg-surface/90 px-3 py-2 text-m"
    >
      <span>ERR {message}</span>
      <IconButton
        icon={X}
        label="閉じる"
        size="sm"
        side="left"
        onClick={onDismiss}
        className="shrink-0 border border-line px-1.5 leading-none hover:bg-side-item"
      >
        ×
      </button>
    </p>
  )
}
