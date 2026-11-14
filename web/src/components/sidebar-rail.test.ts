import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SidebarRail, productInitial } from './sidebar-rail'

// サイドバーをたたんだときの帯: 開くボタンと、プロダクトのアイコン(押すと移動)

const products = [
  { id: 'p1', name: '人形劇', avatarUrl: 'https://example.com/a.png' },
  { id: 'p2', name: 'Alpha', avatarUrl: null },
  { id: 'p3', name: '  ', avatarUrl: undefined },
]
const render = (props: Partial<Parameters<typeof SidebarRail>[0]> = {}) =>
  renderToStaticMarkup(createElement(SidebarRail, { products, collapsed: true, onExpand: () => {}, ...props }))

describe('productInitial', () => {
  test('名前の最初の文字か数字(前の空白・記号は飛ばす)。なければ ?', () => {
    expect(productInitial('Alpha')).toBe('A')
    expect(productInitial(' 人形劇')).toBe('人')
    // 記号は飛ばして、最初の文字・数字(同じ「【デモ】」で始まるプロダクトを、区別できるように)
    expect(productInitial('【デモ】招待')).toBe('デ')
    expect(productInitial('(1) テスト')).toBe('1')
    expect(productInitial('---')).toBe('?')
    expect(productInitial('   ')).toBe('?')
  })
})

describe('SidebarRail', () => {
  test('一番上に「サイドバーを開く」、その下にプロダクトが 1 つずつ(名前が aria-label)', () => {
    const html = render()
    expect(html.indexOf('aria-label="サイドバーを開く"')).toBeLessThan(html.indexOf('aria-label="人形劇"'))
    for (const name of ['人形劇', 'Alpha']) expect(html).toContain(`aria-label="${name}"`)
    expect(html.match(/<li[ >]/g)?.length).toBe(3)
  })
  test('画像があれば画像、なければ名前の頭文字の丸', () => {
    const html = render()
    expect(html).toContain('src="https://example.com/a.png"')
    expect(html.match(/data-rail-initial/g)?.length).toBe(2)
    expect(html).toMatch(/data-rail-initial[^>]*>A</)
    expect(html).toMatch(/data-rail-initial[^>]*>\?</)
  })
  test('いま開いているプロダクトだけ、aria-current', () => {
    const html = render({ activeProductId: 'p2' })
    expect(html.match(/aria-current="page"/g)?.length).toBe(1)
    expect(html).toMatch(/aria-label="Alpha"[^>]*aria-current="page"/)
  })
  test('たたんでいない間(帯が見えない間)は、キーボードの移動から外す', () => {
    expect(render({ collapsed: true })).not.toContain('tabindex="-1"')
    const hidden = render({ collapsed: false })
    expect(hidden.match(/tabindex="-1"/g)?.length).toBe(4)
  })
  test('プロダクトがなくても、開くボタンは出る', () => {
    const html = render({ products: [] })
    expect(html).toContain('aria-label="サイドバーを開く"')
    expect(html).not.toMatch(/<li[ >]/)
  })
})
