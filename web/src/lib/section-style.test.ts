import { describe, expect, test } from 'bun:test'
// api の色の一覧(依存のない小さなモジュール)と、web の色の対応が、食い違っていないことを確かめる
import { sectionColors } from '../../../api/src/lib/section'
import {
  SECTION_FILL_OPACITY,
  SECTION_FILL_OPACITY_STRONG,
  SECTION_LINE_COLORS,
  sectionStyle,
  sectionStyles,
  withAlpha,
} from './section-style'

describe('withAlpha', () => {
  test('#RRGGBB に透明度を付けて、rgba にする(大文字・小文字どちらも)', () => {
    expect(withAlpha('#FF0004', 0.2)).toBe('rgba(255, 0, 4, 0.2)')
    expect(withAlpha('#ff0004', 0.2)).toBe('rgba(255, 0, 4, 0.2)')
    expect(withAlpha('#000000', 1)).toBe('rgba(0, 0, 0, 1)')
    expect(withAlpha('#FFFFFF', 0)).toBe('rgba(255, 255, 255, 0)')
  })
  test('#RRGGBB でない値は、そのまま返す(壊れた色で落ちない)', () => {
    expect(withAlpha('var(--color-ink)', 0.2)).toBe('var(--color-ink)')
    expect(withAlpha('#FFF', 0.2)).toBe('#FFF')
    expect(withAlpha('', 0.2)).toBe('')
  })
})

describe('sectionStyles', () => {
  test('api の 6 色すべてに、見た目がある(過不足なし)', () => {
    expect(Object.keys(sectionStyles).sort()).toEqual([...sectionColors].sort())
    expect(Object.keys(SECTION_LINE_COLORS).sort()).toEqual([...sectionColors].sort())
  })
  test('色の並びは、api の色の一覧の順(新しいセクションの色を順に選ぶ元になる)', () => {
    expect(Object.keys(sectionStyles)).toEqual(['red', 'yellow', 'green', 'purple', 'lightblue', 'blue'])
  })
  test('赤は、Figma の値(#FF0004)で、塗りはその 20%', () => {
    expect(SECTION_LINE_COLORS.red).toBe('#FF0004')
    expect(sectionStyles.red.line).toBe('#FF0004')
    expect(sectionStyles.red.fill).toBe('rgba(255, 0, 4, 0.2)')
  })
  test('塗りの濃さは 20%、ドロップ先は 35%(通常より濃い)', () => {
    expect(SECTION_FILL_OPACITY).toBe(0.2)
    expect(SECTION_FILL_OPACITY_STRONG).toBeGreaterThan(SECTION_FILL_OPACITY)
    for (const [color, line] of Object.entries(SECTION_LINE_COLORS)) {
      const s = sectionStyles[color as keyof typeof sectionStyles]
      expect(s.line).toBe(line)
      expect(s.fill).toBe(withAlpha(line, SECTION_FILL_OPACITY))
      expect(s.fillStrong).toBe(withAlpha(line, SECTION_FILL_OPACITY_STRONG))
    }
  })
  test('色ごとに、線の色が重ならない(見分けられる)', () => {
    const lines = Object.values(sectionStyles).map((s) => s.line.toLowerCase())
    expect(new Set(lines).size).toBe(sectionColors.length)
  })
  test('線の色は #RRGGBB(塗りを計算で作れる)', () => {
    for (const line of Object.values(SECTION_LINE_COLORS)) expect(line).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})

describe('sectionStyle', () => {
  test('既知の色は、その見た目を返す', () => {
    expect(sectionStyle('red')).toBe(sectionStyles.red)
    expect(sectionStyle('lightblue')).toBe(sectionStyles.lightblue)
  })
  test('知らない色は、無難な見た目にする(落ちない)', () => {
    const s = sectionStyle('magenta')
    expect(s.line).toContain('--color-ink')
    expect(s.fill).toContain('20%')
    expect(s.fillStrong).toContain('35%')
  })
})
