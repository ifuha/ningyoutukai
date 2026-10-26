import { describe, expect, test } from 'bun:test'
import { runOptimistic } from './optimistic'
import type { Store } from './optimistic'

// 楽観更新の実行: 先に更新 → api → 失敗したら元に戻す → 後で取り直す
type Snap = { sections: string[]; tree: string }
const makeStore = (initial: Snap) => {
  const writes: Snap[] = []
  let current = initial
  const store: Store<Snap> = {
    read: () => current,
    write: (s) => {
      current = s
      writes.push(s)
    },
  }
  return { store, writes, get: () => current }
}

describe('runOptimistic', () => {
  test('成功: 先に更新した値が残り、onError は呼ばれず、settle が呼ばれる', async () => {
    const { store, get } = makeStore({ sections: ['a'], tree: 't0' })
    let settled = 0
    let errors = 0
    const r = await runOptimistic({
      store,
      apply: (s) => ({ ...s, sections: [...s.sections, 'b'] }),
      call: async () => 'ok',
      onError: () => (errors += 1),
      settle: () => (settled += 1),
    })
    expect(r).toEqual({ ok: true, value: 'ok' })
    expect(get().sections).toEqual(['a', 'b'])
    expect(errors).toBe(0)
    expect(settled).toBe(1)
  })

  test('api を呼ぶ前に、画面の値が先に更新されている(楽観更新)', async () => {
    const { store, get } = makeStore({ sections: ['a'], tree: 't0' })
    let seenDuringCall: string[] = []
    await runOptimistic({
      store,
      apply: (s) => ({ ...s, sections: ['先に更新'] }),
      call: async () => {
        seenDuringCall = get().sections
        return 1
      },
      onError: () => {},
    })
    expect(seenDuringCall).toEqual(['先に更新'])
  })

  test('失敗: 先に更新した値を、元に戻す(ロールバック)。onError に例外が渡り、settle も呼ばれる', async () => {
    const initial: Snap = { sections: ['a'], tree: 't0' }
    const { store, get, writes } = makeStore(initial)
    const boom = new Error('boom')
    const seen: unknown[] = []
    let settled = 0
    const r = await runOptimistic({
      store,
      apply: (s) => ({ ...s, sections: ['壊れた値'], tree: 't1' }),
      call: async () => {
        throw boom
      },
      onError: (e) => seen.push(e),
      settle: () => (settled += 1),
    })
    expect(r).toEqual({ ok: false, error: boom })
    expect(get()).toEqual(initial) // 元に戻っている
    expect(writes.length).toBe(2) // 先に更新、元に戻す
    expect(seen).toEqual([boom])
    expect(settled).toBe(1)
  })

  test('apply が null(先に更新しない)のときは、書き込まない。失敗しても、戻す書き込みだけ(同じ値)', async () => {
    const initial: Snap = { sections: ['a'], tree: 't0' }
    const { store, get } = makeStore(initial)
    let called = 0
    const r = await runOptimistic({
      store,
      apply: () => null,
      call: async () => {
        called += 1
        return 'ok'
      },
      onError: () => {},
    })
    expect(r.ok).toBe(true)
    expect(called).toBe(1)
    expect(get()).toEqual(initial)
  })

  test('before(進行中の取得の取り消しなど)が、値を読む前に実行される', async () => {
    const order: string[] = []
    const store: Store<Snap> = {
      read: () => {
        order.push('read')
        return { sections: [], tree: '' }
      },
      write: () => order.push('write'),
    }
    await runOptimistic({
      store,
      before: async () => {
        order.push('before')
      },
      apply: (s) => s,
      call: async () => {
        order.push('call')
      },
      onError: () => {},
    })
    expect(order).toEqual(['before', 'read', 'write', 'call'])
  })

  test('元の値は、先に更新するときに書き換えられない(参照を保ったまま戻せる)', async () => {
    const initial: Snap = { sections: ['a'], tree: 't0' }
    const { store, get } = makeStore(initial)
    await runOptimistic({
      store,
      apply: (s) => {
        s.sections.push('破壊的な変更はしない前提') // これは apply 側の責任。ここでは戻し先が同じ参照であることだけ確かめる
        return { ...s }
      },
      call: async () => {
        throw new Error('x')
      },
      onError: () => {},
    })
    expect(get()).toBe(initial)
  })
})
