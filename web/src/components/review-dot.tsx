// 確認待ちがあることを知らせる、赤い点(サイドバーの行・たたんだ帯のアイコン)。
// 点のまわりに、輪が 3 倍まで広がって消える動きを繰り返す(`styles.css` の `review-ping`。標準の `animate-ping` は 2 倍。動きを減らす設定のときは、点だけ)。色は、強い赤(`red-600`。テーマの `danger` より濃い)。
// 飾りなので読み上げない(意味は、親の名前に足す)。`className` は、置き場所(絶対配置など)のために、外側に付ける
export function ReviewDot({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`flex shrink-0 ${className}`}>
      <span data-review-dot className="relative flex size-2.5">
        <span className="review-ping absolute inline-flex size-full rounded-full bg-red-500" />
        <span className="relative inline-flex size-2.5 rounded-full bg-red-600" />
      </span>
    </span>
  )
}

/** 確認待ちがあるか(リーダーのプロダクトで 1 件以上) */
export function hasPendingReview(count: number | null | undefined): boolean {
  return typeof count === 'number' && count > 0
}

/** 読み上げの名前に足す文(例: 「Alpha(確認待ち 2 件)」) */
export function withReviewLabel(name: string, count: number | null | undefined): string {
  return hasPendingReview(count) ? `${name}(確認待ち ${count} 件)` : name
}
