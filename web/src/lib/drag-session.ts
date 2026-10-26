// ドラッグの「1 回の操作(押してから離すまで)」の、共通の仕組み(F1 セクション画面。カード・セクション・描く層が使う)
//
// 速くマウスを動かすと、ポインタが、押した要素の外へ出る。要素のイベントで動きを受けていると、そのとき動きが届かず、
// ドラッグが始まらない・途切れる・キャンバスのパンに奪われる、というズレになる。そこで、押した瞬間から離すまで、
// **window で**動き(pointermove)・離し(pointerup)・取り消し(pointercancel)を受ける。要素の外でも、画面の外へ出ても届く。
//
// - 動きは、キャプチャ段階で受ける(キャンバスのパンなど、要素の側の処理より先に見る)。`onMove` が true を返したら、
//   その動きを止める(stopPropagation)。パンが始まらない。離し・取り消しは止めない(パンの側が、ポインタの記録を片付けるため)
// - 見た目の更新は、`requestFrame()` で 1 フレームに 1 回にまとめる(`onFrame`)。計算は、イベントごとに最新の座標で行う
// - 終わったら(離す・取り消す・Esc・window が非アクティブ・`end()`)、リスナーを必ず外す。`end()` は、何度呼んでも安全
// - ドラッグが確定したら(`engage()`)、テキストの選択を防ぎ、カーソルを固定する(`lock`)。終わったら元に戻す
//   (押しただけの間=クリックかもしれない間は、固定しない。カードの中のボタンの見た目などを変えないため)
// - 別のポインタの押し(2 本目の指)は、`onOtherPointerDown` に知らせる(ピンチに譲るか、無視するかは、呼び出し側が決める)
//
// DOM に依存しない形にしてある(イベントの受け手 `target`、フレームの `scheduler`、`lock` を、引数で受ける)。テストで、偽のものを渡す

/** イベントの受け手(通常は window)。テストでは、偽のものを渡す */
export type DragTarget = {
  addEventListener(type: string, listener: (event: any) => void, options?: boolean | { capture?: boolean }): void
  removeEventListener(type: string, listener: (event: any) => void, options?: boolean | { capture?: boolean }): void
}

/** ドラッグの計算に使う、ポインタのイベントの最小の形 */
export type DragPointer = {
  pointerId: number
  clientX: number
  clientY: number
  stopPropagation(): void
  preventDefault(): void
}

/** 1 フレームに 1 回の処理を予約する仕組み(通常は requestAnimationFrame) */
export type FrameScheduler = {
  request(callback: () => void): number
  cancel(id: number): void
}

/** ドラッグ中に、テキストの選択を防ぎ、カーソルを固定する対象(通常は document.body) */
export type DragLock = {
  body: { style: { userSelect: string; cursor: string } }
  cursor: string
}

export type DragCancelReason = 'pointercancel' | 'escape' | 'blur'

export type DragSessionOptions = {
  target: DragTarget
  /** この操作のポインタ。ほかのポインタの動きは、この操作には使わない */
  pointerId: number
  /** 動き。true を返すと、その動きを止める(キャンバスのパンなどに渡さない) */
  onMove: (event: DragPointer) => boolean | void
  /** 離したとき。リスナーを外したあとに呼ぶ(ここで、新しい操作を始めてもよい)。座標は、離したイベントのもの */
  onUp: (event: DragPointer) => void
  /** 取り消されたとき(pointercancel、Esc、window が非アクティブ)。リスナーを外したあとに呼ぶ */
  onCancel: (reason: DragCancelReason) => void
  /** `requestFrame()` で予約した処理。1 フレームに 1 回 */
  onFrame?: () => void
  /** 別のポインタが押されたとき(2 本目の指など)。true を返すと、その押しを止める */
  onOtherPointerDown?: (event: DragPointer) => boolean | void
  scheduler?: FrameScheduler
  lock?: DragLock
}

export type DragSession = {
  /** まだ続いているか(離す・取り消す・`end()` のあとは false) */
  readonly active: boolean
  /** ドラッグが確定した(クリックではない)。`lock` があれば、テキストの選択を防ぎ、カーソルを固定する。何度呼んでもよい */
  engage(): void
  /** 見た目の更新を、次のフレームに 1 回だけ予約する(すでに予約があれば、何もしない) */
  requestFrame(): void
  /** 何も呼ばずに終わる(リスナーを外し、予約したフレームを取り消し、`lock` を戻す)。何度呼んでもよい */
  end(): void
}

/** 既定のフレームの仕組み。requestAnimationFrame が無いとき(テスト・サーバー側)は、setTimeout で代える */
export function defaultScheduler(): FrameScheduler {
  const g = globalThis as {
    requestAnimationFrame?: (cb: () => void) => number
    cancelAnimationFrame?: (id: number) => void
  }
  if (typeof g.requestAnimationFrame === 'function' && typeof g.cancelAnimationFrame === 'function') {
    return {
      request: (cb) => g.requestAnimationFrame!(cb),
      cancel: (id) => g.cancelAnimationFrame!(id),
    }
  }
  return {
    request: (cb) => setTimeout(cb, 16) as unknown as number,
    cancel: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
  }
}

const CAPTURE = { capture: true } as const

export function startDragSession(options: DragSessionOptions): DragSession {
  const { target, pointerId } = options
  const scheduler = options.scheduler ?? defaultScheduler()
  let active = true
  let frameId: number | null = null

  // ドラッグが確定してからの、テキストの選択とカーソルの固定(元の値を覚えておき、終わったら戻す)
  const lock = options.lock
  let saved: { userSelect: string; cursor: string } | null = null

  const onPointerMove = (e: DragPointer) => {
    if (!active || e.pointerId !== pointerId) return
    if (options.onMove(e)) {
      e.stopPropagation()
      e.preventDefault()
    }
  }
  const onPointerUp = (e: DragPointer) => {
    if (!active || e.pointerId !== pointerId) return
    finish()
    options.onUp(e)
  }
  const onPointerCancel = (e: DragPointer) => {
    if (!active || e.pointerId !== pointerId) return
    finish()
    options.onCancel('pointercancel')
  }
  const onPointerDown = (e: DragPointer) => {
    if (!active || e.pointerId === pointerId) return
    if (options.onOtherPointerDown?.(e)) e.stopPropagation()
  }
  const onKeyDown = (e: { key: string }) => {
    if (!active || e.key !== 'Escape') return
    finish()
    options.onCancel('escape')
  }
  // window が非アクティブになったら(別のウィンドウへ移った、など)、離しが届かないので、取り消す
  const onBlur = () => {
    if (!active) return
    finish()
    options.onCancel('blur')
  }

  function finish() {
    if (!active) return
    active = false
    if (frameId !== null) {
      scheduler.cancel(frameId)
      frameId = null
    }
    target.removeEventListener('pointermove', onPointerMove, CAPTURE)
    target.removeEventListener('pointerup', onPointerUp, CAPTURE)
    target.removeEventListener('pointercancel', onPointerCancel, CAPTURE)
    target.removeEventListener('pointerdown', onPointerDown, CAPTURE)
    target.removeEventListener('keydown', onKeyDown, CAPTURE)
    target.removeEventListener('blur', onBlur)
    if (lock && saved) {
      lock.body.style.userSelect = saved.userSelect
      lock.body.style.cursor = saved.cursor
      saved = null
    }
  }

  target.addEventListener('pointermove', onPointerMove, CAPTURE)
  target.addEventListener('pointerup', onPointerUp, CAPTURE)
  target.addEventListener('pointercancel', onPointerCancel, CAPTURE)
  target.addEventListener('pointerdown', onPointerDown, CAPTURE)
  target.addEventListener('keydown', onKeyDown, CAPTURE)
  target.addEventListener('blur', onBlur)

  return {
    get active() {
      return active
    },
    engage() {
      if (!active || !lock || saved) return
      saved = { userSelect: lock.body.style.userSelect, cursor: lock.body.style.cursor }
      lock.body.style.userSelect = 'none'
      lock.body.style.cursor = lock.cursor
    },
    requestFrame() {
      if (!active || frameId !== null) return
      frameId = scheduler.request(() => {
        frameId = null
        if (active) options.onFrame?.()
      })
    },
    end: finish,
  }
}
