import { describe, expect, test } from 'bun:test'
import { pollForToken, requestDeviceCode, type DeviceCode } from './device-flow'
import { CliError } from './errors'
import { EXIT } from './meta'
import { fakeFetch, json } from './test-support'

const API = 'https://api.example'
const code: DeviceCode = {
  device_code: 'dev-1',
  user_code: 'ABCD1234',
  verification_uri: 'https://web.example/device',
  expires_in: 900,
  interval: 5,
}

function clock() {
  let t = 0
  const slept: number[] = []
  return {
    slept,
    sleep: async (ms: number) => {
      slept.push(ms)
      t += ms
    },
    now: () => t,
  }
}

const pending = () => json({ error: 'authorization_pending' }, 400)

describe('requestDeviceCode', () => {
  test('コードを発行する。client_id を送り、足りない値は既定で補う', async () => {
    const { fetchFn, calls } = fakeFetch({
      'POST /api/auth/device/code': () =>
        json({ device_code: 'd', user_code: 'U', verification_uri: 'https://w/device' }),
    })
    const got = await requestDeviceCode(fetchFn, API)
    expect(got).toMatchObject({ device_code: 'd', user_code: 'U', expires_in: 900, interval: 5 })
    expect(calls[0]?.body).toEqual({ client_id: 'ningyoutukai-cli' })
  })
  test('サーバーが断ったら失敗する', async () => {
    const { fetchFn } = fakeFetch({ 'POST /api/auth/device/code': () => json({ error: 'invalid_client' }, 400) })
    await expect(requestDeviceCode(fetchFn, API)).rejects.toBeInstanceOf(CliError)
  })
  test('応答の形が違えば失敗する', async () => {
    const { fetchFn } = fakeFetch({ 'POST /api/auth/device/code': () => json({ hello: 1 }) })
    await expect(requestDeviceCode(fetchFn, API)).rejects.toThrow('正しくありません')
  })
  test('接続できなければ、接続先を示して失敗する', async () => {
    const fetchFn = async () => {
      throw new Error('ECONNREFUSED')
    }
    await expect(requestDeviceCode(fetchFn, API)).rejects.toThrow('https://api.example')
  })
})

describe('pollForToken', () => {
  test('承認されるまで、間隔をあけて待ち、承認されたらトークンを返す', async () => {
    let n = 0
    const { fetchFn, calls } = fakeFetch({
      'POST /api/auth/device/token': () => (++n < 3 ? pending() : json({ access_token: 'T', token_type: 'Bearer' })),
    })
    const c = clock()
    const token = await pollForToken({ fetchFn, apiUrl: API, sleep: c.sleep, now: c.now }, code)
    expect(token).toBe('T')
    expect(c.slept).toEqual([5000, 5000, 5000])
    expect(calls[0]?.body).toEqual({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: 'dev-1',
      client_id: 'ningyoutukai-cli',
    })
  })

  test('slow_down を受けたら、間隔を 5 秒延ばす', async () => {
    let n = 0
    const { fetchFn } = fakeFetch({
      'POST /api/auth/device/token': () =>
        ++n === 1 ? json({ error: 'slow_down' }, 400) : n === 2 ? pending() : json({ access_token: 'T' }),
    })
    const c = clock()
    await pollForToken({ fetchFn, apiUrl: API, sleep: c.sleep, now: c.now }, code)
    expect(c.slept).toEqual([5000, 10000, 10000])
  })

  test('拒否(access_denied)は、終了コード 3', async () => {
    const { fetchFn } = fakeFetch({ 'POST /api/auth/device/token': () => json({ error: 'access_denied' }, 400) })
    const c = clock()
    const err = await pollForToken({ fetchFn, apiUrl: API, sleep: c.sleep, now: c.now }, code).catch((e) => e)
    expect(err).toBeInstanceOf(CliError)
    expect(err.exitCode).toBe(EXIT.auth)
    expect(err.message).toContain('拒否')
  })

  test('期限切れ(expired_token)は、終了コード 3 で、login のやり直しを案内する', async () => {
    const { fetchFn } = fakeFetch({ 'POST /api/auth/device/token': () => json({ error: 'expired_token' }, 400) })
    const c = clock()
    const err = await pollForToken({ fetchFn, apiUrl: API, sleep: c.sleep, now: c.now }, code).catch((e) => e)
    expect(err.exitCode).toBe(EXIT.auth)
    expect(err.message).toContain('login')
  })

  test('承認されないまま、コードの期限が来たら、止まる(待ち続けない)', async () => {
    const { fetchFn, calls } = fakeFetch({ 'POST /api/auth/device/token': pending })
    const c = clock()
    const err = await pollForToken({ fetchFn, apiUrl: API, sleep: c.sleep, now: c.now }, { ...code, expires_in: 20 }).catch(
      (e) => e,
    )
    expect(err.exitCode).toBe(EXIT.auth)
    expect(calls.length).toBe(4) // 5 秒おきに、20 秒まで
  })

  test('知らないエラーは、終了コード 1 で失敗する', async () => {
    const { fetchFn } = fakeFetch({ 'POST /api/auth/device/token': () => json({ error: 'server_error' }, 500) })
    const c = clock()
    const err = await pollForToken({ fetchFn, apiUrl: API, sleep: c.sleep, now: c.now }, code).catch((e) => e)
    expect(err.exitCode).toBe(EXIT.error)
  })
})
