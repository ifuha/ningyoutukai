import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContextMenuItems } from './context-menu'
import { noteMenuItems } from './note-context-menu'
import { visibleMenuItems, type ContextMenuItem } from '#/lib/context-menu-items'

// メニュー本体は `createPortal` で body に描くので、サーバー描画では、項目のボタンの部分(`ContextMenuItems`)を調べる
const noop = () => {}
const choose = (action: () => void) => action
const render = (items: ContextMenuItem[]) =>
  renderToStaticMarkup(createElement('div', null, createElement(ContextMenuItems, { items, choose })))

describe('visibleMenuItems', () => {
  test('hidden の項目を除く', () => {
    const items = [
      { label: 'a', onSelect: noop },
      { label: 'b', onSelect: noop, hidden: true },
      { label: 'c', onSelect: noop, hidden: false },
    ]
    expect(visibleMenuItems(items).map((i) => i.label)).toEqual(['a', 'c'])
  })
})

describe('ContextMenuItems の markup', () => {
  const html = render([
    { label: '一つ目', onSelect: noop },
    { label: '隠す', onSelect: noop, hidden: true },
    { label: '二つ目', onSelect: noop, detail: 'いま: x' },
  ])

  test('見える項目だけが role="menuitem" のボタンになる', () => {
    expect(html.match(/role="menuitem"/g)).toHaveLength(2)
    expect(html.match(/type="button"/g)).toHaveLength(2)
    expect(html).toContain('一つ目')
    expect(html).not.toContain('隠す')
  })

  test('見た目: ホバー bg-side-item、フォーカス bg-side-item', () => {
    expect(html).toContain('hover:bg-side-item')
    expect(html).toContain('focus-visible:bg-side-item')
  })

  test('detail は右に添える', () => {
    expect(html).toContain('<span>二つ目</span><span class="text-ink/60">いま: x</span>')
  })
})

describe('メモのメニューの項目', () => {
  const items = (isPublic: boolean) =>
    noteMenuItems({ isPublic, onEdit: noop, onDelete: noop, onTogglePublic: noop })

  test('編集・削除・公開の切り替え', () => {
    expect(items(false).map((i) => i.label)).toEqual(['編集', '削除', '公開にする'])
    expect(items(false)[2]?.detail).toBe('いま: 非公開')
  })

  test('公開中は「非公開にする」', () => {
    expect(items(true).map((i) => i.label)).toEqual(['編集', '削除', '非公開にする'])
    expect(items(true)[2]?.detail).toBe('いま: 公開')
  })

  test('markup は menuitem が 3 つ', () => {
    expect(render(items(false)).match(/role="menuitem"/g)).toHaveLength(3)
  })
})
