import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccountInfo, formatJoined, providerLabel } from './settings-account'

// 設定「一般」: 自分のアカウント情報(表示だけ)

const render = (props: Partial<Parameters<typeof AccountInfo>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(AccountInfo, { user: { name: '山田太郎', email: 'taro@example.com', image: null, createdAt: '2026-11-10T00:00:00.000Z' }, providers: ['github'], ...props }),
  )

describe('AccountInfo', () => {
  test('名前・メール・登録日・ログインの連携が出る', () => {
    const html = render()
    expect(html).toContain('山田太郎')
    expect(html).toContain('taro@example.com')
    expect(html).toContain('2026年11月10日')
    expect(html).toContain('GitHub')
  })
  test('アイコンは、ラベルなしで一覧の上に出る。項目は、名前・メールアドレス・ログインの連携・登録日の順に並ぶ', () => {
    const html = render()
    const labels = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt>/g)].map((m) => m[1])
    expect(labels).toEqual(['名前', 'メールアドレス', 'ログインの連携', '登録日'])
    expect(html).not.toContain('アイコン')
    // ラベルと値の数が合う
    expect(html.match(/<dd/g)?.length).toBe(4)
    // アイコンは一覧(dl)より前
    expect(html.indexOf('data-account-avatar')).toBeLessThan(html.indexOf('<dl'))
  })
  test('アイコンがなければ、名前の頭文字の丸。あれば、画像(丸)', () => {
    const none = render()
    expect(none).toContain('data-account-avatar-fallback')
    expect(none).toMatch(/data-account-avatar-fallback[^>]*>山</)
    const withImage = render({ user: { name: '山田太郎', email: 'a@b.c', image: 'https://example.com/a.png' } })
    expect(withImage).toContain('src="https://example.com/a.png"')
    expect(withImage).toContain('rounded-full')
    expect(withImage).not.toContain('data-account-avatar-fallback')
  })
  test('連携が取れていない(null)・空のときは、その行を出さない。登録日が読めなければ、その行も出さない', () => {
    expect(render({ providers: null })).not.toContain('data-account-providers')
    expect(render({ providers: [] })).not.toContain('data-account-providers')
    expect(render({ user: { name: 'a', email: 'a@b.c', createdAt: 'x' } })).not.toContain('登録日')
    expect(render({ user: { name: 'a', email: 'a@b.c' } })).not.toContain('登録日')
  })
  test('連携が複数なら、読点でつなぐ', () => {
    expect(render({ providers: ['github', 'google'] })).toContain('GitHub、Google')
  })
  test('名前が空でも壊れない(頭文字は ?)', () => {
    expect(render({ user: { name: '', email: 'a@b.c' } })).toMatch(/data-account-avatar-fallback[^>]*>\?</)
  })
})

describe('providerLabel / formatJoined', () => {
  test('知っている連携は名前にし、知らないものは、そのまま出す', () => {
    expect(providerLabel('google')).toBe('Google')
    expect(providerLabel('credential')).toBe('メールとパスワード')
    expect(providerLabel('discord')).toBe('discord')
  })
  test('登録日は日本時間(UTC の 15 時を過ぎると、翌日)', () => {
    expect(formatJoined('2026-11-10T14:59:00.000Z')).toBe('2026年11月10日')
    expect(formatJoined('2026-11-10T15:00:00.000Z')).toBe('2026年11月11日')
    expect(formatJoined(null)).toBe('')
    expect(formatJoined('x')).toBe('')
  })
})
