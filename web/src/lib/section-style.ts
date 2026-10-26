import type { SectionColor } from '#/lib/section'

// セクションの色(api の `sectionColors` の 6 色)から、見た目への対応
// Tailwind は、クラス名が文字のままソースに書かれているものだけを生成する。そのため、組み立てずに、完全な文字列で書く
// 具体的な色は暫定(Figma の `section-*` の色の値は取れていない。Figma と見比べて直す)
export type SectionStyle = {
  /** 四角の塗りと枠(薄い塗り、同じ色のはっきりした枠) */
  box: string
  /** 左上の札(その色の塗り。文字は、色に合わせて読める色) */
  tag: string
}

// `satisfies` で、api の色が増えたとき(型が変わったとき)に、ここが足りないとコンパイルエラーになる
export const sectionStyles = {
  red: {
    box: 'border-red-500 bg-red-500/10',
    tag: 'bg-red-500 text-white',
  },
  yellow: {
    box: 'border-yellow-400 bg-yellow-400/10',
    tag: 'bg-yellow-400 text-black',
  },
  green: {
    box: 'border-green-500 bg-green-500/10',
    tag: 'bg-green-500 text-white',
  },
  purple: {
    box: 'border-purple-500 bg-purple-500/10',
    tag: 'bg-purple-500 text-white',
  },
  lightblue: {
    box: 'border-sky-400 bg-sky-400/10',
    tag: 'bg-sky-400 text-black',
  },
  blue: {
    box: 'border-blue-500 bg-blue-500/10',
    tag: 'bg-blue-500 text-white',
  },
} as const satisfies Record<SectionColor, SectionStyle>

/** 色から見た目を返す。知らない色(api が色を増やしたのに、web が古いとき)は、枠の色を持たない無難な見た目にする */
export function sectionStyle(color: string): SectionStyle {
  return (
    (sectionStyles as Record<string, SectionStyle>)[color] ?? {
      box: 'border-ink/50 bg-ink/5',
      tag: 'bg-ink text-surface',
    }
  )
}
