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
    const oks: boolean[] = []
    const r = await runOptimistic({
      store,
      apply: (s) => ({ ...s, sections: [...s.sections, 'b'] }),
      call: async () => 'ok',
      onError: () => (errors += 1),
      settle: (ok) => {
        settled += 1
        oks.push(ok)
      },
    })
    expect(r).toEqual({ ok: true, value: 'ok' })
    expect(get().sections).toEqual(['a', 'b'])
    expect(errors).toBe(0)
    expect(settled).toBe(1)
    expect(oks).toEqual([true]) // 成功を知らせる(呼び出し側は、取り直さない)
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
    const oks: boolean[] = []
    const r = await runOptimistic({
      store,
      apply: (s) => ({ ...s, sections: ['壊れた値'], tree: 't1' }),
      call: async () => {
        throw boom
      },
      onError: (e) => seen.push(e),
      settle: (ok) => {
        settled += 1
        oks.push(ok)
      },
    })
    expect(r).toEqual({ ok: false, error: boom })
    expect(get()).toEqual(initial) // 元に戻っている
    expect(writes.length).toBe(2) // 先に更新、元に戻す
    expect(seen).toEqual([boom])
    expect(settled).toBe(1)
    expect(oks).toEqual([false]) // 失敗を知らせる(呼び出し側は、すぐ取り直す)
  })

  test('apply が null(先に更新しない)のときは、書き込まない', async () => {
    const initial: Snap = { sections: ['a'], tree: 't0' }
    const { store, get, writes } = makeStore(initial)
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
    expect(writes.length).toBe(0)
  })

  test('先に更新していないなら、失敗しても元に戻す書き込みをしない(その間に入った他の更新を、古い値で上書きしない)', async () => {
    const initial: Snap = { sections: ['a'], tree: 't0' }
    const { store, get, writes } = makeStore(initial)
    const errors: unknown[] = []
    const r = await runOptimistic({
      store,
      apply: () => null,
      call: async () => {
        // api を待っている間に、別の更新が入った
        store.write({ sections: ['a', '別の更新'], tree: 't0' })
        throw new Error('失敗')
      },
      onError: (e) => errors.push(e),
    })
    expect(r.ok).toBe(false)
    expect(errors.length).toBe(1)
    expect(get().sections).toEqual(['a', '別の更新']) // 古い値(['a'])で上書きされない
    expect(writes.length).toBe(1)
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

  test('事前の確認(before)で例外が出ても、settle(false) が呼ばれる(取り直しに進める)', async () => {
    const { store } = makeStore({ sections: ['a'], tree: 't0' })
    const oks: boolean[] = []
    await runOptimistic({
      store,
      before: async () => {
        throw new Error('cancel failed')
      },
      apply: () => null,
      call: async () => 'ok',
      onError: () => {},
      settle: (ok) => oks.push(ok),
    }).catch(() => {})
    expect(oks).toEqual([false])
  })

  test('before が何も返さなければ、待たずに、その場で先に更新する(await する前に、画面の値が変わっている)', async () => {
    const { store, get } = makeStore({ sections: ['a'], tree: 't0' })
    // await しない。呼んだ直後(同じ tick)の値を見る
    const pending = runOptimistic({
      store,
      before: () => undefined,
      apply: (s) => ({ ...s, sections: ['先に更新'] }),
      call: async () => 'ok',
      onError: () => {},
    })
    expect(get().sections).toEqual(['先に更新'])
    await pending
  })

  test('before を渡さなくても、その場で先に更新する', async () => {
    const { store, get } = makeStore({ sections: ['a'], tree: 't0' })
    const pending = runOptimistic({
      store,
      apply: (s) => ({ ...s, sections: ['先に更新'] }),
      call: async () => 'ok',
      onError: () => {},
    })
    expect(get().sections).toEqual(['先に更新'])
    await pending
  })

  test('before が Promise を返したら、終わるまで待ってから、先に更新する(取り消しの巻き戻しに、上書きされない)', async () => {
    const { store, get } = makeStore({ sections: ['a'], tree: 't0' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const pending = runOptimistic({
      store,
      before: () => gate,
      apply: (s) => ({ ...s, sections: ['先に更新'] }),
      call: async () => 'ok',
      onError: () => {},
    })
    await Promise.resolve()
    expect(get().sections).toEqual(['a']) // まだ待っている
    release()
    await pending
    expect(get().sections).toEqual(['先に更新'])
  })
})
