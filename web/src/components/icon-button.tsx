import type { ButtonHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'

// アイコンだけのボタン。文字の代わりにアイコンを出し、ホバー(とキーボードでのフォーカス)で、何のボタンかを示すツールチップを出す。
// - `label` は、ボタンの名前(`aria-label`)。スクリーンリーダーと、ツールチップの文字になる
// - `tip` を渡すと、ツールチップの文字だけ変える(例: 押せない理由「リーダーのみ」)。名前(`label`)は変わらない
// - ツールチップは見た目だけ(`aria-hidden`)。名前は `aria-label` が受け持つ
// - 押せないボタンの上でも、ツールチップは出る(理由を示せる)
// ツールチップは、周りの `overflow` で切れることがある。切れる所では `side` を変える
// - `showLabel` を付けると、アイコンの右に文字(`label`)も出す(「プロダクト作成」など、主役の動作向け)。
//   文字が見えているので、ツールチップは出さない(`tip` を渡したときだけ出す)。`block` で横幅いっぱいにする

export type IconButtonVariant = 'plain' | 'outline' | 'solid'
export type IconButtonSize = 'sm' | 'md' | 'lg'
export type TipSide = 'top' | 'bottom' | 'left' | 'right'

const variantClass: Record<IconButtonVariant, string> = {
  // 枠なし。ホバーで背景が付く
  plain: 'hover:bg-side-item',
  // 細い枠(落ち着いた色。アプリのボタンの流儀)
  outline: 'border border-line hover:bg-side-item',
  // 主役。文字色の塗り
  solid: 'border border-ink bg-ink text-surface hover:opacity-80',
}

// 押された状態(切り替えのボタン)
const pressedClass = 'bg-ink text-surface hover:bg-ink'

const sizeClass: Record<IconButtonSize, { box: string; labeled: string; icon: number }> = {
  sm: { box: 'size-8', labeled: 'h-8 gap-2 px-3', icon: 20 },
  md: { box: 'size-10', labeled: 'h-10 gap-2 px-4', icon: 24 },
  lg: { box: 'size-12', labeled: 'h-12 gap-3 px-5', icon: 28 },
}

const sideClass: Record<TipSide, string> = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2',
}

export function IconButton({
  icon: Icon,
  label,
  tip,
  variant = 'plain',
  size = 'md',
  side = 'top',
  pressed,
  showLabel = false,
  block = false,
  className = '',
  type = 'button',
  ...rest
}: {
  icon: LucideIcon
  label: string
  tip?: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  side?: TipSide
  /** 押された見た目にする(切り替えのボタン)。省略は、切り替えではない */
  pressed?: boolean
  /** アイコンの右に、文字(`label`)も出す。文字が見えるので、ツールチップは `tip` を渡したときだけ出す */
  showLabel?: boolean
  /** 横幅いっぱいにする */
  block?: boolean
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children' | 'title'>) {
  const { box, labeled, icon } = sizeClass[size]
  const hasTip = !showLabel || tip !== undefined
  return (
    <span className={`group/tip relative ${block ? 'flex w-full' : 'inline-flex shrink-0'}`}>
      <button
        type={type}
        aria-label={label}
        aria-pressed={pressed}
        {...rest}
        className={`flex ${showLabel ? labeled : box} ${block ? 'w-full' : ''} cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${variantClass[variant]} ${pressed ? pressedClass : ''} ${className}`}
      >
        <Icon aria-hidden="true" size={icon} />
        {showLabel && <span className="text-m font-medium">{label}</span>}
      </button>
      {hasTip && (
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute z-50 whitespace-nowrap bg-ink px-2 py-1 text-s text-surface opacity-0 transition-opacity duration-100 group-has-[:focus-visible]/tip:opacity-100 group-hover/tip:opacity-100 group-hover/tip:delay-300 ${sideClass[side]}`}
      >
        {tip ?? label}
      </span>
      )}
    </span>
  )
}
