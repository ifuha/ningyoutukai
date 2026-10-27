import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { startDragSession } from '#/lib/drag-session'
import type { DragSession, DragTarget } from '#/lib/drag-session'
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
// 押した瞬間から離すまで、window で動きを受ける(`drag-session.ts`。速く動かしても、層の外へ出ても追従する)。
// プレビューの描き直しは、1 フレームに 1 回にまとめる(動きの計算は、イベントごとに最新の座標で行う)。位置は、離した座標で決める

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
  // いまの押してから離すまでの操作(window で受ける)
  const sessionRef = useRef<DragSession | null>(null)

  // 最新の props を、イベントの処理(window の keydown を含む)から読むための ref
  const latest = useRef({ toCanvas, onCreate, onCancel })
  latest.current = { toCanvas, onCreate, onCancel }

  // 事象を状態機械に渡し、副作用(onCreate / onCancel)を実行する。この層が受けたかどうかを返す
  // `render: false` のとき(動き)は、プレビューの描き直しを、次のフレームにまとめる
  function apply(event: DrawEvent, render = true): boolean {
    const step = drawReducer(stateRef.current, event)
    stateRef.current = step.state
    if (render) setPreview(previewRect(step.state))
    if (step.effect?.type === 'create') latest.current.onCreate(step.effect.rect)
    else if (step.effect?.type === 'cancel') latest.current.onCancel()
    return step.consumed
  }

  // 道具が切られたら(active が false)、途中のドラッグを、何も呼ばずに捨てる
  useEffect(() => {
    if (!active) {
      sessionRef.current?.end()
      sessionRef.current = null
      stateRef.current = DRAW_IDLE
      setPreview(null)
    }
  }, [active])
  // 画面から消えるとき、続いている操作のリスナーを外す
  useEffect(
    () => () => {
      sessionRef.current?.end()
      sessionRef.current = null
    },
    [],
  )

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

  // 押した瞬間から離すまでの操作を、window で受ける。層の外へ出ても、画面の外へ出ても、動きと離しが届く
  function startSession(pointerId: number) {
    sessionRef.current?.end()
    const s: DragSession = startDragSession({
      target: window as unknown as DragTarget,
      pointerId,
      lock: { body: document.body, cursor: 'crosshair' },
      onMove: (ev) => {
        // 動きは、イベントごとに最新の座標で計算し、プレビューの描き直しは、1 フレームに 1 回
        const consumed = apply(
          { type: 'move', pointerId: ev.pointerId, point: latest.current.toCanvas({ x: ev.clientX, y: ev.clientY }) },
          false,
        )
        if (stateRef.current.kind === 'dragging') s.requestFrame()
        return consumed
      },
      onFrame: () => setPreview(previewRect(stateRef.current)),
      onUp: (ev) => {
        sessionRef.current = null
        // 離した座標で、置く四角を決める(最後の pointermove ではなく)
        apply({
          type: 'up',
          pointerId: ev.pointerId,
          button: 0,
          point: latest.current.toCanvas({ x: ev.clientX, y: ev.clientY }),
        })
      },
      onCancel: (reason) => {
        sessionRef.current = null
        if (reason === 'escape') {
          // Esc: 途中のドラッグを捨てる。道具を「選択」に戻す onCancel は、下の window の keydown(Esc)が呼ぶ(二重に呼ばない)
          stateRef.current = DRAW_IDLE
          setPreview(null)
        } else {
          apply({ type: 'cancel', pointerId })
        }
      },
    })
    s.engage()
    sessionRef.current = s
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const consumed = apply({
      type: 'down',
      pointerId: e.pointerId,
      button: e.button,
      isPrimary: e.isPrimary,
      point: point(e),
    })
    if (!consumed) return
    // ドラッグが層の外に出ても、離しが層に届くように捕捉する(動きと離しは、window でも受ける)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    e.stopPropagation()
    e.preventDefault()
    startSession(e.pointerId)
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
    >
      {preview && (
        <div
          aria-hidden="true"
          data-section-draw-preview=""
          className="pointer-events-none absolute border-dashed"
          style={{
            // 層の左上が、親の原点から HUGE だけ左上にあるので、HUGE を足して、親の座標に合わせる
            left: preview.x + offsetX + HUGE,
            top: preview.y + offsetY + HUGE,
            width: preview.width,
            height: preview.height,
            borderWidth: lineWidth,
            // 新しいセクションの既定の色(赤 #FF0004)の、破線の枠と 20% の塗り。置いたあとの見た目と同じ
            borderColor: style.line,
            backgroundColor: style.fill,
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
