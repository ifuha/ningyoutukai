import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react'
import { Check, ChevronDown } from 'lucide-react'

// フォームの部品。ブラウザ標準の見た目(選択欄の矢印、チェックボックス)に頼らず、テーマの色と寸法で描く。
// どちらも、ネイティブの `select` / `input[type=checkbox]` をそのまま使う(キーボード・スクリーンリーダー・フォームの送信は、標準のまま)。見た目だけを置き換える

/**
 * 選択欄。標準の矢印(`appearance`)をやめて、テーマの矢印(`ChevronDown`)を右端に重ねる。
 * `className` は、`select` 自身に付く(枠・背景・高さなど)。右に矢印の分の余白(`pr-9`)を足す
 */
export function SelectBox({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...props} className={`${className} appearance-none pr-9`}>
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center opacity-70"
      >
        <ChevronDown size={16} />
      </span>
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
