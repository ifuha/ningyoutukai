import { describe, expect, test } from 'bun:test'
import { initialStatus, queryLabel, statusText, step, type Fetching } from './loading-status'

const f = (hash: string, label: string, refresh = false): Fetching => ({ hash, label, refresh })

describe('queryLabel(クエリのキー → 利用者向けの名前)', () => {
  test('プロダクトまわり', () => {
    expect(queryLabel(['products'])).toBe('プロダクト一覧')
    expect(queryLabel(['products', 'p1'])).toBe('プロダクト')
    expect(queryLabel(['products', 'p1', 'tree'])).toBe('タスクのツリー')
    expect(queryLabel(['products', 'p1', 'sections'])).toBe('セクション')
    expect(queryLabel(['products', 'p1', 'task_kinds'])).toBe('タスクの種類')
  })

  test('招待・カレンダー', () => {
    expect(queryLabel(['invitations'])).toBe('招待')
    expect(queryLabel(['google-calendar-status'])).toBe('カレンダーの連携')
  })

  test('出さないもの: 定期的な確認(revision)・入力のたびの検索(招待の候補)・知らないキー', () => {
    expect(queryLabel(['product-revision', 'p1'])).toBeNull()
    expect(queryLabel(['products', 'p1', 'invite-candidates', 'abc'])).toBeNull()
    expect(queryLabel(['something-else'])).toBeNull()
    expect(queryLabel([])).toBeNull()
  })
})

describe('statusText', () => {
  test('データが無い取得は「読み込み中」、取り直しは「更新中」', () => {
    expect(statusText({ label: 'タスクのツリー', refresh: false })).toBe('タスクのツリーを読み込み中')
    expect(statusText({ label: 'プロダクト', refresh: true })).toBe('プロダクトを更新中')
  })
})

describe('step(ちらつかないように、出すか決める)', () => {
  const opts = { delay: 400, hold: 700 }

  test('取得が始まっても、delay が経つまでは出さない。経ったら出す', () => {
    const t0 = 1000
    const a = step(initialStatus, [f('h1', 'タスクのツリー')], t0, opts)
    expect(a.visible).toEqual([])
    expect(a.wakeAt).toBe(t0 + 400)

    const b = step(a.state, [f('h1', 'タスクのツリー')], t0 + 399, opts)
    expect(b.visible).toEqual([])

    const c = step(b.state, [f('h1', 'タスクのツリー')], t0 + 400, opts)
    expect(c.visible).toEqual(['タスクのツリーを読み込み中'])
  })

  test('一瞬で終わった取得は、一度も出さない(ちらつかない)', () => {
    const a = step(initialStatus, [f('h1', 'プロダクト')], 0, opts)
    const b = step(a.state, [], 100, opts)
    expect(b.visible).toEqual([])
    expect(b.state.size).toBe(0)
    expect(b.wakeAt).toBeNull()
  })

  test('出した取得は、終わったあとも hold の間は残し、過ぎたら消す', () => {
    let s = step(initialStatus, [f('h1', 'プロダクト一覧')], 0, opts)
    s = step(s.state, [f('h1', 'プロダクト一覧')], 400, opts) // ここで出始める(shownAt = 400)
    expect(s.visible).toEqual(['プロダクト一覧を読み込み中'])

    const done = step(s.state, [], 450, opts) // 終わった(doneAt = 450)。出した時刻 400 と終わった 450 の遅いほうから 700
    expect(done.visible).toEqual(['プロダクト一覧を読み込み中'])
    expect(done.wakeAt).toBe(450 + 700)

    const still = step(done.state, [], 1149, opts)
    expect(still.visible).toEqual(['プロダクト一覧を読み込み中'])
    const gone = step(still.state, [], 1150, opts)
    expect(gone.visible).toEqual([])
    expect(gone.state.size).toBe(0)
    expect(gone.wakeAt).toBeNull()
  })

  test('同じ名前の取得が複数あっても、1 行にまとめる。始まった順に並ぶ', () => {
    let s = step(initialStatus, [f('a', 'タスクのツリー')], 0, opts)
    s = step(s.state, [f('a', 'タスクのツリー'), f('b', 'セクション'), f('c', 'タスクのツリー')], 100, opts)
    s = step(s.state, [f('a', 'タスクのツリー'), f('b', 'セクション'), f('c', 'タスクのツリー')], 500, opts)
    // a は 0 から、b・c は 100 から → a が先。a と c は同じ文言なので 1 行
    expect(s.visible).toEqual(['タスクのツリーを読み込み中', 'セクションを読み込み中'])
  })

  test('同じ時刻に始まった取得は、取得中として返ってくる順が変わっても、行の並びは変わらない', () => {
    const items = [f('a', 'セクション'), f('b', '招待'), f('c', 'カレンダーの連携')]
    let s = step(initialStatus, items, 0, opts)
    s = step(s.state, items, 400, opts)
    const first = s.visible
    expect(first).toHaveLength(3)

    // 返ってくる順を、入れ替える(react-query は、更新のたびに順が変わることがある)
    for (const order of [[2, 0, 1], [1, 2, 0], [2, 1, 0]]) {
      s = step(s.state, order.map((i) => items[i]!), 500, opts)
      expect(s.visible).toEqual(first)
    }
  })

  test('取り直し(データあり)と読み込み(データなし)は、別の行になる', () => {
    let s = step(initialStatus, [f('a', 'プロダクト', true), f('b', 'タスクのツリー', false)], 0, opts)
    s = step(s.state, [f('a', 'プロダクト', true), f('b', 'タスクのツリー', false)], 400, opts)
    expect(s.visible).toEqual(['プロダクトを更新中', 'タスクのツリーを読み込み中'])
  })

  test('出したあとに、同じ取得が続いて、終わらなければ、残り続ける', () => {
    let s = step(initialStatus, [f('a', 'タスクのツリー')], 0, opts)
    for (const t of [400, 5000, 60000]) {
      s = step(s.state, [f('a', 'タスクのツリー')], t, opts)
      expect(s.visible).toEqual(['タスクのツリーを読み込み中'])
    }
  })

  test('次に見直す時刻: 出す前の取得の delay と、終わった取得の hold のうち、早いほう', () => {
    // a: 出して、終わった(hold の終わりは 450 + 700)。b: 今始まった(delay の終わりは 600 + 400)
    let s = step(initialStatus, [f('a', 'プロダクト')], 0, opts)
    s = step(s.state, [f('a', 'プロダクト')], 400, opts)
    s = step(s.state, [f('b', 'セクション')], 450, opts)
    expect(s.visible).toEqual(['プロダクトを読み込み中'])
    expect(s.wakeAt).toBe(450 + 400) // b の delay(850)が、a の hold(1150)より早い
  })

  test('何もなければ、何も出さず、見直しも要らない', () => {
    const s = step(initialStatus, [], 1234, opts)
    expect(s).toEqual({ state: new Map(), visible: [], wakeAt: null })
  })
})
