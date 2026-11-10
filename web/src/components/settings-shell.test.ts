import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Palette, User } from 'lucide-react'
import { SettingsShell, resolveSection } from './settings-shell'
import { SettingsDialog } from './settings-dialog'

const sections = [
  { id: 'a', label: '外観', icon: Palette, render: () => createElement('p', null, 'Aの中身') },
  { id: 'b', label: 'ひと', icon: User, render: () => createElement('p', null, 'Bの中身') },
]
const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(SettingsShell, {
      open: true,
      onClose: () => {},
      title: 'プロダクト設定',
      ariaLabel: 'プロダクト設定の項目',
      sections,
      ...props,
    } as never),
  )

describe('resolveSection', () => {
  test('id で選ぶ。なければ先頭', () => {
    expect(resolveSection(sections, 'b').id).toBe('b')
    expect(resolveSection(sections, 'zzz').id).toBe('a')
  })
})

describe('SettingsShell', () => {
  const html = render()
  test('閉じているときは、描かない', () => {
    expect(render({ open: false })).not.toContain('Aの中身')
  })
  test('見出し(title)・カテゴリの一覧・閉じるボタンが出る', () => {
    expect(html).toContain('プロダクト設定')
    expect(html).toContain('aria-label="プロダクト設定の項目"')
    expect(html).toContain('外観')
    expect(html).toContain('ひと')
    expect(html).toMatch(/aria-label="閉じる"/)
  })
  test('最初は先頭のカテゴリ: aria-current が先頭だけ。右の見出しと中身も先頭', () => {
    expect(html.match(/aria-current="page"/g)?.length).toBe(1)
    expect(html).toMatch(/aria-current="page"[^>]*>.*?外観/)
    expect(html).toContain('>外観</h2>')
    expect(html).toContain('Aの中身')
    expect(html).not.toContain('Bの中身')
  })
})

describe('SettingsShell: 危険なカテゴリ(danger)', () => {
  const withDanger = [
    sections[0],
    { id: 'd', label: 'プロダクトの削除', icon: User, danger: true, render: () => createElement('p', null, 'Dの中身') },
  ]
  test('danger のカテゴリの項目だけ、赤(text-danger)。ほかは赤くしない', () => {
    const html = render({ sections: withDanger })
    expect(html.match(/text-danger/g)?.length).toBe(1)
  })
  test('danger のカテゴリを選んでいるとき(先頭にして試す)は、右の見出しも赤にする', () => {
    const html = render({ sections: [withDanger[1], withDanger[0]] })
    expect(html).toMatch(/<h2 [^>]*class="text-l font-bold text-danger">プロダクトの削除<\/h2>/)
    // 項目(1)と見出し(1)
    expect(html.match(/text-danger/g)?.length).toBe(2)
  })
  test('danger でないカテゴリを選んでいるとき、見出しは赤くない', () => {
    expect(render({ sections: withDanger })).toMatch(/<h2 [^>]*class="text-l font-bold">外観<\/h2>/)
  })
})

describe('SettingsDialog(ユーザー設定)', () => {
  // 最初のカテゴリ(一般)は、連携を取得するので、QueryClient が要る
  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, createElement(SettingsDialog, { open: true, onClose: () => {} })),
  )
  test('見出し「設定」・項目の nav・一般が選ばれている', () => {
    expect(html).toContain('aria-label="設定の項目"')
    expect(html).toContain('>設定</p>')
    expect(html).toContain('>一般</h2>')
    expect(html).toMatch(/aria-current="page"/)
  })
})
