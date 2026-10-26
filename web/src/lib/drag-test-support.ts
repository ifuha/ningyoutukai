// ドラッグのテスト用の、偽のイベント受け手・フレーム・イベント(drag-session / カード / セクションの移動のテストが共有する)
// アプリの本体からは import されない(テストだけが使う)
import type { DragPointer, DragTarget, FrameScheduler } from '#/lib/drag-session'

/** 偽の受け手(window の代わり)。リスナーの数と、イベントの配送(キャプチャ指定を含む)を、そのまま見られる */
export class FakeTarget implements DragTarget {
  private listeners = new Map<string, Set<(e: any) => void>>()
  addEventListener(type: string, listener: (e: any) => void, options?: boolean | { capture?: boolean }) {
    const key = `${type}:${typeof options === 'object' && options.capture ? 'capture' : 'bubble'}`
    if (!this.listeners.has(key)) this.listeners.set(key, new Set())
    this.listeners.get(key)!.add(listener)
  }
  removeEventListener(type: string, listener: (e: any) => void, options?: boolean | { capture?: boolean }) {
    const key = `${type}:${typeof options === 'object' && options.capture ? 'capture' : 'bubble'}`
    this.listeners.get(key)?.delete(listener)
  }
  /** いま付いているリスナーの数(終わったあとに 0 に戻ることの確認に使う) */
  get count() {
    let n = 0
    for (const set of this.listeners.values()) n += set.size
    return n
  }
  dispatch(type: string, event: object) {
    for (const [key, set] of this.listeners) {
      if (!key.startsWith(`${type}:`)) continue
      for (const l of [...set]) l(event)
    }
  }
}

export type FakeEvent = DragPointer & { stopped: boolean; prevented: boolean }

/** ポインタのイベント(座標つき)。`stopped` / `prevented` で、止められたかを見る */
export function pointerEvent(pointerId: number, x: number, y: number): FakeEvent {
  const e: FakeEvent = {
    pointerId,
    clientX: x,
    clientY: y,
    stopped: false,
    prevented: false,
    stopPropagation() {
      e.stopped = true
    },
    preventDefault() {
      e.prevented = true
    },
  }
  return e
}

/** 手で進める、フレームの仕組み */
export class FakeScheduler implements FrameScheduler {
  private next = 1
  readonly pending = new Map<number, () => void>()
  request(cb: () => void) {
    const id = this.next++
    this.pending.set(id, cb)
    return id
  }
  cancel(id: number) {
    this.pending.delete(id)
  }
  /** 予約された処理を、すべて実行する(1 フレーム進める) */
  flush() {
    const cbs = [...this.pending.values()]
    this.pending.clear()
    for (const cb of cbs) cb()
  }
}

/** ドラッグ中の固定の対象(document.body の代わり) */
export function fakeBody() {
  return { style: { userSelect: 'auto', cursor: 'default' } }
}
