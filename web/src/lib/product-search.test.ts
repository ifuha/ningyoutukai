import { describe, expect, test } from 'bun:test'
import { parseProductSearch } from './product-search'

describe('parseProductSearch', () => {
  test('settings=product は残す', () => {
    expect(parseProductSearch({ settings: 'product' })).toEqual({ settings: 'product' })
  })
  test('ないときは空', () => {
    expect(parseProductSearch({})).toEqual({})
  })
  test('不正な値は捨てる', () => {
    expect(parseProductSearch({ settings: 'member' })).toEqual({})
    expect(parseProductSearch({ settings: '' })).toEqual({})
    expect(parseProductSearch({ settings: 1 })).toEqual({})
    expect(parseProductSearch({ settings: ['product'] })).toEqual({})
    expect(parseProductSearch({ settings: true })).toEqual({})
  })
  test('古い名前(manage)は使わない', () => {
    expect(parseProductSearch({ manage: 'product' })).toEqual({})
  })
  test('ほかのパラメータは持ち越さない', () => {
    expect(parseProductSearch({ settings: 'product', x: '1' })).toEqual({ settings: 'product' })
  })
})
