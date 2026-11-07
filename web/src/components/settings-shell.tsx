import { useEffect, useId, useState, type ReactNode } from 'react'
import { X, type LucideIcon } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { Modal } from '#/components/modal'

export type SettingsShellSection = {
  /** 項目を区別する名前(重複させない) */
  id: string
  /** 左の一覧と、右の見出しに出す名前 */
  label: string
  icon: LucideIcon
  /** 危険な操作(削除など)のカテゴリか。true なら、左の一覧の項目と、右の見出しを赤にする */
  danger?: boolean
  /** 右に出す中身 */
  render: () => ReactNode
}

/** 選んでいるカテゴリを決める。id が見つからなければ、先頭 */
export function resolveSection<T extends { id: string }>(sections: readonly T[], activeId: string): T {
  return sections.find((s) => s.id === activeId) ?? sections[0]!
}

// 設定系のモーダルの共通の枠(ユーザー設定・プロダクト設定)。画面いっぱい気味に出す(Discord の設定と同じ形)。
// 左にカテゴリの一覧(`title` が左上の見出し)、右に選んだカテゴリの中身。スマホ幅では、カテゴリを上に横並びにする。
// 閉じるのは、「閉じる」ボタン・Esc・背景のクリック。閉じたら、選んでいるカテゴリは先頭に戻る
export function SettingsShell({
  open,
  onClose,
  title,
  ariaLabel,
  sections,
}: {
  open: boolean
  onClose: () => void
  /** 左上の見出し(「設定」「プロダクト設定」) */
  title: string
  /** カテゴリの一覧(`nav`)の aria-label */
  ariaLabel: string
  sections: readonly SettingsShellSection[]
}) {
  const [activeId, setActiveId] = useState(sections[0]!.id)
  const headingId = useId()
  const active = resolveSection(sections, activeId)

  useEffect(() => {
    if (!open) setActiveId(sections[0]!.id)
  }, [open, sections])

  return (
    <Modal open={open} onClose={onClose} size="full">
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        <nav
          aria-label={ariaLabel}
          className="shrink-0 border-b border-line bg-side md:w-60 md:overflow-y-auto md:border-r md:border-b-0"
        >
          <p className="hidden px-4 pt-4 pb-2 text-l font-semibold md:block">{title}</p>
          <ul className="flex gap-1 overflow-x-auto p-2 md:flex-col">
            {sections.map((s) => (
              <li key={s.id} className="shrink-0 md:shrink">
                <button
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  aria-current={s.id === active.id ? 'page' : undefined}
                  className={`flex h-10 w-full cursor-pointer items-center gap-2 px-3 text-left text-m hover:bg-side-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink aria-[current=page]:bg-side-item${s.danger ? ' text-danger' : ''}`}
                >
                  <s.icon aria-hidden="true" size={20} className="shrink-0" />
                  <span className="truncate">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <section aria-labelledby={headingId} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-3">
            <h2 id={headingId} className={`text-l font-bold${active.danger ? ' text-danger' : ''}`}>
              {active.label}
            </h2>
            <IconButton
              icon={X}
              label="閉じる"
              side="left"
              variant="outline"
              className="bg-panel"
              onClick={onClose}
            />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl space-y-6">{active.render()}</div>
          </div>
        </section>
      </div>
    </Modal>
  )
}
