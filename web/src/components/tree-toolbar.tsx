import { MessageSquare, MousePointer2, Search, SquareDashed, StickyNote, User } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import type { CanvasTool } from '#/lib/section-interaction-types'

// ツリーの画面の下の中央に置く、道具のバー(Figma の `nav` を、ユーザーの指示で小さく、アイコンだけにした)
// 寸法: 高さ 56(枠線 1px)、ボタン 40 × 40(アイコン 24px)、ボタンと区切り線の間隔 6px、左右の余白 6px、区切り線 2 × 24
//   幅は中身で決まる(ボタン 5 × 40 + 区切り線 2 × 2 + 間隔 6 × 6 + 余白 12 + 枠線 2 = 254。リーダーは「コメント」が増えて、ボタン 6 × 40、間隔 6 × 7 で 300)
//   文字(ラベル)は出さない。名前は、ホバー(とキーボードのフォーカス)のツールチップと、`aria-label` で示す
//   ツールチップが切れないよう、このバーには `overflow` を付けない
// 並びは「選択 | メンバー・セクション・メモ | 検索」
// 選択・セクションは、道具(モード)の切り替え(押された道具を強調する)。キャンバスのドラッグでの移動は、「セクション」以外ではいつでも動く。
//   セクションは、リーダーだけが使える(リーダーでなければ、押せない見た目。ツールチップで理由を示す)。選ぶと、キャンバスでドラッグして、セクションを置く(Esc か「選択」で戻る)
// 道具は同時に使えない(セクションを置く間・検索を開く間・メモを編集する間は、他の道具が押せない)
//   メンバーは、メンバーの管理を開く(リーダーのみ)。検索は、プロダクト内の名前検索を開く。
//   コメントは、リーダーだけに出す(`onToggleComment` を渡したときだけ)。押すと配置モード(カーソルがコメントのアイコンになる)。ツリーをクリックして置く。ほかの道具を押すと、やめる

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
  onOpenSearch,
  onAddMemo,
  onToggleComment,
  commentActive = false,
  canEditSections = false,
  searchOpen = false,
  memoEditing = false,
}: {
  mode: TreeMode
  onModeChange: (mode: TreeMode) => void
  /** メンバーの管理を開く。渡さない(リーダーでない)ときは、無効の見た目 */
  onOpenMembers?: () => void
  /** プロダクト内のタスク・セクション・メンバー検索を開く */
  onOpenSearch?: () => void
  /** キャンバス中央に付箋を追加 */
  onAddMemo?: () => void
  /** コメントの配置モードの入り・切り(リーダーだけ。渡さなければ、「コメント」は出さない) */
  onToggleComment?: () => void
  /** コメントの配置モード中か(押された見た目にする) */
  commentActive?: boolean
  /** セクションを置ける(リーダー)か。false のときは、「セクション」が押せない見た目 */
  canEditSections?: boolean
  /** 検索を開いているか。開いている間は、検索以外の道具を使えない */
  searchOpen?: boolean
  /** メモの内容を編集中か。編集中は、選択以外の道具を使えない */
  memoEditing?: boolean
}) {
  // 道具は同時に使えない: 「セクション」を使っている間は、検索・メンバー・メモを押せない。検索を開いている間は、「セクション」・メンバー・メモを押せない
  const sectionActive = mode === 'section'
  const busyTip = memoEditing
    ? 'メモを編集している間は使えません'
    : sectionActive
      ? 'セクションを置いている間は使えません(Esc で戻る)'
      : '検索を閉じてから使えます'
  const busy = sectionActive || searchOpen || memoEditing
  return (
    <div
      role="toolbar"
      aria-label="ツリーの道具"
      className="flex h-14 max-w-[calc(100vw-1.5rem)] items-center gap-1.5 shadow-box bg-panel/90 px-1.5"
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
        tip={busy ? busyTip : onOpenMembers ? 'メンバーの管理' : 'メンバーの管理(リーダーのみ)'}
        disabled={!onOpenMembers || busy}
        onClick={onOpenMembers}
      />
      <IconButton
        icon={SquareDashed}
        label="セクション"
        tip={
          searchOpen || memoEditing ? busyTip : canEditSections ? 'セクションを置く(Esc で戻る)' : 'セクション(リーダーのみ)'
        }
        pressed={mode === 'section'}
        disabled={!canEditSections || searchOpen || memoEditing}
        onClick={() => onModeChange('section')}
      />
      <IconButton
        icon={StickyNote}
        label="メモ"
        tip={busy ? busyTip : '付箋を追加'}
        onClick={onAddMemo}
        disabled={!onAddMemo || busy}
      />
      {onToggleComment && (
        <IconButton
          icon={MessageSquare}
          label="コメント"
          tip={busy ? busyTip : commentActive ? 'コメントを置く(ツリーをクリック。ほかの道具を押すとやめる)' : 'コメントを置く'}
          pressed={commentActive}
          disabled={busy}
          onClick={onToggleComment}
        />
      )}
      <Divider />
      <IconButton
        icon={Search}
        label="検索"
        tip={sectionActive || memoEditing ? busyTip : undefined}
        onClick={onOpenSearch}
        disabled={!onOpenSearch || sectionActive || memoEditing}
      />
    </div>
  )
}
