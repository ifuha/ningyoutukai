import { describe, expect, test } from 'bun:test'
import { ApiError } from './api'
import { OUT_OF_RANGE_MESSAGE, sectionErrorMessage } from './section-messages'

describe('sectionErrorMessage(失敗の種類 → 短い日本語)', () => {
  const msg = (status: number, message = '(api の文)') => sectionErrorMessage(new ApiError(status, message))
  test('403: リーダーだけ', () => {
    expect(msg(403)).toBe('この操作は、リーダーだけができます')
  })
  test('404: 見つからない(表示を更新する)', () => {
    expect(msg(404)).toContain('見つかりません')
  })
  test('409: 同じ名前がある', () => {
    expect(msg(409)).toBe('同じ名前のセクションがすでにあります')
  })
  test('422: 保存できない', () => {
    expect(msg(422)).toBe('この内容では保存できません')
  })
  test('通信できなかった(status 0)', () => {
    expect(msg(0)).toContain('通信できません')
  })
  test('401: ログインが必要', () => {
    expect(msg(401)).toBe('ログインが必要です')
  })
  test('その他の ApiError・想定外の例外・文字列は、一般的な文', () => {
    expect(msg(500)).toBe('エラーが発生しました')
    expect(sectionErrorMessage(new Error('x'))).toBe('エラーが発生しました')
    expect(sectionErrorMessage('x')).toBe('エラーが発生しました')
    expect(sectionErrorMessage(undefined)).toBe('エラーが発生しました')
  })
  test('api の message は、そのまま出さない(項目名が英語で出ることがあるため)', () => {
    expect(msg(422, 'sectionName が不正')).not.toContain('sectionName')
  })
  test('上限を超えて動かせないときの文', () => {
    expect(OUT_OF_RANGE_MESSAGE).toContain('動かせません')
  })
})
