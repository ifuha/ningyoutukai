import { describe, expect, test } from 'bun:test'
// api の色の一覧(依存のない小さなモジュール)と、web の色の対応が、食い違っていないことを確かめる
import { sectionColors } from '../../../api/src/lib/section'
import { sectionStyle, sectionStyles } from './section-style'

describe('sectionStyles', () => {
  test('api の 6 色すべてに、見た目がある(過不足なし)', () => {
    expect(Object.keys(sectionStyles).sort()).toEqual([...sectionColors].sort())
  })
  test('色ごとに、見た目(枠・札)が重ならない', () => {
    const boxes = Object.values(sectionStyles).map((s) => s.box)
    const tags = Object.values(sectionStyles).map((s) => s.tag)
    expect(new Set(boxes).size).toBe(sectionColors.length)
    expect(new Set(tags).size).toBe(sectionColors.length)
  })
  test('四角は薄い塗り + 枠、札は塗りの色(Tailwind が拾える完全なクラス名)', () => {
    for (const s of Object.values(sectionStyles)) {
      expect(s.box).toMatch(/^border-\S+ bg-\S+\/10$/)
      expect(s.tag).toMatch(/^bg-\S+ text-(white|black)$/)
    }
  })
})

describe('sectionStyle', () => {
  test('既知の色は、その見た目を返す', () => {
    expect(sectionStyle('red')).toBe(sectionStyles.red)
    expect(sectionStyle('lightblue')).toBe(sectionStyles.lightblue)
  })
  test('知らない色は、無難な見た目にする(落ちない)', () => {
    const s = sectionStyle('magenta')
    expect(s.box).toContain('border-ink')
    expect(s.tag).toContain('bg-ink')
  })
})
