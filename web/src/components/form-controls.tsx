import { useEffect, useId, useRef, useState } from 'react'
import type { InputHTMLAttributes, KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'

// フォームの部品。ブラウザ標準の見た目(選択欄の矢印と一覧、チェックボックス)に頼らず、テーマの色と寸法で描く。

export type SelectOption = { value: string; label: string }

/**
 * 一覧が開いているときの、キーによる「選ばれている行」の動き(DOM に依存しない純粋関数)。
 * 上下キーは、端で止まる(ひと回りしない)。Home / End は先頭と末尾。動かないキーは、同じ値を返す。
 * 行がないとき(length が 0)は、0 を返す
 */
export function moveActive(current: number, key: string, length: number): number {
  if (length <= 0) return 0
  const last = length - 1
  const clamped = Math.min(last, Math.max(0, current))
  switch (key) {
    case 'ArrowDown':
      return Math.min(last, clamped + 1)
    case 'ArrowUp':
      return Math.max(0, clamped - 1)
    case 'Home':
      return 0
    case 'End':
      return last
    default:
      return clamped
  }
}

/** 1 文字のキー(タイプアヘッド)で、その文字で始まる最初の行を探す。現在の行の次から探し、なければ先頭から。見つからなければ -1 */
export function findByTypeahead(options: readonly SelectOption[], char: string, from: number): number {
  const c = char.toLocaleLowerCase()
  const n = options.length
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n
    if (options[idx]!.label.toLocaleLowerCase().startsWith(c)) return idx
  }
  return -1
}

/**
 * ドロップダウン(選択欄)。標準の `select` の矢印と一覧をやめて、ボタンと一覧(`listbox`)をテーマの色と寸法で描く。
 * - 開くボタンは `role="combobox"`。フォーカスは、ボタンに置いたまま、`aria-activedescendant` で、選ばれている行を示す
 * - 操作: クリック・Enter・Space・上下キーで開く / 開いているときは、上下キー・Home・End で動かし、Enter・Space で決める。Esc で閉じる(フォームのモーダルは、閉じない)。Tab・外側のクリックでも閉じる
 * - 一覧は、画面基準の位置(`fixed`)で、ボタンの真下に出す。モーダルの端で切れない。スクロール・画面の大きさの変更で閉じる
 * - ラベルは `<label htmlFor={id}>` で結べる(ボタンは、ラベルを付けられる要素)
 * `className` は、開くボタンに付く(枠・背景・高さなど)
 */
export function SelectMenu({
  id,
  value,
  options,
  onChange,
  disabled = false,
  className = '',
}: {
  id?: string
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)
  const rootRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  const openMenu = () => {
    if (disabled || options.length === 0) return
    const box = buttonRef.current?.getBoundingClientRect()
    if (box) setRect({ left: box.left, top: box.bottom + 4, width: box.width })
    setActive(Math.max(0, selectedIndex))
    setOpen(true)
  }
  const closeMenu = () => setOpen(false)
  const choose = (index: number) => {
    const option = options[index]
    if (option) onChange(option.value)
    closeMenu()
    buttonRef.current?.focus()
  }

  // 外側を押す・スクロール・画面の大きさが変わったら閉じる
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onResize = () => setOpen(false)
    // 一覧の中(長い一覧のスクロール)は、無視する。それ以外(モーダルや画面のスクロール)では、位置がずれるので閉じる
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  // 選ばれている行が、見える位置に来るようにする
  useEffect(() => {
    if (!open) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === 'Escape') {
      // モーダルの Esc(閉じる)に渡さない。一覧だけ閉じる
      e.preventDefault()
      e.stopPropagation()
      closeMenu()
    } else if (e.key === 'Tab') {
      closeMenu()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      setActive((a) => moveActive(a, e.key, options.length))
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const found = findByTypeahead(options, e.key, active)
      if (found >= 0) setActive(found)
    }
  }

  const optionId = (i: number) => `${listId}-${i}`

  return (
    <span ref={rootRef} className="relative block">
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onKeyDown}
        className={`${className} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? ''}</span>
        <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center opacity-70">
          <ChevronDown size={16} className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && rect && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          // 画面基準の位置。ボタンの真下に、同じ幅で出す(モーダルの端で切れない)
          // 枠は、内側の輪(shadow-box)ではなく、本物の枠(border)。強調した行の背景が、輪の上に重なって、枠が隠れるのを避ける
          style={{ left: rect.left, top: rect.top, width: rect.width }}
          className="fixed z-50 max-h-60 overflow-y-auto border border-line bg-panel py-1 text-m text-ink"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={optionId(i)}
              role="option"
              aria-selected={i === selectedIndex}
              // ボタンのフォーカスを奪わない(奪うと、キー操作が止まる)
              onPointerDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={`flex h-9 cursor-pointer items-center justify-between gap-2 px-3 ${i === active ? 'bg-side-item' : ''}`}
            >
              <span className="min-w-0 truncate">{o.label}</span>
              {i === selectedIndex && <Check aria-hidden="true" size={14} className="shrink-0" />}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

/**
 * チェックボックス。標準の見た目をやめて、16px の四角(枠は文字色、チェックを入れると文字色の塗りに、紙の色のチェック)にする。
 * 四角とチェックの印は、同じ 16px の箱の中央に重ねるので、位置がずれない
 */
export function CheckBox({
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <span className={`relative inline-flex size-4 shrink-0 ${className}`}>
      <input
        {...props}
        type="checkbox"
        className="peer size-4 cursor-pointer appearance-none border border-ink/60 bg-panel checked:border-ink checked:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden items-center justify-center text-surface peer-checked:flex"
      >
        <Check size={12} strokeWidth={3} />
      </span>
    </span>
  )
}
