// 確定(マウスを離したあとの api の呼び出し)が進行中か、と、取得の応答を捨てるかの判断。
//
// 起きていた問題: 確定の PATCH が通っている間に、別の取得(版の確認が起こす取り直しなど)が始まると、
// その取得は **PATCH が反映される前のサーバーの状態** を返す。その応答が、画面の先行更新を上書きして、
// 離した位置が、元の位置に戻ったように見えた。
// 対策: ① 確定の最中は、版の確認による取り直しを待つ。② 確定と重なった取得の応答は、捨てて、画面の今の値を保つ
// (そのあと、確定による版の変化を、版の確認が検知して、確定後の状態を取り直す)

let pending = 0
let epoch = 0

/** 確定の開始(終了は `endCommit`)。`epoch` は、開始と終了のたびに進む */
export function beginCommit(): void {
  pending += 1
  epoch += 1
}

export function endCommit(): void {
  pending = Math.max(0, pending - 1)
  epoch += 1
}

export function hasPendingCommit(): boolean {
  return pending > 0
}

export function commitEpoch(): number {
  return epoch
}

/**
 * 取得を行い、**取得の間に確定が(始まった・終わった・進行中だった)なら、応答を捨てて**、画面の今の値(`current`)を返す。
 * 今の値が無ければ(まだ何も取れていない)、応答を使う。確定と重ならなかった取得は、そのまま返す。
 */
export async function fetchUnlessCommitted<T>(
  fetch: () => Promise<T>,
  current: () => T | undefined,
): Promise<T> {
  const startedEpoch = commitEpoch()
  const startedPending = hasPendingCommit()
  const data = await fetch()
  if (startedPending || hasPendingCommit() || commitEpoch() !== startedEpoch) {
    const now = current()
    if (now !== undefined) return now
  }
  return data
}
