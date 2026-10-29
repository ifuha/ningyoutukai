import { useEffect, useState } from 'react'
import { THEME_KEY, applyTheme, parseTheme, themes, type Theme } from '#/lib/theme'

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
    <div role="group" aria-label="表示モード" className="flex border border-line">
      {themes.map((t) => (
        <button
          key={t.value}
          type="button"
          aria-pressed={theme === t.value}
          onClick={() => choose(t.value)}
          className={`h-8 flex-1 text-s hover:bg-side-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${
            theme === t.value ? 'bg-ink text-surface hover:bg-ink' : ''
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
