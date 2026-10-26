import { describe, expect, test } from 'bun:test'
import { ApiError } from '#/lib/api'
import { createClient } from './eden'
import {
  createSection,
  deleteSection,
  listSections,
  moveMember,
  sectionApiErrorKind,
  updateSection,
} from './section-api'

const P = '11111111-1111-4111-8111-111111111111'
const S = '22222222-2222-4222-8222-222222222222'
const M = '33333333-3333-4333-8333-333333333333'

type Sent = { url: string; method: string; body: string | null; contentType: string | null }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** 送られた要求(URL、メソッド、本文)を記録し、`respond` が返す応答を返す、偽の `fetch` を差した Eden クライアント */
function recorder(respond: () => Response | Promise<Response> = () => json({})) {
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
      return respond()
    }) as unknown as typeof fetch,
  })
  return { client, sent }
}

const section = {
  sectionId: S,
  sectionName: '2026-10-01',
  color: 'red',
  x: 0,
  y: 0,
  width: 300,
  height: 400,
  createdAt: '2026-10-25T08:00:00.000Z',
  memberIds: [M],
}

/** 投げられた例外を取り出す(投げなければ失敗) */
async function rejected(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('投げられなかった')
}

describe('listSections', () => {
  test('GET /api/product/{productId}/section。本文なし', async () => {
    const { client, sent } = recorder(() => json([section]))
    await listSections(P, client)
    expect(sent[0].method).toBe('GET')
    expect(sent[0].url).toBe(`http://localhost:3001/api/product/${P}/section`)
    expect(sent[0].body).toBeNull()
  })

  test('応答はそのまま返る。日時と日付らしい名前は、文字列のまま(Date に変わらない)', async () => {
    const { client } = recorder(() => json([section]))
    const r = await listSections(P, client)
    expect(r).toEqual([section] as never)
    expect(typeof r[0].createdAt).toBe('string')
    expect(r[0].sectionName).toBe('2026-10-01')
    expect(r[0].memberIds).toEqual([M])
  })
})

describe('createSection', () => {
  test('POST。本文は、渡したとおり(位置と大きさも含む)', async () => {
    const { client, sent } = recorder(() => json(section, 201))
    const input = { sectionName: 'デザイン', color: 'blue' as const, x: 10, y: -20, width: 320, height: 240 }
    const r = await createSection(P, input, client)
    expect(sent[0].method).toBe('POST')
    expect(sent[0].url).toBe(`http://localhost:3001/api/product/${P}/section`)
    expect(sent[0].body).toBe(JSON.stringify(input))
    expect(sent[0].contentType).toContain('application/json')
    expect(r).toEqual(section as never) // 201 の本文が返る
  })

  test('位置と大きさを省略すると、キーごと送らない(api の既定になる)', async () => {
    const { client, sent } = recorder(() => json(section, 201))
    await createSection(P, { sectionName: 'a', color: 'red' }, client)
    expect(sent[0].body).toBe(JSON.stringify({ sectionName: 'a', color: 'red' }))
    for (const key of ['"x"', '"y"', 'width', 'height']) expect(sent[0].body).not.toContain(key)
  })

  test('undefined を明示しても、キーは送らない。0 は、そのまま送る', async () => {
    const { client, sent } = recorder(() => json(section, 201))
    await createSection(P, { sectionName: 'a', color: 'red', x: 0, y: undefined }, client)
    expect(sent[0].body).toBe(JSON.stringify({ sectionName: 'a', color: 'red', x: 0 }))
  })
})

describe('updateSection', () => {
  test('PATCH。変えるキーだけを送る', async () => {
    const { client, sent } = recorder(() => json(section))
    await updateSection(P, S, { sectionName: '新しい名前' }, client)
    expect(sent[0].method).toBe('PATCH')
    expect(sent[0].url).toBe(`http://localhost:3001/api/product/${P}/section/${S}`)
    expect(sent[0].body).toBe(JSON.stringify({ sectionName: '新しい名前' }))
    expect(sent[0].body).not.toContain('color')
  })

  test('undefined のキーは送らない。0 と空でない値は残す(0 を落とすと、位置を 0 に動かせない)', async () => {
    const { client, sent } = recorder(() => json(section))
    await updateSection(P, S, { x: 0, y: 5, width: undefined, color: undefined }, client)
    expect(sent[0].body).toBe(JSON.stringify({ x: 0, y: 5 }))
  })

  test('色と大きさだけの変更', async () => {
    const { client, sent } = recorder(() => json(section))
    await updateSection(P, S, { color: 'lightblue', width: 500, height: 100 }, client)
    expect(sent[0].body).toBe(JSON.stringify({ color: 'lightblue', width: 500, height: 100 }))
  })
})

describe('deleteSection', () => {
  test('DELETE。本文なし。204 は undefined', async () => {
    const { client, sent } = recorder(() => new Response(null, { status: 204 }))
    const r = await deleteSection(P, S, client)
    expect(sent[0].method).toBe('DELETE')
    expect(sent[0].url).toBe(`http://localhost:3001/api/product/${P}/section/${S}`)
    expect(sent[0].body).toBeNull()
    expect(r).toBeUndefined()
  })
})

describe('moveMember(sectionId の 3 状態)', () => {
  const moved = { productMemberId: M, sectionId: null, positionX: 1, positionY: 2 }
  const url = `http://localhost:3001/api/product/${P}/member/${M}/position`

  test('キーなし = 所属を変えない。本文に sectionId を含めない', async () => {
    const { client, sent } = recorder(() => json(moved))
    await moveMember(P, M, { positionX: 1, positionY: 2 }, client)
    expect(sent[0].method).toBe('PATCH')
    expect(sent[0].url).toBe(url)
    expect(sent[0].body).toBe('{"positionX":1,"positionY":2}')
    expect(sent[0].body).not.toContain('sectionId')
  })

  test('undefined を明示しても、キーなしと同じ(null と取り違えない)', async () => {
    const { client, sent } = recorder(() => json(moved))
    await moveMember(P, M, { positionX: 1, positionY: 2, sectionId: undefined }, client)
    expect(sent[0].body).toBe('{"positionX":1,"positionY":2}')
    expect(sent[0].body).not.toContain('sectionId')
  })

  test('null = 無所属にする。"sectionId":null を送る', async () => {
    const { client, sent } = recorder(() => json(moved))
    await moveMember(P, M, { positionX: 1, positionY: 2, sectionId: null }, client)
    expect(sent[0].body).toBe('{"positionX":1,"positionY":2,"sectionId":null}')
  })

  test('uuid = そのセクションへ入れる', async () => {
    const { client, sent } = recorder(() => json({ ...moved, sectionId: S }))
    const r = await moveMember(P, M, { positionX: 1, positionY: 2, sectionId: S }, client)
    expect(sent[0].body).toBe(JSON.stringify({ positionX: 1, positionY: 2, sectionId: S }))
    expect(r.sectionId).toBe(S)
  })

  test('座標の 0 と負の値は、そのまま送る', async () => {
    const { client, sent } = recorder(() => json(moved))
    await moveMember(P, M, { positionX: 0, positionY: -12.5 }, client)
    expect(sent[0].body).toBe('{"positionX":0,"positionY":-12.5}')
  })
})

describe('失敗(ApiError と、失敗の種類)', () => {
  const cases = [
    { status: 403, message: 'プロダクトリーダーのみ実行できます', kind: 'forbidden' },
    { status: 404, message: 'セクションが見つかりません', kind: 'not-found' },
    { status: 409, message: '同じ名前のセクションがすでにあります', kind: 'name-conflict' },
    { status: 422, message: 'セクションが見つかりません', kind: 'invalid' },
  ] as const

  for (const c of cases) {
    test(`${c.status} は、api の message を保った ApiError で、種類は ${c.kind}`, async () => {
      const { client } = recorder(() => json({ message: c.message }, c.status))
      const e = await rejected(createSection(P, { sectionName: 'a', color: 'red' }, client))
      expect(e).toBeInstanceOf(ApiError)
      expect(e).toMatchObject({ status: c.status, message: c.message })
      expect(sectionApiErrorKind(e)).toBe(c.kind)
    })
  }

  test('どの呼び出しでも、失敗は ApiError になる(一覧・更新・削除・移動)', async () => {
    const { client } = recorder(() => json({ message: 'だめ' }, 403))
    const calls = [
      listSections(P, client),
      updateSection(P, S, { x: 1 }, client),
      deleteSection(P, S, client),
      moveMember(P, M, { positionX: 1, positionY: 2 }, client),
    ]
    for (const p of calls) expect(await rejected(p)).toMatchObject({ status: 403, message: 'だめ' })
  })

  test('401 は unauthorized、想定外の状態は unknown', async () => {
    const a = recorder(() => json({ message: 'ログインが必要です' }, 401))
    const e401 = await rejected(listSections(P, a.client))
    expect(sectionApiErrorKind(e401)).toBe('unauthorized')
    const b = recorder(() => json({ message: 'x' }, 500))
    const e500 = await rejected(listSections(P, b.client))
    expect(sectionApiErrorKind(e500)).toBe('unknown')
  })

  test('通信できないとき(fetch が例外)は、status 0 の ApiError で、種類は network', async () => {
    const { client } = recorder(() => {
      throw new Error('Unable to connect')
    })
    const e = await rejected(deleteSection(P, S, client))
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ status: 0 })
    expect(sectionApiErrorKind(e)).toBe('network')
  })

  test('本文が壊れた(JSON でない)エラー応答でも、ApiError(status, 既定の文)', async () => {
    const { client } = recorder(
      () => new Response('{oops', { status: 422, headers: { 'content-type': 'application/json' } }),
    )
    const e = await rejected(moveMember(P, M, { positionX: 1, positionY: 2 }, client))
    expect(e).toMatchObject({ status: 422, message: 'エラーが発生しました' })
    expect(sectionApiErrorKind(e)).toBe('invalid')
  })

  test('ApiError でない例外は、null(分類しない)', () => {
    expect(sectionApiErrorKind(new Error('x'))).toBeNull()
    expect(sectionApiErrorKind('x')).toBeNull()
    expect(sectionApiErrorKind(undefined)).toBeNull()
  })
})
