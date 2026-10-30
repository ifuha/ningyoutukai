// 楽観更新の実行(画面・react-query に依存しない)。
// 手順: 事前の確認(`before`。進行中の取得の取り消しなど)→ いまの値を控える → 画面の値を先に更新(`apply`)
//   `before` が Promise を返したときだけ待つ。返さなければ(取り消すものがなければ)、待たずに、その場で先に更新する。
//   待つと、先に更新するのが次のマイクロタスクになり、呼び出し側が同期的に行う見た目の後始末(影を消す、など)より遅れて、
//   元の位置が一瞬見える(後戻り)ことがある
//   → api を呼ぶ(`call`)→ 失敗したら、控えた値に戻して、`onError` を呼ぶ。成功・失敗のあとは `settle(ok)` を呼ぶ。
//   `settle` に、成功したか(`ok`)を渡す。呼び出し側は、成功したら何もせず(画面の予測を信じ、api に取り直しを頼まない)、失敗したときだけ、サーバーの値で取り直す。
// `apply` が null を返したら、先に更新しない(api だけ呼ぶ)。
// 値の読み書きは `store` に任せる(react-query のキャッシュを、アダプタで包む。テストでは、ただのオブジェクト)。

export type Store<Snapshot> = {
  read: () => Snapshot
  write: (snapshot: Snapshot) => void
}

export type OptimisticResult<R> = { ok: true; value: R } | { ok: false; error: unknown }

export async function runOptimistic<Snapshot, R>({
  store,
  before,
  apply,
  call,
  onError,
  settle,
}: {
  store: Store<Snapshot>
  before?: () => Promise<void> | void
  apply: (current: Snapshot) => Snapshot | null
  call: () => Promise<R>
  onError: (error: unknown) => void
  settle?: (ok: boolean) => void
}): Promise<OptimisticResult<R>> {
  let ok = false
  try {
    const waiting = before?.()
    if (waiting) await waiting
    const previous = store.read()
    const next = apply(previous)
    if (next) store.write(next)
    try {
      const value = await call()
      ok = true
      return { ok: true, value }
    } catch (error) {
      // 失敗: 先に更新したときだけ、元に戻す(更新していないなら、その間に入った他の更新を、古い値で上書きしない)
      if (next) store.write(previous)
      onError(error)
      return { ok: false, error }
    }
  } finally {
    settle?.(ok)
  }
}
