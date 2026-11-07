import { describe, expect, test } from 'bun:test'
import { parseProductSearch } from './product-search'

describe('parseProductSearch', () => {
  test('manage=product は残す', () => {
    expect(parseProductSearch({ manage: 'product' })).toEqual({ manage: 'product' })
  })
  test('ないときは空', () => {
    expect(parseProductSearch({})).toEqual({})
  })
  test('不正な値は捨てる', () => {
    expect(parseProductSearch({ manage: 'member' })).toEqual({})
    expect(parseProductSearch({ manage: '' })).toEqual({})
    expect(parseProductSearch({ manage: 1 })).toEqual({})
    expect(parseProductSearch({ manage: ['product'] })).toEqual({})
    expect(parseProductSearch({ manage: true })).toEqual({})
  })
  test('ほかのパラメータは持ち越さない', () => {
    expect(parseProductSearch({ manage: 'product', x: '1' })).toEqual({ manage: 'product' })
  })
})
