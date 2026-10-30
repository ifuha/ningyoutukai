import { describe, expect, test } from 'bun:test'
import { loadToken, removeToken, saveToken } from './credentials'
import { CliError } from './errors'
import { SECRET_SERVICE } from './meta'
import { MemoryStore } from './test-support'

const API = 'https://api.example'

describe('トークンの保存(キーチェーン)', () => {
  test('保存したトークンを、接続先ごとに読める', async () => {
    const store = new MemoryStore()
    await saveToken(store, API, 'tok-a')
    await saveToken(store, 'https://other.example', 'tok-b')
    expect(await loadToken({ apiUrl: API, store, env: {} })).toEqual({ token: 'tok-a', source: 'keychain' })
    expect(await loadToken({ apiUrl: 'https://other.example', store, env: {} })).toEqual({ token: 'tok-b', source: 'keychain' })
    expect(await store.get(SECRET_SERVICE, API)).toBe('tok-a')
  })

  test('環境変数 NINGYOUTUKAI_TOKEN は、キーチェーンより優先', async () => {
    const store = new MemoryStore()
    await saveToken(store, API, 'from-keychain')
    expect(await loadToken({ apiUrl: API, store, env: { NINGYOUTUKAI_TOKEN: ' from-env ' } })).toEqual({
      token: 'from-env',
      source: 'env',
    })
  })

  test('どこにも無ければ null', async () => {
    expect(await loadToken({ apiUrl: API, store: new MemoryStore(), env: {} })).toBeNull()
  })

  test('キーチェーンが読めないときも、null(保存のときに原因を案内する)', async () => {
    const broken = {
      get: async () => {
        throw new Error('no secret service')
      },
      set: async () => {},
      delete: async () => {},
    }
    expect(await loadToken({ apiUrl: API, store: broken, env: {} })).toBeNull()
  })

  test('キーチェーンに保存できないときは、平文に落とさず、環境変数を案内して失敗する', async () => {
    const store = new MemoryStore()
    store.failOnSet = true
    const err = await saveToken(store, API, 'tok').then(
      () => null,
      (e) => e,
    )
    expect(err).toBeInstanceOf(CliError)
    expect(err.message).toContain('NINGYOUTUKAI_TOKEN')
    expect(err.message).toContain('保存していません')
    expect(store.items.size).toBe(0)
  })

  test('削除できる(無くても、失敗しても、止まらない)', async () => {
    const store = new MemoryStore()
    await saveToken(store, API, 'tok')
    await removeToken(store, API)
    expect(await loadToken({ apiUrl: API, store, env: {} })).toBeNull()
    await removeToken(store, API)
    await removeToken({ get: async () => null, set: async () => {}, delete: async () => { throw new Error('x') } }, API)
  })
})
