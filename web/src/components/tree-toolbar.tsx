import { Hand, MousePointer2, Search, SquareDashed, StickyNote, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ツリーの画面の下の中央に置く、道具のバー(Figma の `nav`)
// 寸法(Figma): 枠 410 × 86(枠線 2px)、ボタン 60 × 60(アイコン 24px + 文字 12px)、ボタンと区切り線の間隔 6px、区切り線 2 × 30
//   内側の幅 406 = ボタン 6 × 60 + 区切り線 2 × 2 + 間隔 7 × 6。縦は、内側 82 の中央にボタン(上下 11px)
// 並びは「選択・移動 | メンバー・セクション・メモ | 検索」
// 第 1 段階(表示のみ): 選択と移動は、押された見た目を切り替えるだけ(キャンバスのドラッグは、どちらでもこれまでどおり動く)。
//   メンバーは、メンバーの管理を開く(リーダーのみ)。セクション・メモ・検索は、無効の見た目(準備中)

export type TreeMode = 'select' | 'pan'

const buttonClass =
  'flex size-[60px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 text-xs hover:bg-side-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

function ToolButton({
  icon: Icon,
  label,
  pressed,
  disabled,
  title,
  onClick,
}: {
  icon: LucideIcon
  label: string
  /** 押された見た目にする(切り替えのボタン)。省略は、切り替えではない */
  pressed?: boolean
  disabled?: boolean
  title?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`${buttonClass} ${pressed ? 'bg-ink text-surface hover:bg-ink' : ''}`}
    >
      <Icon aria-hidden="true" size={24} />
      <span>{label}</span>
    </button>
  )
}

function Divider() {
  return (
    <span
      aria-hidden="true"
      className="h-[30px] w-0.5 shrink-0 bg-ink/50"
    />
  )
}

export function TreeToolbar({
  mode,
  onModeChange,
  onOpenMembers,
}: {
  mode: TreeMode
  onModeChange: (mode: TreeMode) => void
  /** メンバーの管理を開く。渡さない(リーダーでない)ときは、無効の見た目 */
  onOpenMembers?: () => void
}) {
  return (
    <div
      role="toolbar"
      aria-label="ツリーの道具"
      className="flex h-[86px] w-[410px] max-w-[calc(100vw-1.5rem)] items-center gap-1.5 overflow-x-auto border-2 border-ink bg-surface/90"
    >
      <ToolButton
        icon={MousePointer2}
        label="選択"
        pressed={mode === 'select'}
        onClick={() => onModeChange('select')}
      />
      <ToolButton
        icon={Hand}
        label="移動"
        pressed={mode === 'pan'}
        onClick={() => onModeChange('pan')}
      />
      <Divider />
      <ToolButton
        icon={User}
        label="メンバー"
        disabled={!onOpenMembers}
        title={onOpenMembers ? 'メンバーの管理' : 'リーダーのみ'}
        onClick={onOpenMembers}
      />
      <ToolButton icon={SquareDashed} label="セクション" disabled title="準備中" />
      <ToolButton icon={StickyNote} label="メモ" disabled title="準備中" />
      <Divider />
      <ToolButton icon={Search} label="検索" disabled title="準備中" />
    </div>
  )
}
