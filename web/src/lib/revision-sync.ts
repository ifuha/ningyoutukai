// 他の人の変更を画面に反映するための、判断(画面に依存しない関数。テストする)。
// 画面は、数秒ごとにプロダクトの版(`GET /api/product/:productId/revision`)を取り、
// 前に反映した版と違えば、そのプロダクトのデータを取り直す。ドラッグの最中は、取り直しを待つ(再描画で、つかんだ物が飛ばないように)

export type RevisionAction =
  /** 最初の版。基準として覚えるだけ(取り直さない。いま見ているデータが、この版のもの) */
  | 'baseline'
  /** 変わっていない */
  | 'none'
  /** 変わったが、ドラッグの最中なので、少し待ってからもう一度判断する */
  | 'defer'
  /** 変わった。データを取り直し、この版を反映済みにする */
  | 'refresh'

/**
 * @param applied 前に反映した版。まだ無ければ null
 * @param latest いま取れた版
 * @param dragging ドラッグが確定している最中か
 */
export function revisionAction(
  applied: string | null,
  latest: string,
  dragging: boolean,
): RevisionAction {
  if (applied === null) return 'baseline'
  if (latest === applied) return 'none'
  return dragging ? 'defer' : 'refresh'
}
