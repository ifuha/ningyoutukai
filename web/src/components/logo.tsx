import logoUrl from '#/assets/logo.svg'

// アプリのロゴ(立方体)。「人形使い」の文字の代わりに、サイドバー・スマホのバー・ログイン画面に出す
// 画像は SVG(141 × 162)。大きさは、高さ(`className` の `h-*`)で決める。名前は `alt` で伝える
export function Logo({ className = 'h-8' }: { className?: string }) {
  return <img src={logoUrl} alt="人形使い" draggable={false} className={`w-auto ${className}`} />
}
