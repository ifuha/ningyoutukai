import { Settings } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { useEffect, useRef, useState } from 'react'

export type ManageMenuItem = { label: string; onSelect: () => void }

// 見出しの「管理」メニュー。項目を足すときは items に 1 行足す。項目を押すとメニューを閉じてから onSelect を呼ぶ。
// 項目が 1 つだけ(メンバー向け)のときは、メニューにせず、その項目をボタンとして直接出す
export function ManageMenu({ items }: { items: ManageMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (items.length === 1) {
    return (
      <IconButton
        icon={Settings}
        label={items[0].label}
        variant="outline"
        side="bottom"
        onClick={items[0].onSelect}
      />
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <span
        ref={(el) => {
          buttonRef.current = el?.querySelector('button') ?? null
        }}
      >
        <IconButton
          icon={Settings}
          label="管理"
          variant="outline"
          side="bottom"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        />
      </span>
      {open && (
        <div
          role="menu"
          className="absolute left-0 z-10 mt-1 flex min-w-40 flex-col border-2 border-outline bg-secondary"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                // 項目は閉じると消えるので、先に「管理」ボタンへフォーカスを移す(ダイアログを閉じたときの戻り先)
                buttonRef.current?.focus()
                setOpen(false)
                item.onSelect()
              }}
              className="h-9 whitespace-nowrap px-3 text-left text-m text-outline hover:bg-ink hover:text-surface focus-visible:bg-ink focus-visible:text-surface focus-visible:outline-none"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
