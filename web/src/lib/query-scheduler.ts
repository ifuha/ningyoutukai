import { notifyManager } from '@tanstack/react-query'

// react-query が、データの更新を画面(React)へ知らせるタイミングを、「同じタスクの終わり(マイクロタスク)」にする。
//
// 既定は `setTimeout(0)`(次のタスク)。そのため、カードやセクションを離して位置を確定したとき、
// 見た目の後始末(影のカードを消す・`transform` を戻す)は、その場で同期的に行われるのに、
// 新しい位置のデータは、次のタスクで画面に届く。間にブラウザの描画が入ると、**元の位置のカードが一瞬見える**(後戻り)。
// マイクロタスクにすると、同じタスクの中で、描画の前に、新しい位置が届く。

export function microtaskScheduler(callback: () => void): void {
  queueMicrotask(callback)
}

/** アプリの起動時に 1 回(何度呼んでもよい) */
export function useMicrotaskNotifications(): void {
  notifyManager.setScheduler(microtaskScheduler)
}
