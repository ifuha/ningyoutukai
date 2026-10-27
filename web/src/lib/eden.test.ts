import { describe, expect, test } from 'bun:test'
import { ApiError } from '#/lib/api'
import { createClient, edenData } from './eden'

/** 偽の `fetch` を差した本物の Eden クライアント。Eden が実際に返す `{ data, error }` の形で検証する */
function clientWith(res: () => Response | Promise<Response>) {
  return createClient('http://localhost:3001', {
    fetcher: (async () => res()) as unknown as typeof fetch,
  })
}

const json = (body: string, status: number, contentType = 'application/json') =>
  new Response(body, { status, headers: { 'content-type': contentType } })

/** `edenData` が投げる `ApiError` を取り出す(投げなければ失敗) */
async function rejected(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('投げられなかった')
}

const CONNECT_ERROR = 'サーバーに接続できませんでした。時間をおいて、もう一度お試しください'

describe('edenData(Eden の戻り値の形を直接渡す)', () => {
  test('成功は本文(data)を返す', async () => {
    const r = await edenData(Promise.resolve({ data: { a: 1 }, error: null, status: 200 }))
    expect(r).toEqual({ a: 1 })
  })
  test('204 は、data が空文字でも undefined を返す', async () => {
    const r = await edenData(Promise.resolve({ data: '', error: null, status: 204 }))
    expect(r).toBeUndefined()
  })
  test('4xx は、本文の message で ApiError(status, message) を投げる', async () => {
    const e = await rejected(
      edenData(
        Promise.resolve({ data: null, error: { status: 404, value: { message: '見つかりません' } } }),
      ),
    )
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ status: 404, message: '見つかりません' })
  })
  test('本文が文字列(JSON でない)なら、既定の文', async () => {
    const e = await rejected(
      edenData(Promise.resolve({ data: null, error: { status: 502, value: '<html>Bad Gateway</html>' } })),
    )
    expect(e).toMatchObject({ status: 502, message: 'エラーが発生しました' })
  })
  test('message が文字列でなければ、既定の文', async () => {
    const e = await rejected(
      edenData(Promise.resolve({ data: null, error: { status: 500, value: { message: 1 } } })),
    )
    expect(e).toMatchObject({ status: 500, message: 'エラーが発生しました' })
  })
  test('通信断(Eden は 503 と Error を返す)は、status 0 の ApiError', async () => {
    const e = await rejected(
      edenData(Promise.resolve({ data: null, error: { status: 503, value: new Error('Unable to connect') } })),
    )
    expect(e).toMatchObject({ status: 0, message: CONNECT_ERROR })
  })
})

describe('edenData(本物の Eden クライアント + 偽の fetch)', () => {
  const get = (c: ReturnType<typeof clientWith>) => c.api.product.get()

  test('成功の JSON', async () => {
    const r = await edenData(get(clientWith(() => json('[{"productId":"p"}]', 200))))
    expect(r).toEqual([{ productId: 'p' }] as never)
  })
  test('204 は undefined(Eden の data は空文字)', async () => {
    const raw = await get(clientWith(() => new Response(null, { status: 204 })))
    expect(raw.data as unknown).toBe('')
    expect(await edenData(get(clientWith(() => new Response(null, { status: 204 }))))).toBeUndefined()
  })
  test('401 の JSON エラー', async () => {
    const e = await rejected(
      edenData(get(clientWith(() => json('{"message":"ログインが必要です"}', 401)))),
    )
    expect(e).toMatchObject({ status: 401, message: 'ログインが必要です' })
  })
  test('JSON と宣言されているのに壊れた本文でも、SyntaxError でなく ApiError(status, 既定の文)', async () => {
    const e = await rejected(edenData(get(clientWith(() => json('{oops', 400)))))
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ status: 400, message: 'エラーが発生しました' })
  })
  test('JSON と宣言されているのに空の本文でも、ApiError(status, 既定の文)', async () => {
    const e = await rejected(edenData(get(clientWith(() => json('', 500)))))
    expect(e).toMatchObject({ status: 500, message: 'エラーが発生しました' })
  })
  test('Content-Type の無い空の本文', async () => {
    const e = await rejected(edenData(get(clientWith(() => new Response(null, { status: 500 })))))
    expect(e).toMatchObject({ status: 500, message: 'エラーが発生しました' })
  })
  test('502 の HTML 本文', async () => {
    const e = await rejected(
      edenData(get(clientWith(() => json('<html>Bad Gateway</html>', 502, 'text/html')))),
    )
    expect(e).toMatchObject({ status: 502, message: 'エラーが発生しました' })
  })
  test('JSON 以外の 500(text/plain)', async () => {
    const e = await rejected(
      edenData(get(clientWith(() => json('Internal Server Error', 500, 'text/plain')))),
    )
    expect(e).toMatchObject({ status: 500, message: 'エラーが発生しました' })
  })
  test('message の無い JSON の 500', async () => {
    const e = await rejected(edenData(get(clientWith(() => json('{"a":1}', 500)))))
    expect(e).toMatchObject({ status: 500, message: 'エラーが発生しました' })
  })
  test('通信断(fetch が投げる)は status 0', async () => {
    const e = await rejected(
      edenData(
        get(
          clientWith(() => {
            throw new TypeError('fetch failed')
          }),
        ),
      ),
    )
    expect(e).toMatchObject({ status: 0, message: CONNECT_ERROR })
  })
  test('成功なのに本文が壊れていると、旧 api<T>() と同じく例外(SyntaxError)', async () => {
    const e = await rejected(edenData(get(clientWith(() => json('{oops', 200)))))
    expect(e).toBeInstanceOf(SyntaxError)
  })
})
