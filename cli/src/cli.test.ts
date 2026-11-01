import { afterEach, describe, expect, test } from 'bun:test'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { run } from './cli'
import { readConfig } from './config'
import { loadToken } from './credentials'
import { EXIT } from './meta'
import { MemoryStore, fakeFetch, json, makeContext, type Handler } from './test-support'

const API = 'https://api.example'
const USER = { id: 'u1', name: '太郎', email: 'taro@example.com' }

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

async function setup(routes: Record<string, Handler>, env: Record<string, string> = { NINGYOUTUKAI_API_URL: API }) {
  const fake = fakeFetch(routes)
  const store = new MemoryStore()
  const t = await makeContext({ fetchFn: fake.fetchFn, store, env })
  cleanups.push(t.cleanup)
  return { ...t, store, calls: fake.calls }
}

const deviceRoutes = (over: Record<string, Handler> = {}): Record<string, Handler> => ({
  'POST /api/auth/device/code': () =>
    json({
      device_code: 'dev-1',
      user_code: 'ABCD1234',
      verification_uri: 'https://web.example/device',
      verification_uri_complete: 'https://web.example/device?user_code=ABCD1234',
      expires_in: 900,
      interval: 5,
    }),
  'POST /api/auth/device/token': () => json({ access_token: 'TOKEN-1', token_type: 'Bearer' }),
  'GET /api/auth/get-session': () => json({ user: USER, session: { token: 'x' } }),
  'POST /api/auth/sign-out': () => json({ success: true }),
  ...over,
})

describe('login', () => {
  test('コードを見せ、ブラウザを開き、承認されたらトークンを保存して、ユーザーを表示する', async () => {
    const t = await setup(deviceRoutes())
    const code = await run(['login'], t.ctx)
    expect(code).toBe(EXIT.ok)
    const out = t.out.join('\n')
    expect(out).toContain('https://web.example/device?user_code=ABCD1234')
    expect(out).toContain('ABCD1234')
    expect(out).toContain('ログインしました: 太郎 <taro@example.com>')
    expect(t.opened).toEqual(['https://web.example/device?user_code=ABCD1234'])
    // トークンは、キーチェーンに入る
    expect(await loadToken({ apiUrl: API, store: t.store, env: {} })).toEqual({ token: 'TOKEN-1', source: 'keychain' })
  })

  test('設定ファイルには、秘密でない値だけが入る(トークンは入らない)。権限は 0600', async () => {
    const t = await setup(deviceRoutes())
    await run(['login'], t.ctx)
    const config = await readConfig(t.dir)
    expect(config).toMatchObject({ apiUrl: API, userId: 'u1', userName: '太郎', email: 'taro@example.com' })
    const path = join(t.dir, 'config.json')
    expect(await Bun.file(path).text()).not.toContain('TOKEN-1')
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  test('--no-browser なら、ブラウザを開かない', async () => {
    const t = await setup(deviceRoutes())
    await run(['login', '--no-browser'], t.ctx)
    expect(t.opened).toEqual([])
  })

  test('拒否されたら、終了コード 3。トークンも設定も残さない', async () => {
    const t = await setup(deviceRoutes({ 'POST /api/auth/device/token': () => json({ error: 'access_denied' }, 400) }))
    const code = await run(['login'], t.ctx)
    expect(code).toBe(EXIT.auth)
    expect(t.err.join('\n')).toContain('拒否')
    expect(t.store.items.size).toBe(0)
    expect(await readConfig(t.dir)).toBeNull()
  })

  test('キーチェーンに保存できないときは、設定ファイルを書かず、環境変数を案内して失敗する', async () => {
    const t = await setup(deviceRoutes())
    t.store.failOnSet = true
    const code = await run(['login'], t.ctx)
    expect(code).toBe(EXIT.error)
    expect(t.err.join('\n')).toContain('NINGYOUTUKAI_TOKEN')
    expect(await readConfig(t.dir)).toBeNull()
  })

  test('受け取ったトークンでユーザーを確認できなければ、保存しない', async () => {
    const t = await setup(deviceRoutes({ 'GET /api/auth/get-session': () => json(null) }))
    const code = await run(['login'], t.ctx)
    expect(code).toBe(EXIT.error)
    expect(t.store.items.size).toBe(0)
  })

  test('--api で、接続先を変えられる', async () => {
    const t = await setup(deviceRoutes(), {})
    await run(['login', '--api', `${API}/`], t.ctx)
    expect(await readConfig(t.dir)).toMatchObject({ apiUrl: API })
  })
})

describe('whoami', () => {
  const login = async (t: Awaited<ReturnType<typeof setup>>) => run(['login'], t.ctx)

  test('ログイン中のユーザーと接続先を出す', async () => {
    const t = await setup(deviceRoutes())
    await login(t)
    t.out.length = 0
    expect(await run(['whoami'], t.ctx)).toBe(EXIT.ok)
    expect(t.out.join('\n')).toContain('ユーザー: 太郎')
    expect(t.out.join('\n')).toContain('taro@example.com')
    expect(t.out.join('\n')).toContain(API)
    // ベアラートークンで呼んでいる
    const last = t.calls.at(-1)
    expect(last?.key).toBe('GET /api/auth/get-session')
    expect(last?.headers.get('authorization')).toBe('Bearer TOKEN-1')
  })

  test('--json は、機械が読める JSON(トークンは入れない)', async () => {
    const t = await setup(deviceRoutes())
    await login(t)
    t.out.length = 0
    await run(['whoami', '--json'], t.ctx)
    const parsed = JSON.parse(t.out.join('\n'))
    expect(parsed).toEqual({ user: USER, apiUrl: API, tokenSource: 'keychain' })
  })

  test('ログインしていなければ、終了コード 3 で login を案内する', async () => {
    const t = await setup(deviceRoutes())
    expect(await run(['whoami'], t.ctx)).toBe(EXIT.auth)
    expect(t.err.join('\n')).toContain('login')
  })

  test('トークンが期限切れ(サーバーが認めない)なら、終了コード 3', async () => {
    const t = await setup(deviceRoutes())
    await login(t)
    t.ctx.fetchFn = fakeFetch({ 'GET /api/auth/get-session': () => json(null) }).fetchFn
    expect(await run(['whoami'], t.ctx)).toBe(EXIT.auth)
    expect(t.err.join('\n')).toContain('有効期限')
  })

  test('環境変数 NINGYOUTUKAI_TOKEN があれば、ログインなしでも使える(CI 向け)', async () => {
    const t = await setup(deviceRoutes(), { NINGYOUTUKAI_API_URL: API, NINGYOUTUKAI_TOKEN: 'ENV-TOKEN' })
    expect(await run(['whoami', '--json'], t.ctx)).toBe(EXIT.ok)
    expect(JSON.parse(t.out.join('\n')).tokenSource).toBe('env')
    expect(t.calls.at(-1)?.headers.get('authorization')).toBe('Bearer ENV-TOKEN')
  })

  test('サーバーが 5xx なら、期限切れとは区別して、終了コード 1', async () => {
    const t = await setup(deviceRoutes())
    await login(t)
    t.ctx.fetchFn = fakeFetch({ 'GET /api/auth/get-session': () => new Response('boom', { status: 500 }) }).fetchFn
    expect(await run(['whoami'], t.ctx)).toBe(EXIT.error)
  })
})

describe('logout', () => {
  test('トークン・設定を消し、サーバー側のセッションも無効にする', async () => {
    const t = await setup(deviceRoutes())
    await run(['login'], t.ctx)
    t.out.length = 0
    expect(await run(['logout'], t.ctx)).toBe(EXIT.ok)
    expect(t.out.join('\n')).toContain('ログアウトしました')
    expect(t.store.items.size).toBe(0)
    expect(await readConfig(t.dir)).toBeNull()
    const signOut = t.calls.find((c) => c.key === 'POST /api/auth/sign-out')
    expect(signOut?.headers.get('authorization')).toBe('Bearer TOKEN-1')
    expect(await run(['whoami'], t.ctx)).toBe(EXIT.auth)
  })

  test('サーバーに届かなくても、この端末のログアウトはできる(注意を出す)', async () => {
    const t = await setup(deviceRoutes())
    await run(['login'], t.ctx)
    t.ctx.fetchFn = async () => {
      throw new Error('offline')
    }
    expect(await run(['logout'], t.ctx)).toBe(EXIT.ok)
    expect(t.store.items.size).toBe(0)
    expect(t.err.join('\n')).toContain('サーバー側のセッション')
  })

  test('ログインしていなくても、失敗しない', async () => {
    const t = await setup(deviceRoutes())
    expect(await run(['logout'], t.ctx)).toBe(EXIT.ok)
    expect(t.out.join('\n')).toContain('ログインしていません')
  })

  test('環境変数のトークンは消せないので、注意を出す', async () => {
    const t = await setup(deviceRoutes(), { NINGYOUTUKAI_API_URL: API, NINGYOUTUKAI_TOKEN: 'ENV' })
    await run(['logout'], t.ctx)
    expect(t.err.join('\n')).toContain('NINGYOUTUKAI_TOKEN')
  })
})

describe('引数の解釈', () => {
  test('--help は 0、コマンドなしは使い方を出して 2', async () => {
    const t = await setup(deviceRoutes())
    expect(await run(['--help'], t.ctx)).toBe(EXIT.ok)
    expect(await run([], t.ctx)).toBe(EXIT.usage)
    expect(t.out.join('\n')).toContain('login')
  })
  test('--version', async () => {
    const t = await setup(deviceRoutes())
    expect(await run(['-v'], t.ctx)).toBe(EXIT.ok)
    expect(t.out.join('\n')).toMatch(/\d+\.\d+\.\d+/)
  })
  test('知らないコマンド・オプション・余分な引数は、使い方の誤り(2)', async () => {
    const t = await setup(deviceRoutes())
    expect(await run(['nosuch'], t.ctx)).toBe(EXIT.usage)
    expect(await run(['whoami', '--bogus'], t.ctx)).toBe(EXIT.usage)
    expect(await run(['whoami', 'extra'], t.ctx)).toBe(EXIT.usage)
    expect(t.err.join('\n')).toContain('--help')
  })
})
