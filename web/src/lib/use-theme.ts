import { useState } from 'react'
import { THEME_KEY, applyTheme, parseTheme, type Theme } from '#/lib/theme'

/** 保存された表示モード。読めなければ(プライベートモードなど)'system' */
function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY))
  } catch {
    return 'system'
  }
}

// 表示モード(自動 / ライト / ダーク)の、いまの選択と、切り替え。
// 保存は localStorage(使えない環境でも、その場の切り替えは動く)。反映は、`<html>` の `data-theme`(`applyTheme`)。
// 設定の画面は、開いたときにだけ(ブラウザで)描かれるので、最初の描画で、保存された値を読んでよい
// (サーバーの描画と、ずれない)。常に描かれる部品で使うときは、描画のあとで読むこと
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme)

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

  return { theme, choose }
}