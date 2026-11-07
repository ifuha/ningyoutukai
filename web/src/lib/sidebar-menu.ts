import type { ContextMenuItem } from '#/lib/context-menu-items'

// サイドバーのプロダクトの行の右クリック(スマホは長押し)のメニュー。リーダーの行だけ。
// 項目は「プロダクト設定」の 1 つだけ(アイコンの変更・削除も、設定のモーダルの中でする。確認なしの削除は、ここに置かない)
export function sidebarMenuItems({ onOpenSettings }: { onOpenSettings: () => void }): ContextMenuItem[] {
  return [{ label: 'プロダクト設定', onSelect: onOpenSettings }]
}
