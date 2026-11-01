import { describe, expect, test } from 'bun:test'
import { cancelIfFetching, resyncOnFailure } from './use-section-actions'
import { runOptimistic } from './optimistic'

// 確定のあとの取り直し: 成功したら取り直さない(api への GET を増やさない)。失敗したときだけ、すぐ取り直す

function fakeClient() {
  const invalidated: Array<readonly unknown[]> = []
  return {
    invalidated,
    client: {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        invalidated.push(queryKey)
      },
    },
  }
}

const keys = [
  ['products', 'p1', 'sections'],
  ['products', 'p1', 'tree'],
] as const

describe('resyncOnFailure', () => {
  test('成功(ok = true)なら、何も取り直さない', () => {
    const { client, invalidated } = fakeClient()
    resyncOnFailure(client, keys)(true)
    expect(invalidated).toEqual([])
  })

  test('失敗(ok = false)なら、セクションとツリーを取り直す', () => {
    const { client, invalidated } = fakeClient()
    resyncOnFailure(client, keys)(false)
    expect(invalidated).toEqual([
      ['products', 'p1', 'sections'],
      ['products', 'p1', 'tree'],
    ])
  })
})

describe('確定(runOptimistic)と組み合わせる', () => {
  type Snap = { v: number }
  const makeStore = () => {
    let current: Snap = { v: 0 }
    return { store: { read: () => current, write: (s: Snap) => void (current = s) } }
  }

  test('api が成功したら、取り直しの GET は 1 回も起きない', async () => {
    const { client, invalidated } = fakeClient()
    const { store } = makeStore()
    const r = await runOptimistic({
      store,
      apply: () => ({ v: 1 }),
      call: async () => 'saved',
      onError: () => {},
      settle: resyncOnFailure(client, keys),
    })
    expect(r.ok).toBe(true)
    expect(invalidated).toEqual([])
  })

  test('api が失敗したら、画面を元に戻して、取り直す', async () => {
    const { client, invalidated } = fakeClient()
    const { store } = makeStore()
    const r = await runOptimistic({
      store,
      apply: () => ({ v: 1 }),
      call: async () => {
        throw new Error('Worker exceeded CPU time limit')
      },
      onError: () => {},
      settle: resyncOnFailure(client, keys),
    })
    expect(r.ok).toBe(false)
    expect(store.read()).toEqual({ v: 0 })
    expect(invalidated.length).toBe(2)
  })
})

describe('cancelIfFetching(進行中の取得があるものだけ取り消す)', () => {
  function fakeFetchClient(fetching: Record<string, number>) {
    const cancelled: string[] = []
    return {
      cancelled,
      client: {
        isFetching: ({ queryKey }: { queryKey: readonly unknown[] }) => fetching[String(queryKey)] ?? 0,
        cancelQueries: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
          cancelled.push(String(queryKey))
        },
      },
    }
  }
  const k1 = ['products', 'p1', 'sections'] as const
  const k2 = ['products', 'p1', 'tree'] as const

  test('進行中の取得がなければ、何も返さない(呼び出し側は、待たずに先へ進める)', () => {
    const { client, cancelled } = fakeFetchClient({})
    expect(cancelIfFetching(client, [k1, k2])).toBeUndefined()
    expect(cancelled).toEqual([])
  })

  test('進行中のものだけ取り消し、終わるまで待てる Promise を返す', async () => {
    const { client, cancelled } = fakeFetchClient({ [String(k2)]: 1 })
    const waiting = cancelIfFetching(client, [k1, k2])
    expect(waiting).toBeInstanceOf(Promise)
    await waiting
    expect(cancelled).toEqual([String(k2)])
  })

  test('両方進行中なら、両方取り消す', async () => {
    const { client, cancelled } = fakeFetchClient({ [String(k1)]: 1, [String(k2)]: 2 })
    await cancelIfFetching(client, [k1, k2])
    expect(cancelled.sort()).toEqual([String(k1), String(k2)].sort())
  })
})
