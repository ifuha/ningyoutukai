import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AiTokenSettings, TokenRow } from './ai-token-settings'
import { settingsSections } from './settings-sections'
import type { AiTokenInfo } from '#/lib/document-api'

const token = (over: Partial<AiTokenInfo> = {}): AiTokenInfo => ({
  tokenId: 't1',
  name: 'Claude Code',
  tokenPrefix: 'pmai_ab12',
  createdAt: '2030-01-01T00:00:00.000Z',
  expiresAt: '2030-04-01T00:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
  active: true,
  ...over,
})
const row = (props: Partial<Parameters<typeof TokenRow>[0]> = {}) =>
  renderToStaticMarkup(createElement('ul', null, createElement(TokenRow, { token: token(), onAskRevoke: () => {}, onCancel: () => {}, onRevoke: () => {}, ...props })))

describe('TokenRow', () => {
  test('名前、先頭の数文字(中身ではない)、状態、期限、まだ使われていないこと', () => {
    const html = row()
    expect(html).toContain('Claude Code')
    expect(html).toContain('pmai_ab12…')
    expect(html).toContain('有効')
    expect(html).toContain('まだ使われていません')
  })
  test('最後に使った日時が出る', () => {
    expect(row({ token: token({ lastUsedAt: '2030-02-01T09:30:00.000Z' }) })).toContain('最後に使った')
  })
  test('項目は、ラベルと値の組(期限・最後に使った)。状態は、名前の横のバッジ。取り消しは、カードの下', () => {
    const html = row()
    const labels = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt>/g)].map((m) => m[1])
    expect(labels).toEqual(['期限', '最後に使った'])
    expect(html).toMatch(/data-state="active"[^>]*>有効</)
    expect(html.indexOf('data-state')).toBeLessThan(html.indexOf('<dl'))
    expect(html.indexOf('<dl')).toBeLessThan(html.indexOf('aria-label="取り消す"'))
  })
  test('取り消しは 2 段階: 最初は「取り消す」だけ。押すと「取り消す(確定)」と「やめる」', () => {
    const first = row()
    expect(first).toContain('aria-label="取り消す"')
    expect(first).not.toContain('取り消す(確定)')
    const second = row({ confirming: true })
    expect(second).toContain('aria-label="取り消す(確定)"')
    expect(second).toContain('aria-label="やめる"')
    expect(second).toContain('border-danger')
  })
  test('取り消し済み・期限切れには、取り消しのボタンが出ない', () => {
    const revoked = row({ token: token({ revokedAt: '2030-02-01T00:00:00.000Z', active: false }) })
    expect(revoked).toContain('取り消し済み')
    expect(revoked).not.toContain('aria-label="取り消す"')
    const expired = row({ token: token({ active: false }) })
    expect(expired).toContain('期限切れ')
    expect(expired).not.toContain('aria-label="取り消す"')
  })
})

describe('AiTokenSettings', () => {
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(AiTokenSettings)))
  test('何のトークンか(自分のタスクと渡された文書を読み、報告の下書きを保存するだけ)を説明する', () => {
    expect(html).toContain('あなたのタスク')
    expect(html).toContain('渡された文書')
    expect(html).toContain('報告の下書き')
    expect(html).toContain('自分で完了にすることはできません')
  })
  test('説明は、できること・できないこと・報告のラベルと値に分かれている', () => {
    const labels = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt>/g)].map((m) => m[1])
    expect(labels).toEqual(['できること', 'できないこと', '報告'])
  })
  test('発行のフォーム: 名前と期限(日)、「発行」ボタン。名前が空のうちは押せない', () => {
    expect(html).toContain('新しいトークンを発行する')
    expect(html).toContain('名前(どの AI か)')
    expect(html).toContain('期限(日。1〜365)')
    expect(html).toMatch(/<button[^>]*aria-label="発行"[^>]*disabled=""|<button[^>]*disabled=""[^>]*aria-label="発行"/)
  })
})

describe('ユーザー設定のカテゴリ', () => {
  test('「一般」「外観」「AI のトークン」の順。最初は一般', () => {
    expect(settingsSections.map((s) => s.id)).toEqual(['general', 'appearance', 'ai-token'])
    expect(settingsSections[2]!.label).toBe('AI のトークン')
  })
})
