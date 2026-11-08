import { afterEach, describe, expect, test } from 'bun:test'
import { run } from './cli'
import { findHandedDocument } from './commands/docs'
import { saveToken } from './credentials'
import type { HandedDocument } from './docs-api'
import { EXIT } from './meta'
import type { MyTask } from './tasks-api'
import { MemoryStore, fakeFetch, json, makeContext, type Handler } from './test-support'

// 渡された Markdown(docs / doc / context)・AI の報告の下書き(report)・AI 用のトークン(ai-token)

const API = 'https://api.example'
const PA = 'aaaaaaaa-0000-4000-8000-000000000001'
const TASK_ID = '11111111-1111-4111-8111-111111111111'
const AI = 'pmai_testtokentesttokentesttokentesttokentest123'

const TASK: MyTask = {
  taskId: TASK_ID,
  taskName: 'CLI の仕様を書く',
  description: '仕様を\n書く',
  timeLimit: '2030-01-05T00:00:00.000Z',
  reportedAt: null,
  completedAt: null,
  taskTypeId: null,
  productMemberId: 'm1',
  isVisible: true,
  status: 'in_progress',
  productId: PA,
  productName: '人形使い',
}
const doc = (over: Partial<HandedDocument> & { documentId: string; name: string }): HandedDocument => ({
  directoryId: 'd1',
  directoryName: '仕様',
  currentVersion: 2,
  viaDirectory: false,
  ...over,
})
const SPEC = doc({ documentId: 'aaaa1111-0000-4000-8000-000000000001', name: 'spec.md' })
const API_MD = doc({ documentId: 'bbbb2222-0000-4000-8000-000000000002', name: 'api.md', directoryName: '設計', viaDirectory: true, currentVersion: 3 })

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const meTasks = (rows: MyTask[]): Handler => () => json(rows)
const taskDocs = (docs: HandedDocument[]): Handler => () => json({ documents: docs, documentIds: [], directoryIds: [] })
const docBody = (contents: Record<string, string>): Handler => ({ url }) => {
  const id = url.pathname.split('/').pop()!
  const version = url.searchParams.get('version')
  const found = [SPEC, API_MD].find((d) => d.documentId === id)
  if (!found || contents[id] === undefined) return json({ message: 'なし' }, 404)
  return json({ documentId: id, directoryId: 'd1', name: found.name, currentVersion: found.currentVersion, version: version ? Number(version) : found.currentVersion, content: contents[id], sizeBytes: contents[id]!.length })
}
const DOC_PATH = `/api/product/${PA}/document`

/** AI 用のトークン(環境変数)で動かす */
async function aiSetup(routes: Record<string, Handler>, over: Parameters<typeof makeContext>[0] = {}) {
  const fake = fakeFetch(routes)
  const t = await makeContext({ fetchFn: fake.fetchFn, env: { NINGYOUTUKAI_API_URL: API, NINGYOUTUKAI_TOKEN: AI }, ...over })
  cleanups.push(t.cleanup)
  return { ...t, calls: fake.calls }
}
/** 人のログイン(キーチェーン)で動かす */
async function humanSetup(routes: Record<string, Handler>) {
  const fake = fakeFetch(routes)
  const store = new MemoryStore()
  await saveToken(store, API, 'SESSION')
  const t = await makeContext({ fetchFn: fake.fetchFn, store, env: { NINGYOUTUKAI_API_URL: API } })
  cleanups.push(t.cleanup)
  return { ...t, calls: fake.calls }
}

const taskRoutes = (docs: HandedDocument[] = [SPEC, API_MD]): Record<string, Handler> => ({
  'GET /api/me/task': meTasks([TASK]),
  [`GET /api/product/${PA}/task/${TASK_ID}/document`]: taskDocs(docs),
})

describe('findHandedDocument', () => {
  const docs = [SPEC, API_MD, doc({ documentId: 'cccc3333-0000-4000-8000-000000000003', name: 'spec.md', directoryName: '別' })]
  test('ディレクトリ/名前、名前、ID(全体か先頭の 4 文字以上)で選ぶ', () => {
    expect(findHandedDocument(docs, '設計/api.md').documentId).toBe(API_MD.documentId)
    expect(findHandedDocument(docs, 'API.md').documentId).toBe(API_MD.documentId)
    expect(findHandedDocument(docs, 'bbbb').documentId).toBe(API_MD.documentId)
    expect(findHandedDocument(docs, API_MD.documentId).documentId).toBe(API_MD.documentId)
  })
  test('同じ名前が複数あれば失敗して、ディレクトリ/名前 での指定を案内する。ディレクトリ/名前なら選べる', () => {
    expect(() => findHandedDocument(docs, 'spec.md')).toThrow('複数')
    expect(findHandedDocument(docs, '仕様/spec.md').documentId).toBe(SPEC.documentId)
  })
  test('見つからない・空・短すぎる ID の先頭は失敗する', () => {
    expect(() => findHandedDocument(docs, 'none.md')).toThrow('これはありません')
    expect(() => findHandedDocument(docs, '  ')).toThrow('指定してください')
    expect(() => findHandedDocument(docs, 'bbb')).toThrow('これはありません')
  })
})

describe('docs(一覧)', () => {
  test('渡された文書の一覧を、表で出す(ディレクトリ/名前、版、渡し方)', async () => {
    const t = await aiSetup(taskRoutes())
    expect(await run(['docs', TASK_ID.slice(0, 8)], t.ctx)).toBe(EXIT.ok)
    const text = t.out.join('\n')
    expect(text).toContain('「CLI の仕様を書く」に渡された文書(2 件)')
    expect(text).toContain('仕様/spec.md')
    expect(text).toContain('設計/api.md')
    expect(text).toContain('ディレクトリ')
    expect(text).toContain('個別')
  })
  test('なければ、その旨。--json は配列', async () => {
    const t = await aiSetup(taskRoutes([]))
    expect(await run(['docs', TASK_ID.slice(0, 8)], t.ctx)).toBe(EXIT.ok)
    expect(t.out.join('\n')).toContain('渡された文書はありません')
    const j = await aiSetup(taskRoutes())
    await run(['docs', TASK_ID.slice(0, 8), '--json'], j.ctx)
    expect(JSON.parse(j.out.join('\n')).map((d: HandedDocument) => d.name)).toEqual(['spec.md', 'api.md'])
  })
  test('ID なしは使い方の誤り(2)。自分のタスクにない ID は失敗(1)。未ログインは 3', async () => {
    const t = await aiSetup(taskRoutes())
    expect(await run(['docs'], t.ctx)).toBe(EXIT.usage)
    expect(await run(['docs', 'ffffffff'], t.ctx)).toBe(EXIT.error)
    const none = await makeContext()
    cleanups.push(none.cleanup)
    expect(await run(['docs', TASK_ID.slice(0, 8)], none.ctx)).toBe(EXIT.auth)
  })
})

describe('doc(本文)', () => {
  const routes = (): Record<string, Handler> => ({
    ...taskRoutes(),
    [`GET ${DOC_PATH}/${SPEC.documentId}`]: docBody({ [SPEC.documentId]: '# 仕様\n\n本文' }),
    [`GET ${DOC_PATH}/${API_MD.documentId}`]: docBody({ [API_MD.documentId]: '# API' }),
  })
  test('Markdown をそのまま標準出力へ(飾りなし)', async () => {
    const t = await aiSetup(routes())
    expect(await run(['doc', TASK_ID.slice(0, 8), 'spec.md'], t.ctx)).toBe(EXIT.ok)
    expect(t.out).toEqual(['# 仕様\n\n本文'])
  })
  test('--ver で前の版を取る(クエリ ?version=)。不正な値は 2', async () => {
    const t = await aiSetup(routes())
    await run(['doc', TASK_ID.slice(0, 8), 'spec.md', '--ver', '1'], t.ctx)
    expect(t.calls.some((c) => c.key === `GET ${DOC_PATH}/${SPEC.documentId}`)).toBe(true)
    const bad = await aiSetup(routes())
    for (const v of ['0', 'x', '1.5']) expect(await run(['doc', TASK_ID.slice(0, 8), 'spec.md', '--ver', v], bad.ctx)).toBe(EXIT.usage)
  })
  test('渡されていない文書・引数なしはエラー。AI のトークンが無効(401)なら、トークンの案内つきで 3', async () => {
    const t = await aiSetup(routes())
    expect(await run(['doc', TASK_ID.slice(0, 8), 'nothing.md'], t.ctx)).toBe(EXIT.error)
    expect(await run(['doc', TASK_ID.slice(0, 8)], t.ctx)).toBe(EXIT.usage)
    const expired = await aiSetup({ 'GET /api/me/task': () => json({ message: 'x' }, 401) })
    expect(await run(['doc', TASK_ID.slice(0, 8), 'spec.md'], expired.ctx)).toBe(EXIT.auth)
    expect(expired.err.join('\n')).toContain('AI 用のトークンが使えません')
  })
})

describe('context(AI に渡す全体像)', () => {
  test('タスクの説明、渡された文書の本文、報告のしかたを、Markdown 1 つで出す', async () => {
    const t = await aiSetup({
      ...taskRoutes(),
      [`GET ${DOC_PATH}/${SPEC.documentId}`]: docBody({ [SPEC.documentId]: '# 仕様の本文' }),
      [`GET ${DOC_PATH}/${API_MD.documentId}`]: docBody({ [API_MD.documentId]: '# API の本文' }),
    })
    expect(await run(['context', TASK_ID.slice(0, 8)], t.ctx)).toBe(EXIT.ok)
    const text = t.out.join('\n')
    expect(text).toContain('# タスク: CLI の仕様を書く')
    expect(text).toContain('作業中')
    expect(text).toContain('## 説明')
    expect(text).toContain('### 仕様/spec.md(版 2)')
    expect(text).toContain('# 仕様の本文')
    expect(text).toContain('### 設計/api.md(版 3)')
    expect(text).toContain('# API の本文')
    expect(text).toContain('## 報告のしかた')
    expect(text).toContain('pm report 11111111 --file report.md')
    expect(text).toContain('AI が自分で完了にはできません')
  })
  test('渡された文書がなければ「(なし)」。--json は構造で返す', async () => {
    const t = await aiSetup(taskRoutes([]))
    await run(['context', TASK_ID.slice(0, 8)], t.ctx)
    expect(t.out.join('\n')).toContain('(なし)')
    const j = await aiSetup({ ...taskRoutes([SPEC]), [`GET ${DOC_PATH}/${SPEC.documentId}`]: docBody({ [SPEC.documentId]: '# x' }) })
    await run(['context', TASK_ID.slice(0, 8), '--json'], j.ctx)
    const parsed = JSON.parse(j.out.join('\n'))
    expect(parsed.task.taskId).toBe(TASK_ID)
    expect(parsed.documents[0]).toMatchObject({ name: 'spec.md', version: 2, content: '# x' })
  })
})

describe('report(下書きの保存)', () => {
  const draftPath = `POST /api/product/${PA}/task/${TASK_ID}/report-draft`
  const saved = (body: unknown) => ({ draftId: 'dddd4444-0000-4000-8000-000000000004', taskId: TASK_ID, aiName: 'Claude Code', body, readDocuments: [{ documentId: SPEC.documentId, name: '仕様/spec.md', version: 2 }], status: 'pending', createdAt: '2030-01-01T00:00:00.000Z', decidedAt: null })
  const routes = (): Record<string, Handler> => ({ ...taskRoutes(), [draftPath]: ({ body }) => json(saved((body as { body: string }).body), 201) })

  test('--file の本文を保存する。読んだ文書として、渡された文書すべてのいまの版を控える', async () => {
    const t = await aiSetup(routes(), { readFile: async (p) => (p === 'report.md' ? '  # 結果\n\n実装しました  \n' : '') })
    expect(await run(['report', TASK_ID.slice(0, 8), '--file', 'report.md'], t.ctx)).toBe(EXIT.ok)
    const post = t.calls.find((c) => c.key === draftPath)!
    expect(post.body).toEqual({
      body: '# 結果\n\n実装しました',
      readDocuments: [{ documentId: SPEC.documentId, version: 2 }, { documentId: API_MD.documentId, version: 3 }],
    })
    expect(post.headers.get('authorization')).toBe(`Bearer ${AI}`)
    const text = t.out.join('\n')
    expect(text).toContain('報告の下書きを保存しました')
    expect(text).toContain('担当者(人)が確認して、完了報告に出すか判断します')
  })
  test('--stdin から読める。--no-read なら、読んだ文書を控えない', async () => {
    const t = await aiSetup(routes(), { readStdin: async () => '標準入力の結果' })
    expect(await run(['report', TASK_ID.slice(0, 8), '--stdin', '--no-read'], t.ctx)).toBe(EXIT.ok)
    expect(t.calls.find((c) => c.key === draftPath)!.body).toEqual({ body: '標準入力の結果' })
    expect(t.calls.some((c) => c.key.endsWith('/document'))).toBe(false)
  })
  test('--file と --stdin の両方、どちらもなし、空、長すぎる、読めないファイルは 2(送らない)', async () => {
    const t = await aiSetup(routes(), { readFile: async (p) => (p === 'long.md' ? 'あ'.repeat(10001) : p === 'empty.md' ? '  \n' : 'x') })
    expect(await run(['report', TASK_ID.slice(0, 8), '--file', 'a.md', '--stdin'], t.ctx)).toBe(EXIT.usage)
    expect(await run(['report', TASK_ID.slice(0, 8)], t.ctx)).toBe(EXIT.usage)
    expect(await run(['report', TASK_ID.slice(0, 8), '--file', 'empty.md'], t.ctx)).toBe(EXIT.usage)
    expect(await run(['report', TASK_ID.slice(0, 8), '--file', 'long.md'], t.ctx)).toBe(EXIT.usage)
    const missing = await aiSetup(routes())
    expect(await run(['report', TASK_ID.slice(0, 8), '--file', 'none.md'], missing.ctx)).toBe(EXIT.usage)
    expect(missing.err.join('\n')).toContain('本文を読めませんでした')
    expect([...t.calls, ...missing.calls].some((c) => c.key === draftPath)).toBe(false)
  })
  test('人のログイン(AI 用のトークンでない)では、保存せずに 3 で止める', async () => {
    const t = await humanSetup(routes())
    t.ctx.readFile = async () => 'x'
    expect(await run(['report', TASK_ID.slice(0, 8), '--file', 'r.md'], t.ctx)).toBe(EXIT.auth)
    expect(t.err.join('\n')).toContain('AI 用のトークン')
    expect(t.calls.some((c) => c.key === draftPath)).toBe(false)
  })
  test('サーバーのエラー(確認待ち 409 など)は、メッセージを添えて 1', async () => {
    const t = await aiSetup({ ...taskRoutes(), [draftPath]: () => json({ message: 'すでに報告済みです(確認待ち)' }, 409) }, { readFile: async () => 'x' })
    expect(await run(['report', TASK_ID.slice(0, 8), '--file', 'r.md'], t.ctx)).toBe(EXIT.error)
    expect(t.err.join('\n')).toContain('すでに報告済みです')
  })
})

describe('task(詳細)に、渡された文書が出る', () => {
  test('人: メッセージと一緒に、渡された文書の一覧が出る', async () => {
    const t = await humanSetup({ ...taskRoutes([SPEC]), [`GET /api/product/${PA}/task/${TASK_ID}/message`]: () => json({ messages: [] }) })
    expect(await run(['task', TASK_ID.slice(0, 8)], t.ctx)).toBe(EXIT.ok)
    const text = t.out.join('\n')
    expect(text).toContain('渡された文書(1 件)')
    expect(text).toContain('仕様/spec.md(版 2)')
    expect(text).toContain('pm doc 11111111')
    expect(text).toContain('メッセージはありません')
  })
  test('AI 用のトークン: メッセージの履歴は読まない(取りに行かない)。文書の一覧は出る', async () => {
    const t = await aiSetup(taskRoutes([SPEC]))
    expect(await run(['task', TASK_ID.slice(0, 8)], t.ctx)).toBe(EXIT.ok)
    expect(t.calls.some((c) => c.key.endsWith('/message'))).toBe(false)
    expect(t.out.join('\n')).toContain('AI 用のトークンでは、メッセージの履歴は読めません')
    expect(t.out.join('\n')).toContain('仕様/spec.md')
  })
  test('文書の機能がない古い api(404)でも、task は動く', async () => {
    const t = await humanSetup({ 'GET /api/me/task': meTasks([TASK]), [`GET /api/product/${PA}/task/${TASK_ID}/message`]: () => json({ messages: [] }) })
    expect(await run(['task', TASK_ID.slice(0, 8)], t.ctx)).toBe(EXIT.ok)
    expect(t.out.join('\n')).not.toContain('渡された文書')
  })
  test('--json に documents が入る', async () => {
    const t = await humanSetup({ ...taskRoutes([SPEC]), [`GET /api/product/${PA}/task/${TASK_ID}/message`]: () => json({ messages: [] }) })
    await run(['task', TASK_ID.slice(0, 8), '--json'], t.ctx)
    expect(JSON.parse(t.out.join('\n')).documents.map((d: HandedDocument) => d.name)).toEqual(['spec.md'])
  })
})

describe('ai-token(人のログインで)', () => {
  const info = (over: Record<string, unknown> = {}) => ({ tokenId: 'eeee5555-0000-4000-8000-000000000005', name: 'Claude Code', tokenPrefix: 'pmai_ab12', createdAt: '2030-01-01T00:00:00.000Z', expiresAt: '2030-04-01T00:00:00.000Z', lastUsedAt: null, revokedAt: null, active: true, ...over })

  test('create: 発行して、中身を一度だけ出し、環境変数への設定を案内する。--days を送る', async () => {
    const t = await humanSetup({ 'POST /api/me/ai-token': ({ body }) => json({ ...info(), token: AI, received: body }, 201) })
    expect(await run(['ai-token', 'create', 'Claude Code', '--days', '30'], t.ctx)).toBe(EXIT.ok)
    expect(t.calls[0]!.body).toEqual({ name: 'Claude Code', expiresInDays: 30 })
    const text = t.out.join('\n')
    expect(text).toContain(AI)
    expect(text).toContain(`export NINGYOUTUKAI_TOKEN=${AI}`)
    expect(text).toContain('今回しか表示されません')
  })
  test('list: 表で出す(中身ではなく先頭の数文字)。状態は 有効 / 期限切れ / 取り消し済み', async () => {
    const t = await humanSetup({
      'GET /api/me/ai-token': () => json([info(), info({ tokenId: 'ffff6666-0000-4000-8000-000000000006', name: '古い', active: false, revokedAt: '2030-02-01T00:00:00.000Z' }), info({ tokenId: '99996666-0000-4000-8000-000000000007', name: '切れた', active: false })]),
    })
    expect(await run(['ai-token', 'list'], t.ctx)).toBe(EXIT.ok)
    const text = t.out.join('\n')
    expect(text).toContain('pmai_ab12…')
    expect(text).toContain('有効')
    expect(text).toContain('取り消し済み')
    expect(text).toContain('期限切れ')
  })
  test('revoke: ID の先頭で選んで取り消す。見つからない・短すぎるは失敗', async () => {
    const t = await humanSetup({
      'GET /api/me/ai-token': () => json([info()]),
      'DELETE /api/me/ai-token/eeee5555-0000-4000-8000-000000000005': () => new Response(null, { status: 204 }),
    })
    expect(await run(['ai-token', 'revoke', 'eeee'], t.ctx)).toBe(EXIT.ok)
    expect(t.calls.some((c) => c.key === 'DELETE /api/me/ai-token/eeee5555-0000-4000-8000-000000000005')).toBe(true)
    expect(t.out.join('\n')).toContain('取り消しました: Claude Code')
    expect(await run(['ai-token', 'revoke', 'zzzz'], t.ctx)).toBe(EXIT.error)
    expect(await run(['ai-token', 'revoke', 'ee'], t.ctx)).toBe(EXIT.usage)
  })
  test('使い方の誤りは 2: サブコマンドなし・不正、create に名前なし、list に引数、revoke に ID なし、--days の範囲外と create 以外', async () => {
    const t = await humanSetup({})
    for (const argv of [['ai-token'], ['ai-token', 'nope'], ['ai-token', 'create'], ['ai-token', 'create', '  '], ['ai-token', 'list', 'x'], ['ai-token', 'revoke'], ['ai-token', 'create', 'x', '--days', '0'], ['ai-token', 'create', 'x', '--days', '366'], ['ai-token', 'create', 'x', '--days', '1.5'], ['ai-token', 'list', '--days', '3']]) {
      expect(await run(argv, t.ctx)).toBe(EXIT.usage)
    }
    expect(t.calls.length).toBe(0)
  })
  test('AI 用のトークンでは使えない(3)。発行のリクエストも送らない', async () => {
    const t = await aiSetup({})
    expect(await run(['ai-token', 'create', 'x'], t.ctx)).toBe(EXIT.auth)
    expect(t.err.join('\n')).toContain('人のログイン')
    expect(t.calls.length).toBe(0)
  })
})

describe('使い方(--help)', () => {
  test('新しいコマンドと、オプションが載っている', async () => {
    const t = await makeContext()
    cleanups.push(t.cleanup)
    await run(['--help'], t.ctx)
    const text = t.out.join('\n')
    for (const word of ['docs <ID>', 'doc <ID> <文書>', 'context <ID>', 'report <ID>', 'ai-token create', '--ver', '--file', '--stdin', '--no-read', '--days', 'pmai_']) {
      expect(text).toContain(word)
    }
  })
  test('余分な引数は 2(docs に 2 つ目、doc に 3 つ目)', async () => {
    const t = await aiSetup(taskRoutes())
    expect(await run(['docs', 'a', 'b'], t.ctx)).toBe(EXIT.usage)
    expect(await run(['doc', 'a', 'b', 'c'], t.ctx)).toBe(EXIT.usage)
  })
})
