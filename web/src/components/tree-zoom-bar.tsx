// ツリーの右下の表示。いまの倍率(%)だけ。
// 拡大・縮小は、ホイール・ピンチ・キー(+ -)でできる。全体表示は、キー(0)でできる(どれもボタンは置かない)
export function TreeZoomBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center justify-end border border-ink/30 bg-surface/80 px-2 py-1 text-sm">
      <span className="w-12 text-right tabular-nums opacity-60">{percent}%</span>
    </div>
  )
}
