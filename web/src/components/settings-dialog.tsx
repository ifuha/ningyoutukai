import { SettingsShell } from '#/components/settings-shell'
import { settingsSections } from '#/components/settings-sections'

// ユーザー設定のモーダル。枠(左にカテゴリ、右に中身、閉じるボタン)は `settings-shell.tsx`。
// カテゴリは `settings-sections.tsx` に足す
export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <SettingsShell
      open={open}
      onClose={onClose}
      title="設定"
      ariaLabel="設定の項目"
      sections={settingsSections}
    />
  )
}
