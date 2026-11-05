import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { themes, type Theme } from '#/lib/theme'
import { useTheme } from '#/lib/use-theme'

const icons: Record<Theme, LucideIcon> = { system: Monitor, light: Sun, dark: Moon }
const hints: Record<Theme, string> = {
  system: 'OS の設定に合わせます',
  light: '明るい画面にします',
  dark: '暗い画面にします',
}

// 設定「外観」。表示モード(自動 / ライト / ダーク)を選ぶ。選ぶとすぐ画面に反映され、ブラウザに保存される
export function AppearanceSettings() {
  const { theme, choose } = useTheme()

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-s opacity-60">テーマ</legend>
      {themes.map((t) => {
        const Icon = icons[t.value]
        return (
          <label
            key={t.value}
            className="flex cursor-pointer items-center gap-3 border border-line p-3 text-m hover:bg-side-item has-[:checked]:bg-side-item has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink"
          >
            <input
              type="radio"
              name="theme"
              value={t.value}
              checked={theme === t.value}
              onChange={() => choose(t.value)}
              className="size-4 accent-ink"
            />
            <Icon aria-hidden="true" size={20} className="shrink-0" />
            <span className="min-w-0">
              <span className="block font-medium">{t.label}</span>
              <span className="block text-s opacity-60">{hints[t.value]}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}