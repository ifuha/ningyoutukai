import { describe, expect, test } from 'bun:test'
import { collectFollowers, createFollower, followSelectors, type FollowElement } from '#/lib/drag-follow'

const el = (): FollowElement => ({ style: { transform: '' } })

describe('followSelectors', () => {
  test('セクションの四角・編集枠・所属メンバーのカードを、1 つのセレクターにする', () => {
    expect(followSelectors('sec-1', ['m1', 'm2'])).toBe(
      '[data-section-id="sec-1"], [data-section-editor="sec-1"], [data-card-id="m1"], [data-card-id="m2"]',
    )
  })

  test('所属メンバーがいなくても、四角と編集枠は動かす', () => {
    expect(followSelectors('sec-1', [])).toBe('[data-section-id="sec-1"], [data-section-editor="sec-1"]')
  })

  test('セレクターを壊す値(引用符・括弧など)は、探さない', () => {
    expect(followSelectors('a"] , body, [x="', ['m"1'])).toBe('')
    expect(followSelectors('ok', ['bad"id', 'good-1'])).toBe(
      '[data-section-id="ok"], [data-section-editor="ok"], [data-card-id="good-1"]',
    )
  })
})

describe('collectFollowers', () => {
  test('root に、組み立てたセレクターで 1 回だけ問い合わせる', () => {
    const calls: string[] = []
    const found = [el(), el()]
    const root = {
      querySelectorAll: (s: string) => {
        calls.push(s)
        return found
      },
    }
    const result = collectFollowers(root, 'sec-1', ['m1'])
    expect(calls).toEqual(['[data-section-id="sec-1"], [data-section-editor="sec-1"], [data-card-id="m1"]'])
    expect(result).toEqual(found)
  })

  test('探せる値が 1 つもなければ、問い合わせない', () => {
    let called = 0
    const root = {
      querySelectorAll: () => {
        called++
        return []
      },
    }
    expect(collectFollowers(root, 'bad"', [])).toEqual([])
    expect(called).toBe(0)
  })
})

describe('createFollower', () => {
  test('apply は、全部の要素に、同じ translate を書く(キャンバスの座標の差分)', () => {
    const a = el()
    const b = el()
    const f = createFollower([a, b])
    f.apply(12.5, -30)
    expect(a.style.transform).toBe('translate(12.5px, -30px)')
    expect(b.style.transform).toBe('translate(12.5px, -30px)')
  })

  test('差分は絶対(途中を飛ばしても、最後の値で決まる)', () => {
    const a = el()
    const f = createFollower([a])
    f.apply(1, 1)
    f.apply(40, 25)
    f.apply(300, 200)
    expect(a.style.transform).toBe('translate(300px, 200px)')
  })

  test('reset は、書いた分を空に戻す。reset のあとの apply は、また書く', () => {
    const a = el()
    const f = createFollower([a])
    f.apply(5, 5)
    f.reset()
    expect(a.style.transform).toBe('')
    f.apply(5, 5)
    expect(a.style.transform).toBe('translate(5px, 5px)')
  })

  test('要素が 0 個でも、安全', () => {
    const f = createFollower([])
    f.apply(1, 2)
    f.reset()
  })
})
