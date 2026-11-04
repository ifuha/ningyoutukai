import { useState } from 'react'
import { X } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { Modal } from '#/components/modal'
import { settingsSections } from '#/components/settings-sections'

// 設定のモーダル。画面いっぱい気味に出す(Discord のユーザー設定と同じ形)。
// 左にカテゴリの一覧、右に選んだカテゴリの中身。スマホ幅では、カテゴリを上に横並びにする。
// 閉じるのは、「閉じる」ボタン・Esc・背景のクリック。カテゴリは `settings-sections.tsx` に足す
export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [activeId, setActiveId] = useState(settingsSections[0]!.id)
  const active =
    settingsSections.find((s) => s.id === activeId) ?? settingsSections[0]!

  return (
    <Modal open={open} onClose={onClose} size="full">
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        <nav
          aria-label="設定の項目"
          className="shrink-0 border-b border-line bg-side md:w-60 md:overflow-y-auto md:border-r md:border-b-0"
        >
          <p className="hidden px-4 pt-4 pb-2 text-l font-semibold md:block">
            設定
          </p>
          <ul className="flex gap-1 overflow-x-auto p-2 md:flex-col">
            {settingsSections.map((s) => (
              <li key={s.id} className="shrink-0 md:shrink">
                <button
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  aria-current={s.id === active.id ? 'page' : undefined}
                  className="flex h-10 w-full cursor-pointer items-center gap-2 px-3 text-left text-m hover:bg-side-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink aria-[current=page]:bg-side-item"
                >
                  <s.icon aria-hidden="true" size={20} className="shrink-0" />
                  <span className="truncate">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <section
          aria-labelledby="settings-title"
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-3">
            <h2 id="settings-title" className="text-l font-bold">
              {active.label}
            </h2>
            <IconButton
              icon={X}
              label="閉じる"
              side="left"
              variant="outline"
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