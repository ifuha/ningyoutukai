import { useEffect, useRef, useState } from 'react'
import type { ConnectorFollower } from '#/lib/connector-follow'
import type { PointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { startDragSession } from '#/lib/drag-session'
import type { DragLock, DragSession, DragTarget, FrameScheduler } from '#/lib/drag-session'
import { clampCardPosition, pickSectionForCard } from '#/lib/section-edit-geometry'
import type { PickableSection, Point, Rect } from '#/lib/section-edit-geometry'

// メンバーのカードを、ドラッグで動かす(リーダーのみ)。位置と、所属するセクションの判定を返す(画面への反映と api 呼び出しは、呼び出し側)
//
// このファイルは、3 つの層からなる。
//   1. 状態機械(cardDragReducer): DOM と React に依存しない純粋な関数
//   2. 制御部(createCardDragController): 状態機械と、window で動きを受ける仕組み(drag-session)をつなぐ。React に依存しない
//      (受け手・固定の対象・フレームを引数で受けるので、偽のイベントでテストできる)
//   3. フック(useCardDrag): 制御部を作って、React の状態(ドラッグの見え方)につなぐ薄い層
// フックは、押した瞬間から離すまで、window で動きを受ける(`drag-session.ts`)。速く動かして、カードの外へ出ても追従する。
// ドラッグ中の見た目は、React の状態を経由せず、影のカードの transform を直接書く(1 フレームに 1 回)。
// React の状態を更新するのは、ドラッグの開始・終了と、ドロップ先のセクションが変わったときだけ(全体を、動かすたびに描き直さない)
// 座標はすべて「キャンバスの座標」。カードの位置は「カードの左上の座標」(セクションの x / y と同じ)
// 画面の座標(クライアント座標、px)の差分は、拡大率(scale)で割って、キャンバスの座標に換算する

// 画面で、これ以上(px)動かしたら、ドラッグと見なす。それまでは、クリックとして扱う(カードの中のボタンやリンクを壊さない)
export const CARD_DRAG_THRESHOLD = 4
// 動かさなかったと見なす位置の差(キャンバスの座標)
const SAME_POSITION_EPSILON = 0.5

export type CardDragState =
  | { phase: 'idle' }
  // 押された。まだ、しきい値を超えて動いていない(クリックかもしれない)
  | {
      phase: 'pending'
      memberId: string
      pointerId: number
      startClient: Point
      startRect: Rect
    }
  // ドラッグ中。position はカードの左上のキャンバス座標(座標の上限に収めた値)、hoverSectionId はいまの位置で入るセクション
  | {
      phase: 'dragging'
      memberId: string
      pointerId: number
      startClient: Point
      startRect: Rect
      position: Point
      hoverSectionId: string | null
    }
  // Esc などで取りやめた。ポインタが離されるまで、そのジェスチャーの動きを呑み込む(キャンバスのパンに渡さない)
  // confirmed: ドラッグが確定したあとに取りやめたか(離したときの click を抑止するかの判断)
  | { phase: 'aborted'; pointerId: number; confirmed: boolean }

export const CARD_DRAG_IDLE: CardDragState = { phase: 'idle' }

export type CardDragEvent =
  | {
      type: 'down'
      memberId: string
      pointerId: number
      pointerType: string
      button: number
      client: Point
      // カードの、いまのキャンバス上の位置と大きさ。取れない(null)ときは、ドラッグを始めない
      rect: Rect | null
      enabled: boolean
    }
  | {
      type: 'move' | 'up'
      pointerId: number
      client: Point
      scale: number
      sections: readonly PickableSection[]
    }
  | { type: 'cancel'; pointerId: number } // pointercancel
  | { type: 'escape' } // Esc、または、無効になった(enabled が false になった)

export type CardDragEffect = {
  // true のとき、このイベントを、キャンバス(パン)に伝えない(stopPropagation)
  consumed: boolean
  // いまのイベントで、ドラッグが確定した(ポインタをキャプチャする)
  started?: true
  // ポインタが離されて、位置が決まった。1 回のドラッグにつき、多くても 1 回
  drop?: { memberId: string; position: Point; sectionId: string | null }
  // ドラッグのあとに来る click を、抑止する(ボタンやリンクが、ドラッグの終わりに押されないように)
  suppressClick?: true
}

const NO_EFFECT: CardDragEffect = { consumed: false }

type Reduced = { state: CardDragState; effect: CardDragEffect }
const stay = (state: CardDragState, effect: CardDragEffect = NO_EFFECT): Reduced => ({
  state,
  effect,
})

// 開始時のカードの左上 + 画面の差分 / 拡大率。座標の上限に収める。scale が正の有限値でなければ 1 として扱う
function dragPosition(startRect: Rect, startClient: Point, client: Point, scale: number): Point {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  return clampCardPosition({
    x: startRect.x + (client.x - startClient.x) / s,
    y: startRect.y + (client.y - startClient.y) / s,
  })
}

// そのときの位置で入るセクション(カードの中心で判定)。どこにも入らなければ null
function sectionAt(
  position: Point,
  startRect: Rect,
  sections: readonly PickableSection[],
): string | null {
  return pickSectionForCard(
    { x: position.x, y: position.y, width: startRect.width, height: startRect.height },
    sections,
  )
}

function samePosition(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) <= SAME_POSITION_EPSILON && Math.abs(a.y - b.y) <= SAME_POSITION_EPSILON
}

// ドラッグの状態遷移(純粋関数)。次の状態と、呼び出し側がすること(effect)を返す
// - 押す: idle → pending。しきい値を超えて動いたら dragging(それまでは、クリック扱い)
// - dragging の間、位置と入るセクションを更新する。離したら、位置が変わっていれば drop を 1 回だけ返す
// - 動かさずに離した(pending のまま)ときは、何もしない(drop も click の抑止もしない)
// - Esc / pointercancel / 無効化では、drop を返さず、元に戻す(呼び出し側は、プレビューを捨てるだけ)
// - 別のポインタ(2 本目の指など)は、ドラッグの対象にしない。pending のうちに来たら取りやめ(ピンチに譲る)、
//   ドラッグ中に来たら、無視してキャンバスにも渡さない(ピンチが始まって、ドラッグと干渉しないように)
export function cardDragReducer(state: CardDragState, event: CardDragEvent): Reduced {
  switch (event.type) {
    case 'down': {
      // 別のポインタ(2 本目の指など)の押し。同じポインタの押しは、前のジェスチャーの終わり(up / cancel)が
      // 届かなかったものとして、新しいジェスチャーとして始める(マウスの pointerId は毎回同じなので、
      // 無視すると、ドラッグが二度と始まらなくなる)
      if (state.phase !== 'idle' && event.pointerId !== state.pointerId) {
        if (state.phase === 'pending') return stay(CARD_DRAG_IDLE)
        return stay(state, { consumed: true })
      }
      // 右クリックなど、主ボタン以外(マウスのみ)は無視
      if (event.pointerType === 'mouse' && event.button !== 0) return stay(state)
      if (!event.enabled || event.rect === null) return stay(state)
      return stay({
        phase: 'pending',
        memberId: event.memberId,
        pointerId: event.pointerId,
        startClient: event.client,
        startRect: event.rect,
      })
    }

    case 'move': {
      if (state.phase === 'idle' || event.pointerId !== state.pointerId) return stay(state)
      if (state.phase === 'aborted') return stay(state, { consumed: true })
      if (state.phase === 'pending') {
        const dx = event.client.x - state.startClient.x
        const dy = event.client.y - state.startClient.y
        if (Math.hypot(dx, dy) < CARD_DRAG_THRESHOLD) return stay(state)
      }
      const position = dragPosition(state.startRect, state.startClient, event.client, event.scale)
      const next: CardDragState = {
        phase: 'dragging',
        memberId: state.memberId,
        pointerId: state.pointerId,
        startClient: state.startClient,
        startRect: state.startRect,
        position,
        hoverSectionId: sectionAt(position, state.startRect, event.sections),
      }
      return stay(
        next,
        state.phase === 'pending' ? { consumed: true, started: true } : { consumed: true },
      )
    }

    case 'up': {
      if (state.phase === 'idle' || event.pointerId !== state.pointerId) return stay(state)
      // 離したイベントは、キャンバスにも渡す(パンの側が、ポインタの記録を片付けるため)
      if (state.phase === 'pending') return stay(CARD_DRAG_IDLE)
      if (state.phase === 'aborted') {
        return stay(CARD_DRAG_IDLE, state.confirmed ? { consumed: false, suppressClick: true } : NO_EFFECT)
      }
      const position = dragPosition(state.startRect, state.startClient, event.client, event.scale)
      // 動いたあとで、元の位置に戻して離した場合は、何も変えない
      if (samePosition(position, { x: state.startRect.x, y: state.startRect.y })) {
        return stay(CARD_DRAG_IDLE, { consumed: false, suppressClick: true })
      }
      return stay(CARD_DRAG_IDLE, {
        consumed: false,
        suppressClick: true,
        drop: {
          memberId: state.memberId,
          position,
          sectionId: sectionAt(position, state.startRect, event.sections),
        },
      })
    }

    case 'cancel': {
      if (state.phase === 'idle' || event.pointerId !== state.pointerId) return stay(state)
      return stay(CARD_DRAG_IDLE)
    }

    case 'escape': {
      if (state.phase === 'pending') {
        return stay({ phase: 'aborted', pointerId: state.pointerId, confirmed: false })
      }
      if (state.phase === 'dragging') {
        return stay({ phase: 'aborted', pointerId: state.pointerId, confirmed: true })
      }
      return stay(state)
    }
  }
}

// ドラッグのあとに来る click を、1 回だけ捨てる(カードの中のボタンやリンクが、ドラッグの終わりに押されないように)
// click は、離した(pointerup)のすぐあとに、同じタスクの中で届く。届かなかったときに備えて、少しあとで外す
function suppressNextClick() {
  if (typeof window === 'undefined') return
  const swallow = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}

export type UseCardDragOptions = {
  // リーダーのとき true。false なら、ハンドラは何もしない(キャンバスのパンなどの、既存の操作を妨げない)
  enabled: boolean
  // キャンバスの拡大率(画面の差分を、これで割ってキャンバスの座標にする)
  scale: number
  // 入るセクションの候補(位置と大きさは、キャンバスの座標)
  sections: readonly PickableSection[]
  // カードの、いまのキャンバス上の位置と大きさ(左上と実寸。高さはタスクの数で変わる)。取れなければ null
  getCardRect: (memberId: string) => Rect | null
  // ドラッグが終わって、位置が決まったとき(1 回のドラッグにつき、多くても 1 回)。position はカードの左上
  // sectionId は、その位置で入るセクション(どこにも入らなければ null=無所属)
  onDrop: (memberId: string, position: Point, sectionId: string | null) => void
  // ドラッグ中、親子の線(SVG)を、動くカードに追従させる部品を作る(ドラッグが確定したときに 1 回)。省略は、線を動かさない
  getConnectors?: (memberId: string) => ConnectorFollower | null
}

// カードの要素に付けるハンドラ。押したところだけ。動き・離し・取り消しは、押した瞬間から window で受ける(drag-session)
export type CardDragHandlers = {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void
}

// React の状態に持つ、ドラッグの見え方。動くたびには変わらない(開始・終了・ドロップ先の変化のときだけ)
export type DragView = {
  memberId: string
  // ドラッグを始めたときのカードの左上(影のカードの基準の位置。以降の動きは、transform で書く)
  origin: Point
  hoverSectionId: string | null
}

function viewOf(state: CardDragState): DragView | null {
  return state.phase === 'dragging'
    ? {
        memberId: state.memberId,
        origin: { x: state.startRect.x, y: state.startRect.y },
        hoverSectionId: state.hoverSectionId,
      }
    : null
}

function sameView(a: DragView | null, b: DragView | null): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return a.memberId === b.memberId && a.hoverSectionId === b.hoverSectionId
}

/** 影のカードの要素の、最小の形(transform だけ書く) */
export type GhostElement = { style: { transform: string } }

/** カードの要素に付けた onPointerDown が受ける、イベントの最小の形 */
export type CardPointerDown = {
  pointerId: number
  pointerType: string
  button: number
  isPrimary: boolean
  clientX: number
  clientY: number
  currentTarget: { setPointerCapture(pointerId: number): void }
  stopPropagation(): void
}

export type CardDragControllerDeps = {
  /** 動きを受ける対象。押した時点で読む(サーバー側の描画で、window を触らないため) */
  getTarget: () => DragTarget
  /** ドラッグ中の、テキストの選択とカーソルの固定の対象。省略可 */
  getLock?: () => DragLock | undefined
  getOptions: () => UseCardDragOptions
  /** ドラッグ中、親子の線(SVG)を、動くカードに追従させる部品を作る(ドラッグが確定したときに 1 回)。省略可 */
  getConnectors?: (memberId: string) => ConnectorFollower | null
  /** ドラッグの見え方(開始・終了・ドロップ先の変化)を、React に伝える */
  onView: (view: DragView | null) => void
  /** 離したときの、見え方の消去と、楽観更新を、同時に反映する(通常は flushSync) */
  batch: (fn: () => void) => void
  suppressClick: () => void
  scheduler?: FrameScheduler
}

export type CardDragController = {
  pointerDown(memberId: string, e: CardPointerDown): void
  /** 影のカードの要素。出てきた瞬間に、最新の位置を書く */
  setGhost(el: GhostElement | null): void
  /** 使えなくなったとき(リーダーでなくなったなど)に、途中のドラッグを取りやめる */
  disable(): void
  /** 画面から消えるとき */
  dispose(): void
  /** テスト用: いまの状態 */
  getState(): CardDragState
}

// 状態機械(cardDragReducer)と、window で動きを受ける仕組み(drag-session)をつなぐ。React に依存しない
// - 押す: 状態機械に渡し、待機中(pending)になったら、押した瞬間から離すまでの操作を始める(window で受ける)
// - 動き: 状態機械に渡す。ドラッグが確定したら、固定(user-select・カーソル)と、カードの捕捉。見た目は、1 フレームに 1 回、影の transform に書く
// - 離し: 離した座標で、最終の位置を決める。見え方の消去と onDrop(楽観更新)を、同時に反映する
// - Esc・取りやめ: 離すまで、動きを呑み込む(パンが途中から始まらないように)。離したら、ドラッグしていたときだけ click を抑止する
export function createCardDragController(deps: CardDragControllerDeps): CardDragController {
  let state: CardDragState = CARD_DRAG_IDLE
  let view: DragView | null = null
  let session: DragSession | null = null
  let ghost: GhostElement | null = null
  // 影のカードの位置(カードの左上のキャンバス座標)。動くたびに更新し、1 フレームに 1 回、transform に書く
  let position: Point | null = null
  let origin: Point | null = null
  // 親子の線(SVG)を、影のカードに追従させる部品。ドラッグが確定してから、終わるまで
  let connectors: ConnectorFollower | null = null

  const writeGhost = () => {
    if (!position || !origin) return
    connectors?.apply(position.x - origin.x, position.y - origin.y)
    if (!ghost) return
    ghost.style.transform = `translate(${position.x - origin.x}px, ${position.y - origin.y}px)`
  }

  // 事象を状態機械に渡し、副作用(見え方、drop、click の抑止)を実行する
  const run = (event: CardDragEvent): CardDragEffect => {
    const { state: next, effect } = cardDragReducer(state, event)
    state = next
    if (next.phase === 'dragging') {
      position = next.position
      origin = { x: next.startRect.x, y: next.startRect.y }
    }
    // ドラッグが確定したら線の部品を作り、ドラッグでなくなったら片付ける(落とした = 確定なら、線は戻さない)
    if (effect.started && next.phase === 'dragging') connectors = deps.getConnectors?.(next.memberId) ?? null
    if (next.phase !== 'dragging' && connectors) {
      connectors.finish(Boolean(effect.drop))
      connectors = null
    }
    const nextView = viewOf(next)
    if (!sameView(view, nextView)) {
      view = nextView
      deps.onView(nextView)
    }
    if (effect.drop) deps.getOptions().onDrop(effect.drop.memberId, effect.drop.position, effect.drop.sectionId)
    if (effect.suppressClick) deps.suppressClick()
    return effect
  }

  const abortGesture = (pointerId: number) => {
    run({ type: 'escape' })
    session = startDragSession({
      target: deps.getTarget(),
      pointerId,
      scheduler: deps.scheduler,
      onMove: () => true,
      onUp: () => {
        session = null
        run({ type: 'up', pointerId, client: { x: 0, y: 0 }, scale: 1, sections: [] })
      },
      onCancel: () => {
        session = null
        run({ type: 'cancel', pointerId })
      },
    })
  }

  const startSession = (pointerId: number, card: CardPointerDown['currentTarget']) => {
    session?.end()
    const s: DragSession = startDragSession({
      target: deps.getTarget(),
      pointerId,
      scheduler: deps.scheduler,
      lock: deps.getLock?.(),
      onMove: (e) => {
        const o = deps.getOptions()
        const effect = run({
          type: 'move',
          pointerId: e.pointerId,
          client: { x: e.clientX, y: e.clientY },
          scale: o.scale,
          sections: o.sections,
        })
        if (effect.started) {
          // ドラッグが確定した。テキストの選択を防ぎ、離しがカードに届くよう捕捉する(先にすると、カードの中のボタンへの click が届かない)
          s.engage()
          try {
            card.setPointerCapture(pointerId)
          } catch {
            // すでに離れたポインタなど。window で受けているので、ドラッグ自体は続けられる
          }
        }
        if (state.phase === 'dragging') s.requestFrame()
        return effect.consumed
      },
      onFrame: writeGhost,
      onUp: (e) => {
        session = null
        const o = deps.getOptions()
        // 離したときの座標で、最終の位置を決める(最後の pointermove ではなく)
        deps.batch(() => {
          run({
            type: 'up',
            pointerId: e.pointerId,
            client: { x: e.clientX, y: e.clientY },
            scale: o.scale,
            sections: o.sections,
          })
        })
      },
      onCancel: (reason) => {
        session = null
        if (reason === 'escape') abortGesture(pointerId)
        else run({ type: 'cancel', pointerId })
      },
      // 2 本目の指: 確定前なら取りやめ(ピンチに譲る)。ドラッグ中なら、無視して、パンにも渡さない
      onOtherPointerDown: () => {
        if (state.phase === 'pending') {
          s.end()
          session = null
          run({ type: 'cancel', pointerId })
          return false
        }
        return state.phase === 'dragging'
      },
    })
    session = s
  }

  return {
    pointerDown(memberId, e) {
      // 2 本目以降の指は、ドラッグを始めない(ピンチに譲る)。マウスは、いつも主のポインタ
      if (!e.isPrimary) return
      const o = deps.getOptions()
      const effect = run({
        type: 'down',
        memberId,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        button: e.button,
        client: { x: e.clientX, y: e.clientY },
        rect: o.enabled ? o.getCardRect(memberId) : null,
        enabled: o.enabled,
      })
      if (state.phase === 'pending') startSession(e.pointerId, e.currentTarget)
      if (effect.consumed) e.stopPropagation()
    },
    setGhost(el) {
      ghost = el
      if (el) writeGhost()
    },
    disable() {
      if (state.phase === 'idle') return
      session?.end()
      abortGesture(state.pointerId)
    },
    dispose() {
      session?.end()
      session = null
    },
    getState: () => state,
  }
}

// カードのドラッグ(リーダーのみ)。制御部(createCardDragController)を、React の状態につなぐフック
// 使い方: カードの要素に `{...getDragHandlers(memberId)}` を付ける。その要素には `touch-action: none` を付ける(タッチで、
//   ブラウザのスクロールに奪われて pointercancel にならないように)。ドラッグ中は、`draggingId` のカードの影を、
//   `previewPosition`(影の基準の位置)に描き、影の要素に `ghostRef` を付ける(動きは、その要素の transform に直接書かれる)。
//   `hoverSectionId` のセクションをドロップ先として強調する。元の位置の表示は、呼び出し側が決める(このフックは、位置を動かさない)
// 押したときは、イベントを止めない(キャンバスのパンの側にも記録させる)。ドラッグが確定したあとの動きは、window のキャプチャ段階で
//   止めて、パンが始まらないようにする。離しは止めない(パンの側が、ポインタの記録を片付けるため)
export function useCardDrag(options: UseCardDragOptions) {
  const [view, setView] = useState<DragView | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options
  const controllerRef = useRef<CardDragController | null>(null)
  if (controllerRef.current === null) {
    controllerRef.current = createCardDragController({
      getTarget: () => window as unknown as DragTarget,
      getLock: () => ({ body: document.body, cursor: 'grabbing' }),
      getOptions: () => optionsRef.current,
      getConnectors: (memberId) => optionsRef.current.getConnectors?.(memberId) ?? null,
      onView: setView,
      batch: (fn) => flushSync(fn),
      suppressClick: suppressNextClick,
    })
  }
  const controller = controllerRef.current

  // ドラッグの途中で、使えなくなったら(リーダーでなくなったなど)、取りやめる
  useEffect(() => {
    if (!options.enabled) controller.disable()
  }, [options.enabled, controller])

  // 画面から消えるとき、続いている操作のリスナーを外す
  useEffect(() => () => controller.dispose(), [controller])

  const getDragHandlers = (memberId: string): CardDragHandlers => ({
    onPointerDown: (e) => controller.pointerDown(memberId, e),
  })

  return {
    draggingId: view ? view.memberId : null,
    // 影のカードの基準の位置(ドラッグを始めたときのカードの左上)。動きは、`ghostRef` の要素の transform に書かれる
    previewPosition: view ? view.origin : null,
    hoverSectionId: view ? view.hoverSectionId : null,
    getDragHandlers,
    ghostRef: controller.setGhost as (el: HTMLElement | null) => void,
  }
}
