import { describe, expect, test } from 'bun:test'
import { QueryClient, QueryObserver, notifyManager } from '@tanstack/react-query'
import { microtaskScheduler, useMicrotaskNotifications } from './query-scheduler'

// データの更新が、画面へ「同じタスクの中(マイクロタスク)」で届くこと。
// 既定の setTimeout(0)(次のタスク)だと、描画が間に入って、確定の直後に元の位置が一瞬見える

const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('microtaskScheduler', () => {
  test('渡したコールバックを、マイクロタスクで呼ぶ(その場では呼ばない)', async () => {
    let called = false
    microtaskScheduler(() => (called = true))
    expect(called).toBe(false)
    await flushMicrotasks()
    expect(called).toBe(true)
  })
})

describe('useMicrotaskNotifications', () => {
  test('キャッシュの更新が、次のタスク(setTimeout)を待たずに、観察している側へ届く', async () => {
    useMicrotaskNotifications()
    const client = new QueryClient()
    const key = ['products', 'p1', 'tree']
    client.setQueryData(key, { v: 0 })
    const observer = new QueryObserver(client, { queryKey: key, queryFn: () => ({ v: 0 }), staleTime: Infinity })
    const seen: number[] = []
    // React の useQuery と同じ形: リスナーを batchCalls で包む(スケジューラを通って、React に届く)
    const unsubscribe = observer.subscribe(
      notifyManager.batchCalls((result) => {
        const v = (result.data as { v: number } | undefined)?.v
        if (v !== undefined) seen.push(v)
      }),
    )
    await flushMicrotasks()
    seen.length = 0

    client.setQueryData(key, { v: 1 })
    expect(seen).toEqual([]) // その場では届かない
    await flushMicrotasks() // タイマーは待たない(マイクロタスクだけ)
    expect(seen).toContain(1)
    unsubscribe()
    client.clear()
  })

  test('何度呼んでも安全(アプリの起動で、複数回呼ばれても同じ)', () => {
    useMicrotaskNotifications()
    useMicrotaskNotifications()
    expect(typeof notifyManager.setScheduler).toBe('function')
  })
})
