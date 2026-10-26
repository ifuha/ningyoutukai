import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DRAW_IDLE, drawReducer, formatSize, previewRect, type DrawEvent, type DrawState } from '#/lib/section-draw'
import type { Point, Rect } from '#/lib/section-edit-geometry'
import { sectionStyle } from '#/lib/section-style'

// セクションをドラッグで置く層(第 2 段階 A)。ツールバーの「セクション」を選んでいる間だけ、キャンバスの上に重ねる
//
// 組み込む側(キャンバスの、拡大・移動の変換がかかった層の中)の条件:
// - この層は、親の座標系の原点を中心に、とても大きな透明の四角(HUGE の 2 倍)で広がる。親が `overflow-hidden` の
//   ビューポートの中にあれば、見えている範囲だけがポインタを受ける(親が隠さないと、はみ出した分だけ、スクロール領域が増える)
// - 親は `position: relative` などで、絶対配置の基準になっていること
// - 重ね順は `z-30`(カードとセクションの上、ツールバーの下)。違うなら、`className` で `z-*` を渡す
// - 押した・動かした・離したイベントは、この層が受けたものだけ `stopPropagation` する(親のキャンバスのパンを始めない)。
//   受けなかったもの(右クリック、マルチタッチの 2 本目以降)は、伝える(ピンチ操作などを妨げない)
// - ポインタの座標は `toCanvas`(画面の座標 → キャンバスの座標)で得る。`offsetX` / `offsetY` は、`SectionBox` と同じく、
//   負の座標があるときの、全体のずらし量(プレビューを置く位置にだけ使う。`toCanvas` の結果には足さない)
//
// 確定・取り消しの判断は、`#/lib/section-draw`(状態機械)が行う。ここは、イベントを事象に変えて、副作用を実行するだけ

const HUGE = 100_000

export function SectionDrawLayer({
  active,
  scale,
  toCanvas,
  onCreate,
  onCancel,
  offsetX = 0,
  offsetY = 0,
  className = 'z-30',
}: {
  active: boolean
  /** キャンバスの拡大率。プレビューの枠線と文字を、拡大率に関わらず同じ見た目にするために使う */
  scale: number
  toCanvas: (client: Point) => Point
  onCreate: (rect: Rect) => void
  onCancel: () => void
  offsetX?: number
  offsetY?: number
  className?: string
}) {
  // 状態は ref に持つ(確定を 1 回だけにするため、再描画を待たずに、同期して判断する)。プレビューの描画用に、四角だけ state に写す
  const stateRef = useRef<DrawState>(DRAW_IDLE)
  const [preview, setPreview] = useState<Rect | null>(null)

  // 最新の props を、イベントの処理(window の keydown を含む)から読むための ref
  const latest = useRef({ toCanvas, onCreate, onCancel })
  latest.current = { toCanvas, onCreate, onCancel }

  // 事象を状態機械に渡し、副作用(onCreate / onCancel)を実行する。この層が受けたかどうかを返す
  function apply(event: DrawEvent): boolean {
    const step = drawReducer(stateRef.current, event)
    stateRef.current = step.state
    setPreview(previewRect(step.state))
    if (step.effect?.type === 'create') latest.current.onCreate(step.effect.rect)
    else if (step.effect?.type === 'cancel') latest.current.onCancel()
    return step.consumed
  }

  // 道具が切られたら(active が false)、途中のドラッグを、何も呼ばずに捨てる
  useEffect(() => {
    if (!active) {
      stateRef.current = DRAW_IDLE
      setPreview(null)
    }
  }, [active])

  // Esc で抜けられる(ドラッグ中でなくても、取り消しを返す)。フォーカスの位置に関わらず、window で受ける
  useEffect(() => {
    if (!active) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      apply({ type: 'escape' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // apply は ref だけを読むので、毎回作り直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  if (!active) return null

  const point = (e: ReactPointerEvent) => latest.current.toCanvas({ x: e.clientX, y: e.clientY })

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const consumed = apply({
      type: 'down',
      pointerId: e.pointerId,
      button: e.button,
      isPrimary: e.isPrimary,
      point: point(e),
    })
    if (!consumed) return
    // ドラッグが層の外に出ても、move / up を受け取り続ける
    e.currentTarget.setPointerCapture?.(e.pointerId)
    e.stopPropagation()
    e.preventDefault()
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (stateRef.current.kind !== 'dragging') return
    if (apply({ type: 'move', pointerId: e.pointerId, point: point(e) })) e.stopPropagation()
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const wasDragging = stateRef.current.kind === 'dragging'
    if (apply({ type: 'up', pointerId: e.pointerId, button: e.button, point: point(e) })) {
      e.stopPropagation()
      // 確定したら、キャプチャを手放す(ブラウザも離したときに自動で手放す。後から来る lostpointercapture は、待機なので何も起きない)
      if (wasDragging) e.currentTarget.releasePointerCapture?.(e.pointerId)
    }
  }

  // pointercancel と、キャプチャが失われたとき(ドラッグ中だけ取り消しになる。確定のあとの lostpointercapture は無視される)
  function onCancelEvent(e: ReactPointerEvent<HTMLDivElement>) {
    apply({ type: 'cancel', pointerId: e.pointerId })
  }

  const style = sectionStyle('red')
  const lineWidth = 2 / scale

  return (
    <div
      data-section-draw-layer=""
      role="application"
      aria-label="セクションを置く。ドラッグで範囲を決めます。クリックだけだと、標準の大きさで置きます。Esc で中止します"
      className={`absolute ${className}`}
      style={{
        left: -HUGE,
        top: -HUGE,
        width: HUGE * 2,
        height: HUGE * 2,
        cursor: 'crosshair',
        // タッチでのスクロール・拡大を始めさせない(1 本目の指で置く。2 本目以降は、親のピンチに任せる)
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onCancelEvent}
      onLostPointerCapture={onCancelEvent}
    >
      {preview && (
        <div
          aria-hidden="true"
          data-section-draw-preview=""
          className={`pointer-events-none absolute border-dashed ${style.box}`}
          style={{
            // 層の左上が、親の原点から HUGE だけ左上にあるので、HUGE を足して、親の座標に合わせる
            left: preview.x + offsetX + HUGE,
            top: preview.y + offsetY + HUGE,
            width: preview.width,
            height: preview.height,
            borderWidth: lineWidth,
          }}
        >
          <span
            data-section-draw-size=""
            className="absolute left-0 whitespace-nowrap rounded-sm bg-ink px-1 font-mono text-surface"
            style={{
              top: preview.height + 4 / scale,
              fontSize: 12 / scale,
              lineHeight: 1.5,
            }}
          >
            {formatSize(preview)}
          </span>
        </div>
      )}
    </div>
  )
}
