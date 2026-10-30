import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Fetch } from './api'
import type { Context } from './context'
import type { SecretStore } from './credentials'

// テスト用の差し替え部品(本番のコードからは使わない)

export class MemoryStore implements SecretStore {
  readonly items = new Map<string, string>()
  failOnSet = false
  private key = (service: string, name: string) => `${service}\u0000${name}`
  async get(service: string, name: string) {
    return this.items.get(this.key(service, name)) ?? null
  }
  async set(service: string, name: string, value: string) {
    if (this.failOnSet) throw new Error('keychain unavailable')
    this.items.set(this.key(service, name), value)
  }
  async delete(service: string, name: string) {
    this.items.delete(this.key(service, name))
  }
}

export type Handler = (req: { url: URL; method: string; headers: Headers; body: unknown }) => Response | Promise<Response>

/** パス(メソッド + パス)ごとに応答を決める fetch。呼ばれたリクエストも記録する */
export function fakeFetch(routes: Record<string, Handler>) {
  const calls: { key: string; headers: Headers; body: unknown }[] = []
  const fetchFn: Fetch = async (input, init) => {
    const url = new URL(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const headers = new Headers(init?.headers)
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const key = `${method} ${url.pathname}`
    calls.push({ key, headers, body })
    const handler = routes[key]
    if (!handler) return new Response('not found', { status: 404 })
    return handler({ url, method, headers, body })
  }
  return { fetchFn, calls }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export async function makeContext(over: Partial<Context> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ningyoutukai-cli-test-'))
  const out: string[] = []
  const err: string[] = []
  const opened: string[] = []
  let clock = 1_700_000_000_000
  const ctx: Context = {
    fetchFn: fakeFetch({}).fetchFn,
    store: new MemoryStore(),
    env: {},
    configDir: dir,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    // 待った分だけ、時計を進める(実際には待たない)
    sleep: async (ms) => {
      clock += ms
    },
    now: () => clock,
    openBrowser: async (url) => {
      opened.push(url)
    },
    ...over,
  }
  return { ctx, dir, out, err, opened, cleanup: () => rm(dir, { recursive: true, force: true }) }
}
