/**
 * 「いま何を読み込んでいるか」を、画面の上に出すための、DB にも画面にも触れない部分。
 * - 取得中のクエリ(react-query)を、利用者向けの名前にする(`queryLabel`)
 * - ちらつかないよう、出すか出さないかを決める(`step`)。短い取得は出さず、出したら少しのあいだ残す
 */

/** クエリのキーを、利用者向けの名前にする。出さないもの(定期的な確認・入力のたびの検索)は null */
export function queryLabel(key: readonly unknown[]): string | null {
  const [head, , kind] = key
  if (head === 'products') {
    if (key.length === 1) return 'プロダクト一覧'
    if (key.length === 2) return 'プロダクト'
    if (kind === 'tree') return 'タスクのツリー'
    if (kind === 'sections') return 'セクション'
    if (kind === 'task_kinds') return 'タスクの種類'
    return null // 招待の候補の検索など(入力のたびに動くので、出さない)
  }
  if (head === 'invitations') return '招待'
  if (head === 'google-calendar-status') return 'カレンダーの連携'
  return null // 他の人の変更を見に行く定期的な確認(product-revision)など
}

/** 取得中のクエリ 1 件。`refresh`: すでにデータがあり、取り直している(キャッシュを出したまま、裏で) */
export type Fetching = { hash: string; label: string; refresh: boolean }

/** 画面に出す 1 行。 例: 「タスクのツリーを読み込み中」「プロダクトを更新中」 */
export function statusText(item: Pick<Fetching, 'label' | 'refresh'>): string {
  return `${item.label}を${item.refresh ? '更新中' : '読み込み中'}`
}

type Entry = Fetching & {
  /** 取得が始まった時刻(最初に見た時刻) */
  firstSeen: number
  /** 画面に出し始めた時刻。まだ出していなければ undefined */
  shownAt?: number
  /** 取得が終わった時刻。まだ取得中なら undefined */
  doneAt?: number
}

export type StatusState = ReadonlyMap<string, Entry>

export const initialStatus: StatusState = new Map()

export type StepOptions = {
  /** これより短い取得は、出さない(ms) */
  delay?: number
  /** 出した取得は、終わったあとも、少なくともこの間は残す(ms) */
  hold?: number
}

export type StepResult = {
  state: StatusState
  /** 画面に出す行(重複は 1 つにまとめる。取得が始まった順) */
  visible: string[]
  /** 次に、状態を見直す時刻(`delay` が経つ・`hold` が終わる)。見直す必要がなければ null */
  wakeAt: number | null
}

/**
 * 状態を進める。`fetching` は、いま取得中のもの。`now` は現在の時刻(ms)。
 * - 取得が始まって `delay` が経つまでは、出さない(一瞬で終わる取得で、ちらつかないように)
 * - いったん出したら、取得が終わっても `hold` の間は、残す(読めないまま消えないように)
 */
export function step(
  prev: StatusState,
  fetching: readonly Fetching[],
  now: number,
  { delay = 400, hold = 700 }: StepOptions = {},
): StepResult {
  const next = new Map<string, Entry>()
  const live = new Set(fetching.map((f) => f.hash))

  for (const f of fetching) {
    const old = prev.get(f.hash)
    // 取り直しの途中で、データの有無が変わっても、名前は最新にする。開始時刻は、最初のものを引き継ぐ
    next.set(f.hash, { ...f, firstSeen: old?.firstSeen ?? now, shownAt: old?.shownAt })
  }
  for (const [hash, old] of prev) {
    if (live.has(hash)) continue
    const doneAt = old.doneAt ?? now
    // 出したことのない取得は、終わったら捨てる。出したものは、`hold` の間だけ残す
    if (old.shownAt !== undefined && now - Math.max(old.shownAt, doneAt) < hold) {
      next.set(hash, { ...old, doneAt })
    }
  }

  let wakeAt: number | null = null
  const wake = (t: number) => {
    wakeAt = wakeAt === null ? t : Math.min(wakeAt, t)
  }
  const shown: Entry[] = []
  for (const [hash, e] of next) {
    if (e.shownAt === undefined && now - e.firstSeen >= delay) next.set(hash, { ...e, shownAt: now })
    const cur = next.get(hash)!
    if (cur.shownAt !== undefined) {
      shown.push(cur)
      if (cur.doneAt !== undefined) wake(Math.max(cur.shownAt, cur.doneAt) + hold)
    } else {
      wake(cur.firstSeen + delay)
    }
  }

  const visible: string[] = []
  // 始まった順。同じ時刻に始まったもの(まとめて始まる取得)は、`hash` の順で決め、行が入れ替わらないようにする
  const byStart = (a: Entry, b: Entry) =>
    a.firstSeen - b.firstSeen || (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0)
  for (const e of shown.sort(byStart)) {
    const text = statusText(e)
    if (!visible.includes(text)) visible.push(text)
  }
  return { state: next, visible, wakeAt }
}
