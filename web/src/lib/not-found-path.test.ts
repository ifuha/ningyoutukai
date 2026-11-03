import { describe, expect, test } from 'bun:test'
import { MAX_PATH_LENGTH, displayPath } from './not-found-path'

describe('displayPath(見つからなかったパスを、画面に出す形に)', () => {
  test('ふつうのパスは、そのまま', () => {
    expect(displayPath('/no-such-page')).toBe('/no-such-page')
    expect(displayPath('/products/abc/tree')).toBe('/products/abc/tree')
  })

  test('検索文字列とハッシュは、出さない(トークンなどが入っていても、画面に残さない)', () => {
    expect(displayPath('/x?token=secret')).toBe('/x')
    expect(displayPath('/x#section')).toBe('/x')
    expect(displayPath('/x?a=1#b')).toBe('/x')
  })

  test('パーセントエンコードは、読める形に戻す。壊れたものは、そのまま', () => {
    expect(displayPath('/%E3%83%9A%E3%83%BC%E3%82%B8')).toBe('/ページ')
    expect(displayPath('/%E3%81')).toBe('/%E3%81')
  })

  test('制御文字(改行・タブなど)は、空白にして 1 行に収める', () => {
    expect(displayPath('/a\nb\tc')).toBe('/a b c')
    expect(displayPath('/a\u0000b')).toBe('/a b')
    expect(displayPath('/a%0Ab')).toBe('/a b')
  })

  test('空・スラッシュなし・空白だけは、/ にそろえる', () => {
    expect(displayPath('')).toBe('/')
    expect(displayPath('   ')).toBe('/')
    expect(displayPath('?only=query')).toBe('/')
    expect(displayPath('abc')).toBe('/abc')
  })

  test('長すぎるパスは、最大の長さに収めて、末尾に … を付ける', () => {
    const long = `/${'a'.repeat(200)}`
    const shown = displayPath(long)
    expect(shown).toHaveLength(MAX_PATH_LENGTH)
    expect(shown.endsWith('…')).toBe(true)
    // ちょうど最大の長さのものは、切らない
    const exact = `/${'b'.repeat(MAX_PATH_LENGTH - 1)}`
    expect(displayPath(exact)).toBe(exact)
  })

  test('HTML のような文字は、そのまま返す(React が文字として出すので、解釈されない)', () => {
    expect(displayPath('/<script>alert(1)</script>')).toBe('/<script>alert(1)</script>')
  })
})
