import { LockKeyhole, TriangleAlert } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import type { LockNotice } from '#/lib/document-tree'

// 編集ロックの案内(文書のダイアログの上に出す)。解除の 1 分前の予告、他の人が編集中、外れた、を知らせる。
// 外れたときは、「ロックを取り直す」を出す(だれも取っていなければ、続けて編集できる)
export function LockNoticeBanner({ notice, onReacquire }: { notice: LockNotice; onReacquire: () => void }) {
  if (!notice) return null
  const Icon = notice.tone === 'info' ? LockKeyhole : TriangleAlert
  return (
    <div
      // 予告と解除は、すぐ気づいてほしいので alert。他の人が編集中は、状態の知らせ(status)
      role={notice.tone === 'info' ? 'status' : 'alert'}
      data-lock-notice={notice.tone}
      className={`flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-m ${notice.tone === 'error' ? 'text-danger' : ''} ${notice.tone === 'warn' ? 'bg-side-item font-medium' : ''}`}
    >
      <Icon size={18} aria-hidden="true" className="shrink-0" />
      <p className="min-w-0 flex-1">{notice.message}</p>
      {notice.canReacquire && <IconButton icon={LockKeyhole} label="ロックを取り直す" showLabel size="sm" variant="outline" onClick={onReacquire} />}
    </div>
  )
}
