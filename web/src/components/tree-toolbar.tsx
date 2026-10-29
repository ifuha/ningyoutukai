import { MousePointer2, Search, SquareDashed, StickyNote, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CanvasTool } from '#/lib/section-interaction-types'

// ツリーの画面の下の中央に置く、道具のバー(Figma の `nav`)
// 寸法: 高さ 60(枠線 1px)、ボタン 48 × 48(アイコン 24px + 文字 12px)、ボタンと区切り線の間隔 6px、区切り線 2 × 24
//   幅 282 = 内側 280(ボタン 5 × 48 + 区切り線 2 × 2 + 間隔 6 × 6)+ 枠線 2。縦は、内側 58 の中央にボタン(上下 5px)
//   Figma の 410 × 86 から、「移動」をなくし、ユーザーの指示で小さくした(バーが大きいため)
// 並びは「選択 | メンバー・セクション・メモ | 検索」
// 選択・セクションは、道具(モード)の切り替え(押された道具を強調する)。キャンバスのドラッグでの移動は、「セクション」以外ではいつでも動く。
//   セクションは、リーダーだけが使える(リーダーでなければ、押せない見た目)。選ぶと、キャンバスでドラッグして、セクションを置く(Esc か「選択」で戻る)
//   メンバーは、メンバーの管理を開く(リーダーのみ)。メモ・検索は、無効の見た目(準備中)

export type TreeMode = CanvasTool

const buttonClass =
  'flex size-12 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 text-s hover:bg-side-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

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
      className="h-6 w-0.5 shrink-0 bg-ink/50"
    />
  )
}

export function TreeToolbar({
  mode,
  onModeChange,
  onOpenMembers,
  canEditSections = false,
}: {
  mode: TreeMode
  onModeChange: (mode: TreeMode) => void
  /** メンバーの管理を開く。渡さない(リーダーでない)ときは、無効の見た目 */
  onOpenMembers?: () => void
  /** セクションを置ける(リーダー)か。false のときは、「セクション」が押せない見た目 */
  canEditSections?: boolean
}) {
  return (
    <div
      role="toolbar"
      aria-label="ツリーの道具"
      className="flex h-[60px] w-[282px] max-w-[calc(100vw-1.5rem)] items-center gap-1.5 overflow-x-auto border border-line bg-surface/90"
    >
      <ToolButton
        icon={MousePointer2}
        label="選択"
        pressed={mode === 'select'}
        onClick={() => onModeChange('select')}
      />
      <Divider />
      <ToolButton
        icon={User}
        label="メンバー"
        disabled={!onOpenMembers}
        title={onOpenMembers ? 'メンバーの管理' : 'リーダーのみ'}
        onClick={onOpenMembers}
      />
      <ToolButton
        icon={SquareDashed}
        label="セクション"
        pressed={mode === 'section'}
        disabled={!canEditSections}
        title={canEditSections ? 'セクションを置く(Esc で戻る)' : 'リーダーのみ'}
        onClick={() => onModeChange('section')}
      />
      <ToolButton icon={StickyNote} label="メモ" disabled title="準備中" />
      <Divider />
      <ToolButton icon={Search} label="検索" disabled title="準備中" />
    </div>
  )
}
