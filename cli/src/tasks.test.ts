import { afterEach, describe, expect, test } from 'bun:test'
import { run } from './cli'
import { findTaskById } from './commands/task'
import { filterByProductName, parseStatus } from './commands/tasks'
import { saveToken } from './credentials'
import { EXIT } from './meta'
import { STATUS_LABELS, type MyTask } from './tasks-api'
import { MemoryStore, fakeFetch, json, makeContext, type Handler } from './test-support'

const API = 'https://api.example'
const PA = 'aaaaaaaa-0000-4000-8000-000000000001'
const PB = 'bbbbbbbb-0000-4000-8000-000000000002'

function row(over: Partial<MyTask> & { taskId: string; taskName: string }): MyTask {
  return {
    description: null,
    timeLimit: null,
    reportedAt: null,
    completedAt: null,
    taskTypeId: null,
    productMemberId: 'm1',
    isVisible: true,
    status: 'in_progress',
    productId: PA,
    productName: '人形使い',
    ...over,
  }
}

const T1 = row({ taskId: '11111111-1111-4111-8111-111111111111', taskName: 'CLI の仕様を書く', timeLimit: '2030-01-05T00:00:00.000Z', description: '仕様を\n書く' })
const T2 = row({ taskId: '22222222-2222-4222-8222-222222222222', taskName: 'README を直す', productId: PB, productName: 'Another Product', status: 'reported' })
const T3 = row({ taskId: '11112222-3333-4333-8333-333333333333', taskName: '完了したタスク', status: 'completed', completedAt: '2030-01-01T00:00:00.000Z' })

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

/** ログイン済みの状態で、api の応答を決める */
async function setup(routes: Record<string, Handler>) {
  const fake = fakeFetch(routes)
  const store = new MemoryStore()
  await saveToken(store, API, 'TOKEN')
  const t = await makeContext({ fetchFn: fake.fetchFn, store, env: { NINGYOUTUKAI_API_URL: API } })
  cleanups.push(t.cleanup)
  return { ...t, calls: fake.calls }
}

/** `/api/me/task` は、クエリに応じて返す(includeCompleted なら完了も含める。status ならその状態だけ) */
const meTasks = (all: MyTask[]): Handler => ({ url }) => {
  const status = url.searchParams.get('status')
  const productId = url.searchParams.get('productId')
  const includeCompleted = url.searchParams.get('includeCompleted') === 'true'
  return json(
    all.filter(
      (t) =>
        (!productId || t.productId === productId) &&
        (status ? t.status === status : includeCompleted || t.status !== 'completed'),
    ),
  )
}

describe('tasks', () => {
  test('未ログインなら、終了コード 3 で login を案内する', async () => {
    const t = await makeContext({ fetchFn: fakeFetch({}).fetchFn, env: { NINGYOUTUKAI_API_URL: API } })
    cleanups.push(t.cleanup)
    expect(await run(['tasks'], t.ctx)).toBe(EXIT.auth)
    expect(t.err.join('\n')).toContain('login')
  })

  test('既定は完了以外。表(プロダクト・タスク・状態・期限・短い ID)と件数を出す。ベアラートークンで呼ぶ', async () => {
    const t = await setup({ 'GET /api/me/task': meTasks([T1, T2, T3]) })
    expect(await run(['tasks'], t.ctx)).toBe(EXIT.ok)
    const out = t.out.join('\n')
    expect(out).toContain('プロダクト')
    expect(out).toContain('CLI の仕様を書く')
    expect(out).toContain('作業中')
    expect(out).toContain('確認待ち')
    expect(out).toContain('11111111')
    expect(out).not.toContain('完了したタスク')
    expect(out).toContain('2 件')
    expect(t.calls[0]?.headers.get('authorization')).toBe('Bearer TOKEN')
  })

  test('--all なら、完了済みも出す(includeCompleted を送る)', async () => {
    const t = await setup({ 'GET /api/me/task': meTasks([T1, T2, T3]) })
    await run(['tasks', '--all'], t.ctx)
    expect(t.out.join('\n')).toContain('完了したタスク')
    expect(t.calls[0]?.key).toBe('GET /api/me/task')
  })

  test('--status は、その状態だけ。--all とは同時に使えない(使い方の誤り)', async () => {
    const t = await setup({ 'GET /api/me/task': meTasks([T1, T2, T3]) })
    expect(await run(['tasks', '--status', 'completed'], t.ctx)).toBe(EXIT.ok)
    expect(t.out.join('\n')).toContain('完了したタスク')
    expect(t.out.join('\n')).not.toContain('CLI の仕様を書く')
    expect(await run(['tasks', '--status', 'reported', '--all'], t.ctx)).toBe(EXIT.usage)
    expect(await run(['tasks', '--status', 'bogus'], t.ctx)).toBe(EXIT.usage)
    expect(t.err.join('\n')).toContain('in_progress')
  })

  test('--product は、名前の一部(大文字小文字を区別しない)で絞る', async () => {
    const t = await setup({ 'GET /api/me/task': meTasks([T1, T2, T3]) })
    await run(['tasks', '--product', 'another'], t.ctx)
    const out = t.out.join('\n')
    expect(out).toContain('README を直す')
    expect(out).not.toContain('CLI の仕様を書く')
  })

  test('--product が UUID なら、api に productId で絞らせる', async () => {
    const t = await setup({ 'GET /api/me/task': meTasks([T1, T2, T3]) })
    await run(['tasks', '--product', PB, '--json'], t.ctx)
    expect(JSON.parse(t.out.join('\n')).map((r: MyTask) => r.taskId)).toEqual([T2.taskId])
  })

  test('--json は、api の行をそのまま JSON で出す(表は出さない)', async () => {
    const t = await setup({ 'GET /api/me/task': meTasks([T1, T2, T3]) })
    await run(['tasks', '--json'], t.ctx)
    const parsed = JSON.parse(t.out.join('\n')) as MyTask[]
    expect(parsed.map((r) => r.taskId)).toEqual([T1.taskId, T2.taskId])
    expect(parsed[0]?.productName).toBe('人形使い')
  })

  test('タスクが無ければ、その旨と --all の案内(--json のときは空の配列)', async () => {
    const t = await setup({ 'GET /api/me/task': meTasks([]) })
    expect(await run(['tasks'], t.ctx)).toBe(EXIT.ok)
    expect(t.out.join('\n')).toContain('ありません')
    expect(t.out.join('\n')).toContain('--all')
    t.out.length = 0
    await run(['tasks', '--json'], t.ctx)
    expect(JSON.parse(t.out.join('\n'))).toEqual([])
  })

  test('トークンが期限切れ(401)なら、終了コード 3', async () => {
    const t = await setup({ 'GET /api/me/task': () => json({ message: 'ログインが必要です' }, 401) })
    expect(await run(['tasks'], t.ctx)).toBe(EXIT.auth)
    expect(t.err.join('\n')).toContain('有効期限')
  })

  test('サーバーのエラーは、ステータスを添えて、終了コード 1', async () => {
    const t = await setup({ 'GET /api/me/task': () => new Response('boom', { status: 500 }) })
    expect(await run(['tasks'], t.ctx)).toBe(EXIT.error)
    expect(t.err.join('\n')).toContain('500')
  })
})

describe('tasks の部品', () => {
  test('parseStatus: 知っている値は通し、知らない値は使い方の誤り', () => {
    expect(parseStatus('reported')).toBe('reported')
    expect(() => parseStatus('nope')).toThrow('正しくありません')
  })
  test('filterByProductName: ちょうど一致があれば、それだけ', () => {
    const a = row({ taskId: 'a1111111-1111-4111-8111-111111111111', taskName: 'x', productName: '人形' })
    const b = row({ taskId: 'b1111111-1111-4111-8111-111111111111', taskName: 'y', productName: '人形使い' })
    expect(filterByProductName([a, b], '人形')).toEqual([a])
    expect(filterByProductName([a, b], '使い')).toEqual([b])
    expect(filterByProductName([a, b], 'nothing')).toEqual([])
  })
  test('すべての状態に、日本語の表示名がある', () => {
    for (const s of ['in_progress', 'reported', 'rejected', 'completed'] as const) {
      expect(STATUS_LABELS[s].length).toBeGreaterThan(0)
    }
  })
})

describe('task', () => {
  const messages = {
    messages: [
      { messageId: 'm1', kind: 'comment', body: '進めます\n来週まで', author: { productMemberId: 'x', userName: '太郎', avatarUrl: null }, createdAt: '2030-01-02T00:00:00.000Z', editedAt: null, deleted: false },
      { messageId: 'm2', kind: 'report', body: '', author: { productMemberId: 'x', userName: '太郎', avatarUrl: null }, createdAt: '2030-01-03T00:00:00.000Z', editedAt: '2030-01-04T00:00:00.000Z', deleted: true },
    ],
  }
  const routes = (): Record<string, Handler> => ({
    'GET /api/me/task': meTasks([T1, T2, T3]),
    [`GET /api/product/${PA}/task/${T1.taskId}/message`]: () => json(messages),
  })

  test('ID の先頭でも探せる。詳細(状態・期限・説明)とメッセージ(削除済みは本文を出さない)を出す', async () => {
    const t = await setup(routes())
    expect(await run(['task', '1111111'], t.ctx)).toBe(EXIT.ok)
    const out = t.out.join('\n')
    expect(out).toContain('CLI の仕様を書く')
    expect(out).toContain('人形使い')
    expect(out).toContain('作業中')
    expect(out).toContain('仕様を')
    expect(out).toContain('メッセージ(2 件)')
    expect(out).toContain('太郎')
    expect(out).toContain('コメント')
    expect(out).toContain('進めます')
    expect(out).toContain('(削除されました)')
    expect(out).toContain('編集済み')
    // メッセージは、そのタスクのプロダクトの URL から取る
    expect(t.calls.some((c) => c.key === `GET /api/product/${PA}/task/${T1.taskId}/message`)).toBe(true)
  })

  test('--json は、タスクとメッセージを JSON で出す', async () => {
    const t = await setup(routes())
    await run(['task', T1.taskId, '--json'], t.ctx)
    const parsed = JSON.parse(t.out.join('\n'))
    expect(parsed.task.taskId).toBe(T1.taskId)
    expect(parsed.messages.length).toBe(2)
  })

  test('完了済みのタスクも、ID で開ける', async () => {
    const t = await setup({
      ...routes(),
      [`GET /api/product/${PA}/task/${T3.taskId}/message`]: () => json({ messages: [] }),
    })
    expect(await run(['task', T3.taskId], t.ctx)).toBe(EXIT.ok)
    expect(t.out.join('\n')).toContain('メッセージはありません')
    expect(t.out.join('\n')).toContain('完了')
  })

  test('ID が無い・短すぎる・見つからない・複数に合うときは、失敗する', async () => {
    const t = await setup(routes())
    expect(await run(['task'], t.ctx)).toBe(EXIT.usage)
    expect(await run(['task', '11'], t.ctx)).toBe(EXIT.usage)
    expect(await run(['task', 'ffff0000'], t.ctx)).toBe(EXIT.error)
    expect(t.err.join('\n')).toContain('ありません')
    t.err.length = 0
    expect(await run(['task', '1111'], t.ctx)).toBe(EXIT.error) // T1 と T3 の先頭が同じ
    expect(t.err.join('\n')).toContain('複数')
    expect(t.err.join('\n')).toContain(T3.taskId)
  })

  test('findTaskById: 大文字小文字を区別しない', () => {
    expect(findTaskById([T1, T2], T1.taskId.toUpperCase()).taskId).toBe(T1.taskId)
  })

  test('余分な引数は、使い方の誤り', async () => {
    const t = await setup(routes())
    expect(await run(['task', '11111111', 'extra'], t.ctx)).toBe(EXIT.usage)
    expect(await run(['tasks', 'extra'], t.ctx)).toBe(EXIT.usage)
  })
})
