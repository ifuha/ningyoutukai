import { rectFromPoints } from '#/lib/canvas-selection'
import {
  startDragSession,
  type DragCancelReason,
  type DragLock,
  type DragSession,
  type DragSessionOptions,
  type DragTarget,
  type FrameScheduler,
} from '#/lib/drag-session'
import type { Point, Rect } from '#/lib/section-edit-geometry'

// 範囲選択(背景のドラッグ)の、1 回の操作(押してから離すまで)の制御部。React に依存しない。
// - 押しただけ(4px 未満)は、クリック。範囲選択を始めない(選択は、押した時点で、呼び出し側が決める)
// - 4px を超えて動いたら、範囲選択を始める。動きは 1 フレームに 1 回だけ知らせる(`onLive`)
// - 離したら、最後の四角で確定する(`onCommit`)。範囲選択のあとの click は捨てる(`suppressClick`)
// - Esc は、範囲選択を取り消し(`onCancel`)、ポインタが離れるまで動きを呑み込む。離したときの click は捨てる
// - `pointercancel`・window が非アクティブは、何も確定せずに取りやめる(選択は、押す前の状態に戻す)
// 動き・離し・取り消しは、押した瞬間から window で受ける(`drag-session.ts`)。要素の外へ出ても追従する

/** 画面で、これ以上(px)動かしたら、範囲選択と見なす。カードのドラッグと同じ 4px */
export const MARQUEE_THRESHOLD = 4

/** 押したときの、ポインタの位置。`additive` は Shift を押しているか */
export type MarqueeStart = {
  pointerId: number
  clientX: number
  clientY: number
  additive: boolean
}

export type MarqueeControllerOptions = {
  /** 動きを受ける対象。省略すると window(サーバー側の描画では呼ばれない) */
  getTarget: () => DragTarget
  /** ドラッグ中の、テキストの選択とカーソルの固定。省略可 */
  getLock?: () => DragLock | undefined
  /** 画面の座標を、キャンバス座標にする */
  toCanvas: (client: Point) => Point
  /** 範囲選択の四角が変わった(1 フレームに 1 回) */
  onLive?: (rect: Rect, additive: boolean) => void
  /** 離した(確定)。四角は、離した位置で決める */
  onCommit: (rect: Rect, additive: boolean) => void
  /** 取りやめた(Esc・pointercancel・window が非アクティブ・`cancel()`)。押す前の選択に戻す */
  onCancel?: () => void
  /** 範囲選択が始まった(true)・終わった(false)。Esc の優先順位に使う。押しただけの間は、true にしない */
  onActive?: (active: boolean) => void
  /** 範囲選択のあとに来る click を、1 回だけ捨てる */
  suppressClick: () => void
  /** テスト用: 押した瞬間から離すまでの仕組みを差し替える。省略すると `startDragSession` */
  startSession?: (options: DragSessionOptions) => DragSession
  scheduler?: FrameScheduler
}

export type MarqueeController = {
  start(event: MarqueeStart): void
  /** いまの範囲選択を、確定せずに取りやめる(Esc の処理から呼ばれたときなど) */
  cancel(): void
  /** 押してから離すまでが続いているか(取りやめたあと、離すまで呑み込んでいる間も true) */
  isActive(): boolean
  /** 画面から消えるとき。何も呼ばずに終わる */
  dispose(): void
}

export function createMarqueeController(options: MarqueeControllerOptions): MarqueeController {
  const startSession = options.startSession ?? startDragSession
  let session: DragSession | null = null
  let startClient: Point | null = null
  let startCanvas: Point | null = null
  let latest: Rect | null = null
  let additive = false
  let engaged = false

  const finish = () => {
    session = null
    startClient = null
    startCanvas = null
    latest = null
    additive = false
    engaged = false
  }

  const endActive = () => {
    if (!engaged) return
    engaged = false
    options.onActive?.(false)
  }

  const rectAt = (client: Point): Rect | null => {
    if (!startCanvas) return null
    return rectFromPoints(startCanvas, options.toCanvas(client))
  }

  // Esc のあと、ポインタが離れるまで動きを呑み込む(パンが途中から始まらないように)。離したら click を捨てる
  const swallowUntilRelease = (pointerId: number) => {
    const s = startSession({
      target: options.getTarget(),
      pointerId,
      scheduler: options.scheduler,
      onMove: () => true,
      onUp: () => {
        session = null
        options.suppressClick()
      },
      onCancel: () => {
        session = null
      },
    })
    session = s
  }

  return {
    start(event) {
      // 前の操作が残っていたら(離しが届かなかったなど)、何も呼ばずに捨てる
      session?.end()
      endActive()
      finish()

      startClient = { x: event.clientX, y: event.clientY }
      startCanvas = options.toCanvas(startClient)
      additive = event.additive

      const s = startSession({
        target: options.getTarget(),
        pointerId: event.pointerId,
        scheduler: options.scheduler,
        lock: options.getLock?.(),
        onMove: (e) => {
          const dy = e.clientY - (startClient?.y ?? e.clientY)
          const dx = e.clientX - (startClient?.x ?? e.clientX)
          if (!engaged && Math.hypot(dx, dy) < MARQUEE_THRESHOLD) return true
          if (!engaged) {
            engaged = true
            s.engage()
            options.onActive?.(true)
          }
          latest = rectAt({ x: e.clientX, y: e.clientY })
          s.requestFrame()
          return true
        },
        onFrame: () => {
          if (!engaged || !latest) return
          options.onLive?.(latest, additive)
        },
        onUp: (e) => {
          const wasEngaged = engaged
          const wasAdditive = additive
          const rect = rectAt({ x: e.clientX, y: e.clientY })
          finish()
          session = null
          if (!wasEngaged) {
            // 押しただけ(クリック)。範囲選択はしていないので、click は捨てない
            return
          }
          options.onActive?.(false)
          options.suppressClick()
          if (rect) options.onCommit(rect, wasAdditive)
        },
        onCancel: (reason: DragCancelReason) => {
          const wasEngaged = engaged
          finish()
          session = null
          if (wasEngaged) {
            options.onActive?.(false)
            options.onCancel?.()
          }
          if (reason === 'escape' && wasEngaged) swallowUntilRelease(event.pointerId)
        },
      })
      session = s
    },

    cancel() {
      if (!session) return
      const wasEngaged = engaged
      session.end()
      finish()
      if (wasEngaged) {
        options.onActive?.(false)
        options.onCancel?.()
      }
    },

    isActive: () => session !== null,

    dispose() {
      session?.end()
      finish()
    },
  }
}
