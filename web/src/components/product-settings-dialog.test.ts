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
  test('一般・アイコン・文書・プロダクトの削除の 4 つ。この順(危険なものを最後に。「危険な操作」ではなく、中身が分かる名前)', () => {
    expect(sections.map((s) => s.label)).toEqual(['一般', 'アイコン', '文書', 'プロダクトの削除'])
    expect(new Set(sections.map((s) => s.id)).size).toBe(4)
  })
  test('危険なのは「プロダクトの削除」だけ(赤で示す)', () => {
    expect(sections.map((s) => Boolean(s.danger))).toEqual([false, false, false, true])
  })
})

describe('ProductSettingsDialog', () => {
  const html = render()
  test('閉じているときは、描かない', () => {
    expect(render({ open: false })).not.toContain('プロダクト名')
  })
  test('左上の見出し「プロダクト設定」と、4 つのカテゴリ', () => {
    expect(html).toContain('>プロダクト設定</p>')
    expect(html).toContain('aria-label="プロダクト設定の項目"')
    for (const label of ['一般', 'アイコン', '文書', 'プロダクトの削除']) expect(html).toContain(label)
    expect(html).not.toContain('危険な操作')
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
  test('「プロダクトの削除」の項目だけ、赤(text-danger)で示す', () => {
    expect(html.match(/text-danger/g)?.length).toBe(1)
    expect(html).toMatch(/text-danger[^>]*>[\s\S]*?プロダクトの削除/)
  })
})
