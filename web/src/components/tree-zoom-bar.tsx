// ツリーの右下の表示。いまの倍率(%)と、「全体表示」(位置も倍率も、最初の全体が収まる状態に戻す)。
// 拡大・縮小は、ホイール・ピンチ・キー(+ - 0)でできる(ボタンの「+」「−」は置かない)
const buttonClass =
  'flex h-7 min-w-7 items-center justify-center border border-ink px-2 text-sm hover:bg-side-item'

export function TreeZoomBar({
  percent,
  onReset,
}: {
  percent: number
  onReset: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-1 border border-ink/30 bg-surface/80 p-1 text-sm">
      <span className="w-12 text-right tabular-nums opacity-60">
        {percent}%
      </span>
      <button
        type="button"
        aria-label="全体を表示"
        title="全体を表示(0)"
        onClick={onReset}
        className={buttonClass}
      >
        全体表示
      </button>
    </div>
  )
}
