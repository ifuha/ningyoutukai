import type { ContextMenuItem } from '#/lib/context-menu-items'

/**
 * コメントのメニューの項目(右クリック・長押しで出す。リーダーだけ)。
 * - 編集: 本文をその場で直す
 * - 削除: 確認(「削除する」)を出す。すぐには消さない
 * 位置は、メニューではなく、ピンをマウスで掴んで動かす(ドラッグ)
 */
export function commentMenuItems({
  onEdit,
  onDelete,
}: {
  onEdit: () => void
  onDelete: () => void
}): ContextMenuItem[] {
  return [
    { label: '編集', onSelect: onEdit },
    { label: '削除', onSelect: onDelete },
  ]
}
