import { describe, expect, test } from 'bun:test'
import { candidateValue, moveActive } from './invite-candidate'

describe('candidateValue', () => {
  test('GitHub の username があれば、それ', () => {
    expect(candidateValue({ githubId: 'octocat', email: null })).toBe('octocat')
  })
  test('なければメール', () => {
    expect(candidateValue({ githubId: null, email: 'a@example.com' })).toBe('a@example.com')
  })
  test('どちらもなければ空', () => {
    expect(candidateValue({ githubId: null, email: null })).toBe('')
  })
})

describe('moveActive', () => {
  test('候補がなければ -1', () => {
    expect(moveActive(0, 1, 0)).toBe(-1)
  })
  test('選択なしから ↓ は先頭、↑ は末尾', () => {
    expect(moveActive(-1, 1, 3)).toBe(0)
    expect(moveActive(-1, -1, 3)).toBe(2)
  })
  test('端で折り返す', () => {
    expect(moveActive(2, 1, 3)).toBe(0)
    expect(moveActive(0, -1, 3)).toBe(2)
    expect(moveActive(0, 1, 3)).toBe(1)
  })
})
