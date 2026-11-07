import type { ContextMenuItem } from '#/lib/context-menu-items'

// サイドバーのプロダクトの行の右クリック(スマホは長押し)のメニュー。リーダーの行だけ。
// 項目: アイコンを変更 / アイコンを削除(アイコンがあるときだけ) / プロダクト管理
export function sidebarMenuItems({
  hasAvatar,
  onChangeAvatar,
  onDeleteAvatar,
  onManage,
}: {
  /** アイコンの画像が設定されているか(`avatarUrl` が null でない) */
  hasAvatar: boolean
  onChangeAvatar: () => void
  onDeleteAvatar: () => void
  onManage: () => void
}): ContextMenuItem[] {
  return [
    { label: 'アイコンを変更', onSelect: onChangeAvatar },
    { label: 'アイコンを削除', onSelect: onDeleteAvatar, hidden: !hasAvatar },
    { label: 'プロダクト管理', onSelect: onManage },
  ]
}
