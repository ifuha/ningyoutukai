// ライト / ダークの切り替え。
// 'system' は OS の設定に従う(`<html>` に `data-theme` を付けない)。'light' / 'dark' は、`data-theme` で固定する。
// 選択は localStorage に保存し、最初の描画の前に `themeInitScript` で `<html>` に付ける(ちらつき防止)
export type Theme = 'system' | 'light' | 'dark'

export const THEME_KEY = 'ningyoutukai-theme'

export const themes: readonly { value: Theme; label: string }[] = [
  { value: 'system', label: '自動' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
]

/** 保存された値を、Theme にする。知らない値・空は 'system' */
export function parseTheme(value: string | null | undefined): Theme {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/** `<html>`(の属性を持つ要素)に、選択を反映する */
export function applyTheme(
  theme: Theme,
  root: Pick<Element, 'setAttribute' | 'removeAttribute'>,
): void {
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

/** `<head>` に入れる、最初の描画の前に動く 1 行の script。保存された 'light' / 'dark' だけを反映する */
export const themeInitScript = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`
