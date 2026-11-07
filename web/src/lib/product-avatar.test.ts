import { describe, expect, test } from 'bun:test'
import {
  AVATAR_ACCEPT,
  AVATAR_MAX_BYTES,
  avatarErrorMessage,
  validateAvatarFile,
} from './product-avatar'

const f = (name: string, type: string, size = 100) => ({ name, type, size })

describe('validateAvatarFile', () => {
  test('GIF・PNG・JPEG・WebP は OK', () => {
    for (const [n, t] of [
      ['a.png', 'image/png'],
      ['a.jpg', 'image/jpeg'],
      ['a.gif', 'image/gif'],
      ['a.webp', 'image/webp'],
    ] as const)
      expect(validateAvatarFile(f(n, t))).toBeNull()
  })
  test('SVG・テキストは NG', () => {
    expect(validateAvatarFile(f('a.svg', 'image/svg+xml'))).toContain('GIF・PNG')
    expect(validateAvatarFile(f('a.txt', 'text/plain'))).toContain('GIF・PNG')
  })
  test('MIME が空なら拡張子で判定する', () => {
    expect(validateAvatarFile(f('a.JPEG', ''))).toBeNull()
    expect(validateAvatarFile(f('a.svg', ''))).not.toBeNull()
    expect(validateAvatarFile(f('noext', ''))).not.toBeNull()
  })
  test('MIME があれば拡張子は見ない', () => {
    expect(validateAvatarFile(f('a.png', 'text/plain'))).not.toBeNull()
  })
  test('1MB ちょうどは OK、+1 バイトは NG、0 バイトは NG', () => {
    expect(validateAvatarFile(f('a.png', 'image/png', AVATAR_MAX_BYTES))).toBeNull()
    expect(validateAvatarFile(f('a.png', 'image/png', AVATAR_MAX_BYTES + 1))).toContain('1MB')
    expect(validateAvatarFile(f('a.png', 'image/png', 0))).toContain('空')
  })
  test('accept は 4 種類', () => {
    expect(AVATAR_ACCEPT.split(',')).toHaveLength(4)
  })
})

describe('avatarErrorMessage', () => {
  test('ステータスごとの日本語', () => {
    expect(avatarErrorMessage(413)).toBe('画像は 1MB 以下にしてください')
    expect(avatarErrorMessage(415)).toBe('画像は GIF・PNG・JPEG・WebP のいずれかにしてください')
    expect(avatarErrorMessage(403)).toBe('アイコンを変更できるのは、プロダクトのリーダーだけです')
    for (const s of [0, 401, 404, 422, 500]) expect(avatarErrorMessage(s)).toMatch(/[ぁ-ん]/)
  })
})
