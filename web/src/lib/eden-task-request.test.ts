import { describe, expect, test } from 'bun:test'
import { createClient } from './eden'

const P = '11111111-1111-4111-8111-111111111111'
const T = '22222222-2222-4222-8222-222222222222'
const K = '33333333-3333-4333-8333-333333333333'

type Sent = { url: string; method: string; body: string | null; contentType: string | null }

/** 送られた要求(URL、メソッド、本文)を記録する、偽の `fetch` を差した Eden クライアント */
function recorder() {
  const sent: Sent[] = []
  const client = createClient('http://localhost:3001', {
    fetcher: (async (input: Request | string | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init)
      sent.push({
        url: req.url,
        method: req.method,
        body: init?.body == null ? null : String(init.body),
        contentType: new Headers(init?.headers).get('content-type'),
      })
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch,
  })
  return { client, sent }
}

// タスクの作成・更新の本文は、旧 `api()` の `JSON.stringify(...)` と同じ文字列でなければならない。
// task-form.tsx は期限を ISO 文字列(`toIso`)で渡す。Eden が `Date` として直列化し直したり、null を落としたりしないことを確かめる
describe('タスクの作成・更新のリクエスト(Eden)', () => {
  const iso = '2026-12-01T09:00:00+09:00'
  const base = { taskName: 'a', productMemberId: T, isVisible: true }

  test('作成: 期限あり。本文は旧と同じ JSON(期限は ISO 文字列のまま)', async () => {
    const { client, sent } = recorder()
    const body = { ...base, description: 'd', timeLimit: iso, taskTypeId: K }
    await client.api.product({ productId: P }).task.post(body)
    expect(sent[0].method).toBe('POST')
    expect(sent[0].url).toBe(`http://localhost:3001/api/product/${P}/task`)
    expect(sent[0].body).toBe(JSON.stringify(body))
    expect(sent[0].contentType).toContain('application/json')
  })

  test('作成: 期限なし(キーごと送らない)', async () => {
    const { client, sent } = recorder()
    await client.api.product({ productId: P }).task.post(base)
    expect(sent[0].body).toBe(JSON.stringify(base))
    expect(sent[0].body).not.toContain('timeLimit')
  })

  test('更新: 期限を設定', async () => {
    const { client, sent } = recorder()
    await client.api.product({ productId: P }).task({ taskId: T }).patch({ timeLimit: iso })
    expect(sent[0].method).toBe('PATCH')
    expect(sent[0].url).toBe(`http://localhost:3001/api/product/${P}/task/${T}`)
    expect(sent[0].body).toBe(JSON.stringify({ timeLimit: iso }))
  })

  test('更新: 期限を消す(null はそのまま送る)', async () => {
    const { client, sent } = recorder()
    const body = { timeLimit: null, description: null, taskName: 'b', isVisible: false }
    await client.api.product({ productId: P }).task({ taskId: T }).patch(body)
    expect(sent[0].body).toBe(JSON.stringify(body))
    expect(sent[0].body).toContain('"timeLimit":null')
  })

  test('種類の割り当て・削除・完了報告・完了確認・種類の一覧は、本文なしで、旧と同じ URL とメソッド', async () => {
    const { client, sent } = recorder()
    const task = client.api.product({ productId: P }).task({ taskId: T })
    await task.task_kinds({ kindId: K }).patch()
    await task.delete()
    await task['complete-report'].post()
    await task.complete.patch()
    await client.api.product({ productId: P }).task_kinds.get()
    const base = `http://localhost:3001/api/product/${P}`
    expect(sent.map((s) => [s.method, s.url, s.body])).toEqual([
      ['PATCH', `${base}/task/${T}/task_kinds/${K}`, null],
      ['DELETE', `${base}/task/${T}`, null],
      ['POST', `${base}/task/${T}/complete-report`, null],
      ['PATCH', `${base}/task/${T}/complete`, null],
      ['GET', `${base}/task_kinds`, null],
    ])
  })
})
