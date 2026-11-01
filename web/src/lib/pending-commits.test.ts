import { describe, expect, test } from 'bun:test'
import {
  beginCommit,
  commitEpoch,
  endCommit,
  fetchUnlessCommitted,
  hasPendingCommit,
} from './pending-commits'

// 確定と重なった取得の応答は、捨てる(離した位置が、古いサーバーの状態に上書きされて、元に戻ったように見えないように)

const gate = () => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => (release = resolve))
  return { promise, release }
}

describe('確定の進行中の管理', () => {
  test('開始で進行中になり、終了で戻る(重なっても数える)', () => {
    expect(hasPendingCommit()).toBe(false)
    beginCommit()
    beginCommit()
    expect(hasPendingCommit()).toBe(true)
    endCommit()
    expect(hasPendingCommit()).toBe(true)
    endCommit()
    expect(hasPendingCommit()).toBe(false)
  })

  test('終了を余計に呼んでも、負にならない', () => {
    endCommit()
    endCommit()
    expect(hasPendingCommit()).toBe(false)
    beginCommit()
    expect(hasPendingCommit()).toBe(true)
    endCommit()
  })

  test('開始と終了のたびに、世代が進む', () => {
    const e = commitEpoch()
    beginCommit()
    endCommit()
    expect(commitEpoch()).toBeGreaterThan(e)
  })
})

describe('fetchUnlessCommitted', () => {
  test('確定と重ならなければ、取得の応答をそのまま返す', async () => {
    expect(await fetchUnlessCommitted(async () => 'server', () => 'screen')).toBe('server')
  })

  test('取得の間に確定が始まって終わったら、応答を捨てて、画面の値を返す', async () => {
    const g = gate()
    const pending = fetchUnlessCommitted(
      async () => {
        await g.promise
        return 'stale-server'
      },
      () => 'screen',
    )
    beginCommit()
    endCommit()
    g.release()
    expect(await pending).toBe('screen')
  })

  test('取得の間に確定が進行中なら(終わっていなくても)、応答を捨てる', async () => {
    const g = gate()
    const pending = fetchUnlessCommitted(
      async () => {
        await g.promise
        return 'stale-server'
      },
      () => 'screen',
    )
    beginCommit()
    g.release()
    expect(await pending).toBe('screen')
    endCommit()
  })

  test('確定の進行中に始まった取得も、応答を捨てる', async () => {
    beginCommit()
    const result = await fetchUnlessCommitted(async () => 'stale-server', () => 'screen')
    endCommit()
    expect(result).toBe('screen')
  })

  test('画面の値が無ければ(まだ何も取れていない)、応答を使う', async () => {
    beginCommit()
    const result = await fetchUnlessCommitted(async () => 'server', () => undefined)
    endCommit()
    expect(result).toBe('server')
  })

  test('確定が終わったあとに始まった取得は、応答を使う(確定後の状態)', async () => {
    beginCommit()
    endCommit()
    expect(await fetchUnlessCommitted(async () => 'fresh-server', () => 'screen')).toBe('fresh-server')
  })
})
