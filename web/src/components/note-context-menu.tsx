import { ContextMenu } from '#/components/context-menu'
import type { ContextMenuItem } from '#/lib/context-menu-items'

/** メモのメニューの項目(編集・削除・公開 / 非公開の切り替え) */
export function noteMenuItems({
  isPublic,
  onEdit,
  onDelete,
  onTogglePublic,
}: {
  isPublic: boolean
  onEdit: () => void
  onDelete: () => void
  onTogglePublic: () => void
}): ContextMenuItem[] {
  return [
    { label: '編集', onSelect: onEdit },
    { label: '削除', onSelect: onDelete },
    {
      label: isPublic ? '非公開にする' : '公開にする',
      onSelect: onTogglePublic,
      detail: `いま: ${isPublic ? '公開' : '非公開'}`,
    },
  ]
}

// メモの右クリック(スマホは長押し)のメニュー。項目: 編集・削除・公開 / 非公開の切り替え
// 位置・キー操作・閉じ方は、汎用の `ContextMenu` と同じ
export function NoteContextMenu({
  x,
  y,
  isPublic,
  onEdit,
  onDelete,
  onTogglePublic,
  onClose,
}: {
  /** 押した位置(画面の座標) */
  x: number
  y: number
  /** いまの状態(公開か) */
  isPublic: boolean
  onEdit: () => void
  onDelete: () => void
  onTogglePublic: () => void
  /** 閉じる(項目を選んだときは、その操作のあとに呼ぶ) */
  onClose: () => void
}) {
  return (
    <ContextMenu
      x={x}
      y={y}
      label="メモのメニュー"
      onClose={onClose}
      items={noteMenuItems({ isPublic, onEdit, onDelete, onTogglePublic })}
    />
  )
}
