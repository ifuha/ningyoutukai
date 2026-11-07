import type { ContextMenuItem } from '#/lib/context-menu-items'

/**
 * コメントのメニューの項目(右クリック・長押しで出す。リーダーだけ)。
 * - 編集: 本文をその場で直す
 * - 移動: 位置を動かす。ポインタに付いてくるので、置きたい所でクリックする(Esc でやめる)。ピンのドラッグでも動かせる
 * - 削除: 確認(「削除する」)を出す。すぐには消さない
 */
export function commentMenuItems({
  onEdit,
  onMove,
  onDelete,
}: {
  onEdit: () => void
  onMove: () => void
  onDelete: () => void
}): ContextMenuItem[] {
  return [
    { label: '編集', onSelect: onEdit },
    { label: '移動', onSelect: onMove },
    { label: '削除', onSelect: onDelete },
  ]
}
