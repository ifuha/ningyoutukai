import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { useEffect, useState } from 'react'
import { THEME_KEY, applyTheme, parseTheme, themes, type Theme } from '#/lib/theme'

const icons: Record<Theme, LucideIcon> = { system: Monitor, light: Sun, dark: Moon }

// 表示モード(自動 / ライト / ダーク)の切り替え。サイドバーの下に置く。
// 保存は localStorage。使えない環境(プライベートモードなど)でも、その場の切り替えは動く
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system')

  // サーバーの描画と合わせるため、保存された値は、描画のあとで読む
  useEffect(() => {
    try {
      setTheme(parseTheme(localStorage.getItem(THEME_KEY)))
    } catch {
      // 読めなければ、自動のまま
    }
  }, [])

  function choose(next: Theme) {
    setTheme(next)
    applyTheme(next, document.documentElement)
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, next)
    } catch {
      // 保存できなくても、この画面の切り替えは効いている
    }
  }

  return (
    <div role="group" aria-label="表示モード" className="grid grid-cols-3 justify-items-center shadow-box">
      {themes.map((t) => (
        <IconButton
          key={t.value}
          icon={icons[t.value]}
          label={t.label}
          size="sm"
          pressed={theme === t.value}
          onClick={() => choose(t.value)}
        />
      ))}
    </div>
  )
}
