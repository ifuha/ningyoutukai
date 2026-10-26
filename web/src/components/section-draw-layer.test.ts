import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SectionDrawLayer } from './section-draw-layer'

// 「ドラッグでセクションを置く」層の、最小のスモークテスト(DOM なし。サーバーでのマークアップを検査する)
// ポインタの実際の動き(押す・動かす・離す・Esc)の判断は、`#/lib/section-draw` の状態機械のテストで確かめる(`section-draw.test.ts`)
//   ここで確かめるのは: active=false で何も出ない(ポインタを奪わない)・active=true で、十字カーソルの層が出る・プレビューはドラッグ前は出ない

const props = {
  scale: 1,
  toCanvas: (p: { x: number; y: number }) => p,
  onCreate: () => {},
  onCancel: () => {},
}

const html = (active: boolean, over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(SectionDrawLayer, { ...props, active, ...over }))

describe('SectionDrawLayer', () => {
  test('active=false では、何も描かない(空の文字列)', () => {
    expect(html(false)).toBe('')
  })

  test('active=true では、層が出る。十字カーソルで、ポインタを受ける', () => {
    const out = html(true)
    expect(out).toContain('data-section-draw-layer')
    expect(out).toContain('cursor:crosshair')
    expect(out).toContain('touch-action:none')
  })

  test('層は、アクセシビリティの名前を持ち、Esc で中止できることを伝える', () => {
    const out = html(true)
    expect(out).toContain('role="application"')
    expect(out).toContain('Esc で中止')
  })

  test('ドラッグの前は、プレビューも大きさの文字も出ない', () => {
    const out = html(true)
    expect(out).not.toContain('data-section-draw-preview')
    expect(out).not.toContain('data-section-draw-size')
  })

  test('重ね順は、既定で z-30。className で上書きできる', () => {
    expect(html(true)).toContain('z-30')
    const custom = html(true, { className: 'z-50' })
    expect(custom).toContain('z-50')
    expect(custom).not.toContain('z-30')
  })

  test('親の全面を覆うよう、大きな範囲に広がる(原点を中心に、負の位置から)', () => {
    const out = html(true)
    expect(out).toContain('left:-100000px')
    expect(out).toContain('top:-100000px')
    expect(out).toContain('width:200000px')
    expect(out).toContain('height:200000px')
  })
})
