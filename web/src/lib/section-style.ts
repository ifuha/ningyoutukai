import type { SectionColor } from '#/lib/section'

// セクションの色(api の `sectionColors` の 6 色)から、見た目への対応
// Figma のセクションの見た目: 破線の枠(その色)、内側の塗りは同じ色の 20%、名前は枠の上の左に置く文字
// 色は「線の色」(`SECTION_LINE_COLORS`)の 1 か所だけで決める。塗りは、線の色から計算で作る
// **赤だけ Figma の値(`#FF0004`)で確定。ほかの 5 色は暫定**(Figma の値が未確認。分かったら、この表の値だけを差し替える)
export const SECTION_LINE_COLORS = {
  red: '#FF0004',
  // 以下は暫定(Tailwind の yellow-400 / green-500 / purple-500 / sky-400 / blue-500 と同じ値。Figma の値が未確認。後で差し替える)
  yellow: '#FACC15',
  green: '#22C55E',
  purple: '#A855F7',
  lightblue: '#38BDF8',
  blue: '#3B82F6',
} as const satisfies Record<SectionColor, string>

/** 内側の塗りの濃さ(Figma: 線の色の 20%) */
export const SECTION_FILL_OPACITY = 0.2
/** カードのドロップ先になっているときの、塗りの濃さ(通常より濃くして、区別する) */
export const SECTION_FILL_OPACITY_STRONG = 0.35

export type SectionStyle = {
  /** 枠(破線)の色 */
  line: string
  /** 内側の塗り(線の色の 20%) */
  fill: string
  /** カードのドロップ先になっているときの塗り(線の色の 35%) */
  fillStrong: string
  /** 四角の塗りと枠(旧。使う側を `line` / `fill` に移したら消す) */
  box: string
  /** 左上の札(旧。名前は、枠の上の文字になった。使う側を移したら消す) */
  tag: string
}

/** `#RRGGBB` に、透明度(0〜1)を付けた `rgba(r, g, b, a)` を返す。`#RRGGBB` 以外は、そのまま返す */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return hex
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h!, 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function build(line: string, legacy: { box: string; tag: string }): SectionStyle {
  return {
    line,
    fill: withAlpha(line, SECTION_FILL_OPACITY),
    fillStrong: withAlpha(line, SECTION_FILL_OPACITY_STRONG),
    ...legacy,
  }
}

// Tailwind は、クラス名が文字のままソースに書かれているものだけを生成する(旧い `box` / `tag` が使う。移したら消す)
// `satisfies` で、api の色が増えたとき(型が変わったとき)に、ここが足りないとコンパイルエラーになる
export const sectionStyles = {
  red: build(SECTION_LINE_COLORS.red, { box: 'border-red-500 bg-red-500/10', tag: 'bg-red-500 text-white' }),
  yellow: build(SECTION_LINE_COLORS.yellow, { box: 'border-yellow-400 bg-yellow-400/10', tag: 'bg-yellow-400 text-black' }),
  green: build(SECTION_LINE_COLORS.green, { box: 'border-green-500 bg-green-500/10', tag: 'bg-green-500 text-white' }),
  purple: build(SECTION_LINE_COLORS.purple, { box: 'border-purple-500 bg-purple-500/10', tag: 'bg-purple-500 text-white' }),
  lightblue: build(SECTION_LINE_COLORS.lightblue, { box: 'border-sky-400 bg-sky-400/10', tag: 'bg-sky-400 text-black' }),
  blue: build(SECTION_LINE_COLORS.blue, { box: 'border-blue-500 bg-blue-500/10', tag: 'bg-blue-500 text-white' }),
} as const satisfies Record<SectionColor, SectionStyle>

/** 色から見た目を返す。知らない色(api が色を増やしたのに、web が古いとき)は、枠の色を持たない無難な見た目にする */
export function sectionStyle(color: string): SectionStyle {
  return (
    (sectionStyles as Record<string, SectionStyle>)[color] ?? {
      line: 'var(--color-ink)',
      fill: 'color-mix(in srgb, var(--color-ink) 20%, transparent)',
      fillStrong: 'color-mix(in srgb, var(--color-ink) 35%, transparent)',
      box: 'border-ink/50 bg-ink/5',
      tag: 'bg-ink text-surface',
    }
  )
}
