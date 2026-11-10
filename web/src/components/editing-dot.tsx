// 編集中の印(緑の点)。点のまわりに、輪が広がって消える動きを繰り返す(動きを減らす設定のときは、点だけ)
// ツリーのカード・文書のパネル・文書のダイアログで、同じ見た目にする。飾りなので、読み上げない(意味は、横の文字が伝える)
export function EditingDot() {
  return (
    <span aria-hidden="true" className="relative flex size-2 shrink-0">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75 motion-reduce:animate-none" />
      <span className="relative inline-flex size-2 rounded-full bg-green-500" />
    </span>
  )
}
