import { describe, expect, test } from 'bun:test'
import { TOKEN_ACTIVE_MAX, TOKEN_DAYS_MAX, activeCount, envLine, listedTokens, parseTokenDays, tokenNameError, tokenState, tokenStateLabel } from './ai-token-ui'

describe('AI 用のトークンの画面(純粋な部分)', () => {
  test('名前: 空・空白だけ・61 文字は誤り。60 文字までよい', () => {
    expect(tokenNameError('Claude Code')).toBeNull()
    expect(tokenNameError('あ'.repeat(60))).toBeNull()
    expect(tokenNameError('')).toContain('名前を入力')
    expect(tokenNameError('   ')).toContain('名前を入力')
    expect(tokenNameError('あ'.repeat(61))).toContain('60 文字')
  })
  test('期限(日): 1〜365 の整数だけ', () => {
    expect(parseTokenDays('90')).toBe(90)
    expect(parseTokenDays(' 1 ')).toBe(1)
    expect(parseTokenDays(String(TOKEN_DAYS_MAX))).toBe(365)
    for (const bad of ['0', '366', '1.5', '-1', '', 'あ', '30日']) expect(parseTokenDays(bad)).toBeNull()
  })
  test('状態: 取り消し済み > 期限切れ > 有効(取り消し済みは、期限内でも取り消し済み)', () => {
    expect(tokenState({ revokedAt: null, active: true })).toBe('active')
    expect(tokenState({ revokedAt: null, active: false })).toBe('expired')
    expect(tokenState({ revokedAt: '2030-01-01T00:00:00.000Z', active: false })).toBe('revoked')
    expect(tokenState({ revokedAt: '2030-01-01T00:00:00.000Z', active: true })).toBe('revoked')
    expect(tokenStateLabel).toEqual({ active: '有効', expired: '期限切れ', revoked: '取り消し済み' })
  })
  test('有効なトークンの数は、有効なものだけ数える。上限は 10', () => {
    expect(TOKEN_ACTIVE_MAX).toBe(10)
    expect(
      activeCount([
        { revokedAt: null, active: true },
        { revokedAt: null, active: false },
        { revokedAt: 'x', active: false },
        { revokedAt: null, active: true },
      ]),
    ).toBe(2)
    expect(activeCount([])).toBe(0)
  })
  test('設定の一覧: 取り消し済みは出さない(取り消し済みは、期限内でも出さない)。期限切れと有効は出し、順番は保つ', () => {
    const a = { id: 'a', revokedAt: null, active: true }
    const b = { id: 'b', revokedAt: 'x', active: false }
    const c = { id: 'c', revokedAt: null, active: false }
    const d = { id: 'd', revokedAt: 'x', active: true }
    expect(listedTokens([a, b, c, d]).map((t) => t.id)).toEqual(['a', 'c'])
    expect(listedTokens([b, d])).toEqual([])
  })
  test('AI を動かす環境に設定する行は、環境変数 NINGYOUTUKAI_TOKEN', () => {
    expect(envLine('pmai_abc')).toBe('export NINGYOUTUKAI_TOKEN=pmai_abc')
  })
})
