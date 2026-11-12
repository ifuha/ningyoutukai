import { createFollower } from '#/lib/drag-follow'
import type { FollowElement, Follower } from '#/lib/drag-follow'
import { startDragSession } from '#/lib/drag-session'
import type { DragLock, DragSession, DragTarget, FrameScheduler } from '#/lib/drag-session'
import type { ConnectorFollower } from '#/lib/connector-follow'
import type { Point } from '#/lib/section-edit-geometry'

// 選択したものを、まとめて動かすドラッグの制御部(React に依存しない)
//
// カード・セクション・メモの単体のドラッグと同じく、押した瞬間から離すまで window で動きを受ける。
// 4px を超えるまではクリック(選択だけ)。超えたら、選択したもの(と、セクションと一緒に動くカード)を transform で追従させる。
// 確定(離す)で、`onCommit` が楽観更新して、新しい位置になったら transform を戻す。Esc・pointercancel では取り消す。
// 単体のドラッグとの違い: 押したものだけでなく、選択の全部を、同じ差分だけ動かす(所属は変えない)

/** 画面で、これ以上(px)動かしたら、まとめて動かすドラッグと見なす(単体のカードと同じ) */
export const SELECTION_DRAG_THRESHOLD = 4

export type SelectionDragPointerDown = {
  pointerId: number
  clientX: number
  clientY: number
  currentTarget: { setPointerCapture(pointerId: number): void }
}

export type SelectionDragDeps = {
  /** 動きを受ける対象。押した時点で読む */
  getTarget: () => DragTarget
  /** ドラッグ中の、テキストの選択とカーソルの固定の対象。省略可 */
  getLock?: (cursor: string) => DragLock | undefined
  getScale: () => number
  /** 一緒に動かす要素(しきい値を超えたときに 1 回だけ集める) */
  getFollowers: () => FollowElement[]
  /** 親子の線を追従させる部品。省略可 */
  getConnectors?: () => ConnectorFollower | null
  /** 座標の上限に収める(選択の全項目の位置から、共通の差分を返す) */
  clampDelta: (delta: Point) => Point
  /** 離したときの、見た目の更新と確定を、同時に反映する(通常は flushSync) */
  batch: (fn: () => void) => void
  /** 確定した差分(1 回のドラッグにつき、多くても 1 回。動かなかったら呼ばない) */
  onCommit: (delta: Point) => void
  /** ドラッグが確定した・終わった(Esc の優先順位とカーソルに使う。動くたびには呼ばない) */
  onActive: (active: boolean) => void
  scheduler?: FrameScheduler
}

export type SelectionDragController = {
  start(e: SelectionDragPointerDown): void
  /** 何も確定せずに取りやめる(使えなくなったとき) */
  cancel(): void
  /** 続いているドラッグがあるか(押した直後を含む) */
  isActive(): boolean
  /** いまの Esc が、ドラッグの取り消しに使われたか(1 回だけ true) */
  takeEscape(): boolean
  dispose(): void
}

function suppressNextClick() {
  if (typeof window === 'undefined') return
  const swallow = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}

export function createSelectionDragController(
  deps: SelectionDragDeps,
): SelectionDragController {
  let session: DragSession | null = null
  let start: Point | null = null
  let pointerId: number | null = null
  let engaged = false
  let follower: Follower | null = null
  let connectors: ConnectorFollower | null = null
  let delta: Point = { x: 0, y: 0 }
  let escaped = false

  const cleanup = () => {
    follower?.reset()
    follower = null
    connectors?.finish(false)
    connectors = null
    deps.onActive(false)
    engaged = false
    start = null
    pointerId = null
    delta = { x: 0, y: 0 }
  }

  const deltaAt = (e: { clientX: number; clientY: number }): Point => {
    if (!start) return { x: 0, y: 0 }
    const scale = deps.getScale() || 1
    return deps.clampDelta({
      x: (e.clientX - start.x) / scale,
      y: (e.clientY - start.y) / scale,
    })
  }

  const startDrag: SelectionDragController['start'] = (e) => {
    session?.end()
    session = null
    follower?.reset()
    follower = null
    connectors?.finish(false)
    connectors = null
    engaged = false
    start = { x: e.clientX, y: e.clientY }
    pointerId = e.pointerId
    delta = { x: 0, y: 0 }
    // React のイベントは、ハンドラを抜けると currentTarget が null になる。要素は、押した時点で覚えておく
    const currentTarget = e.currentTarget

    const s: DragSession = startDragSession({
      target: deps.getTarget(),
      pointerId: e.pointerId,
      scheduler: deps.scheduler,
      lock: deps.getLock?.('grabbing'),
      onMove: (ev) => {
        const next = deltaAt(ev)
        if (!engaged) {
          const moved = Math.hypot(
            ev.clientX - start!.x,
            ev.clientY - start!.y,
          )
          if (moved < SELECTION_DRAG_THRESHOLD) return false
          engaged = true
          s.engage()
          try {
            currentTarget.setPointerCapture(ev.pointerId)
          } catch {
            // すでに離れたポインタなど。window で受けているので、ドラッグ自体は続けられる
          }
          follower = createFollower(deps.getFollowers())
          connectors = deps.getConnectors?.() ?? null
          deps.onActive(true)
        }
        delta = next
        s.requestFrame()
        // 確定したあとの動きは、パンに渡さない
        return true
      },
      onFrame: () => {
        follower?.apply(delta.x, delta.y)
        connectors?.apply(delta.x, delta.y)
      },
      onUp: (ev) => {
        session = null
        const final = engaged ? deltaAt(ev) : { x: 0, y: 0 }
        const committed = engaged && (final.x !== 0 || final.y !== 0)
        deps.batch(() => {
          if (committed) deps.onCommit(final)
          deps.onActive(false)
        })
        if (committed) suppressNextClick()
        follower?.reset()
        follower = null
        connectors?.finish(committed)
        connectors = null
        engaged = false
        start = null
        pointerId = null
        delta = { x: 0, y: 0 }
      },
      onCancel: (reason) => {
        session = null
        cleanup()
        if (reason === 'escape') {
          escaped = true
          setTimeout(() => {
            escaped = false
          }, 0)
        }
      },
      // 2 本目の指: 確定前なら取りやめ(ピンチに譲る)。ドラッグ中なら、無視して、パンにも渡さない
      onOtherPointerDown: () => {
        if (!engaged) {
          s.end()
          session = null
          cleanup()
          return false
        }
        return true
      },
    })
    session = s
  }

  return {
    start: startDrag,
    cancel() {
      session?.end()
      session = null
      cleanup()
    },
    isActive: () => pointerId !== null,
    takeEscape() {
      const was = escaped
      escaped = false
      return was
    },
    dispose() {
      session?.end()
      session = null
      follower?.reset()
      follower = null
      connectors?.finish(false)
      connectors = null
      deps.onActive(false)
      engaged = false
      start = null
      pointerId = null
      delta = { x: 0, y: 0 }
    },
  }
}
