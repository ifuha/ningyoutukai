import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProductSettingsDialog, productSettingsSections } from './product-settings-dialog'

// プロダクト設定のモーダルの、構造と文言のスモークテスト(DOM なし。カテゴリの切り替えは settings-shell.test.ts)

const props = { productId: 'p1', productName: '社内ツール', memberCount: 3, avatarUrl: null }
const render = (extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(ProductSettingsDialog, { ...props, open: true, onClose: () => {}, ...extra } as never),
    ),
  )

describe('productSettingsSections', () => {
  const sections = productSettingsSections(props)
  test('一般・アイコン・危険な操作の 3 つ。この順', () => {
    expect(sections.map((s) => s.label)).toEqual(['一般', 'アイコン', '危険な操作'])
    expect(new Set(sections.map((s) => s.id)).size).toBe(3)
  })
})

describe('ProductSettingsDialog', () => {
  const html = render()
  test('閉じているときは、描かない', () => {
    expect(render({ open: false })).not.toContain('プロダクト名')
  })
  test('左上の見出し「プロダクト設定」と、3 つのカテゴリ', () => {
    expect(html).toContain('>プロダクト設定</p>')
    expect(html).toContain('aria-label="プロダクト設定の項目"')
    for (const label of ['一般', 'アイコン', '危険な操作']) expect(html).toContain(label)
  })
  test('最初は「一般」: 選ばれているのは 1 つで、見出しと中身(プロダクト名の変更)が出る', () => {
    expect(html.match(/aria-current="page"/g)?.length).toBe(1)
    expect(html).toContain('>一般</h2>')
    expect(html).toContain('プロダクト名')
    expect(html).toContain('value="社内ツール"')
    expect(html).toContain('名前の変更')
    expect(html).not.toContain('画像を選んでください')
    expect(html).not.toContain('このプロダクトを削除')
  })
})
