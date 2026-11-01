import { MousePointer2, Search, SquareDashed, StickyNote, User } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import type { CanvasTool } from '#/lib/section-interaction-types'

// ツリーの画面の下の中央に置く、道具のバー(Figma の `nav` を、ユーザーの指示で小さく、アイコンだけにした)
// 寸法: 高さ 56(枠線 1px)、ボタン 40 × 40(アイコン 24px)、ボタンと区切り線の間隔 6px、左右の余白 6px、区切り線 2 × 24
//   幅は中身で決まる(ボタン 5 × 40 + 区切り線 2 × 2 + 間隔 6 × 6 + 余白 12 + 枠線 2 = 254)
//   文字(ラベル)は出さない。名前は、ホバー(とキーボードのフォーカス)のツールチップと、`aria-label` で示す
//   ツールチップが切れないよう、このバーには `overflow` を付けない
// 並びは「選択 | メンバー・セクション・メモ | 検索」
// 選択・セクションは、道具(モード)の切り替え(押された道具を強調する)。キャンバスのドラッグでの移動は、「セクション」以外ではいつでも動く。
//   セクションは、リーダーだけが使える(リーダーでなければ、押せない見た目。ツールチップで理由を示す)。選ぶと、キャンバスでドラッグして、セクションを置く(Esc か「選択」で戻る)
//   メンバーは、メンバーの管理を開く(リーダーのみ)。メモ・検索は、無効の見た目(準備中)

export type TreeMode = CanvasTool

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
      className="flex h-14 max-w-[calc(100vw-1.5rem)] items-center gap-1.5 shadow-box bg-surface/90 px-1.5"
    >
      <IconButton
        icon={MousePointer2}
        label="選択"
        pressed={mode === 'select'}
        onClick={() => onModeChange('select')}
      />
      <Divider />
      <IconButton
        icon={User}
        label="メンバー"
        tip={onOpenMembers ? 'メンバーの管理' : 'メンバーの管理(リーダーのみ)'}
        disabled={!onOpenMembers}
        onClick={onOpenMembers}
      />
      <IconButton
        icon={SquareDashed}
        label="セクション"
        tip={canEditSections ? 'セクションを置く(Esc で戻る)' : 'セクション(リーダーのみ)'}
        pressed={mode === 'section'}
        disabled={!canEditSections}
        onClick={() => onModeChange('section')}
      />
      <IconButton icon={StickyNote} label="メモ" tip="メモ(準備中)" disabled />
      <Divider />
      <IconButton icon={Search} label="検索" tip="検索(準備中)" disabled />
    </div>
  )
}
