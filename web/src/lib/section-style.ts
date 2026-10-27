import type { SectionColor } from '#/lib/section'

// セクションの色(api の `sectionColors` の 6 色)から、見た目への対応
// Figma のセクションの見た目: 破線の枠(その色)、内側の塗りは同じ色の 20%、名前は枠の上の左に置く文字(`section-label.ts`)
// 色は「線の色」(`SECTION_LINE_COLORS`)の 1 か所だけで決める。塗りは、線の色から計算で作る(Tailwind のクラスではなく、style で渡す)
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
}

/** `#RRGGBB` に、透明度(0〜1)を付けた `rgba(r, g, b, a)` を返す。`#RRGGBB` 以外は、そのまま返す */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return hex
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h!, 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function build(line: string): SectionStyle {
  return {
    line,
    fill: withAlpha(line, SECTION_FILL_OPACITY),
    fillStrong: withAlpha(line, SECTION_FILL_OPACITY_STRONG),
  }
}

// `satisfies` で、api の色が増えたとき(型が変わったとき)に、ここが足りないとコンパイルエラーになる
// 並びは、api の色の一覧の順(新しいセクションの色を順に選ぶ元になる。`section-cache.ts` の `nextSectionColor`)
export const sectionStyles = {
  red: build(SECTION_LINE_COLORS.red),
  yellow: build(SECTION_LINE_COLORS.yellow),
  green: build(SECTION_LINE_COLORS.green),
  purple: build(SECTION_LINE_COLORS.purple),
  lightblue: build(SECTION_LINE_COLORS.lightblue),
  blue: build(SECTION_LINE_COLORS.blue),
} as const satisfies Record<SectionColor, SectionStyle>

/** 色から見た目を返す。知らない色(api が色を増やしたのに、web が古いとき)は、枠の色を持たない無難な見た目にする */
export function sectionStyle(color: string): SectionStyle {
  return (
    (sectionStyles as Record<string, SectionStyle>)[color] ?? {
      line: 'var(--color-ink)',
      fill: 'color-mix(in srgb, var(--color-ink) 20%, transparent)',
      fillStrong: 'color-mix(in srgb, var(--color-ink) 35%, transparent)',
    }
  )
}
