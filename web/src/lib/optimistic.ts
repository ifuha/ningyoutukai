// 楽観更新の実行(画面・react-query に依存しない)。
// 手順: 事前の確認(`before`。進行中の取得の取り消しなど)→ いまの値を控える → 画面の値を先に更新(`apply`)
//   → api を呼ぶ(`call`)→ 失敗したら、控えた値に戻して、`onError` を呼ぶ。成功・失敗のあとは `settle`(サーバーの値で取り直す)。
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
  before?: () => Promise<void>
  apply: (current: Snapshot) => Snapshot | null
  call: () => Promise<R>
  onError: (error: unknown) => void
  settle?: () => void
}): Promise<OptimisticResult<R>> {
  try {
    await before?.()
    const previous = store.read()
    const next = apply(previous)
    if (next) store.write(next)
    try {
      const value = await call()
      return { ok: true, value }
    } catch (error) {
      // 失敗: 先に更新した値を、元に戻す
      store.write(previous)
      onError(error)
      return { ok: false, error }
    }
  } finally {
    settle?.()
  }
}
