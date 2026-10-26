import { clampCardPosition, pickSectionForCard } from '#/lib/section-edit-geometry'
import type { PickableSection, Point, Rect } from '#/lib/section-edit-geometry'

// メンバーのカードを、ドラッグで動かす(リーダーのみ)。位置と、所属するセクションの判定を返す(画面への反映と api 呼び出しは、呼び出し側)
//
// このファイルの前半は、DOM と React に依存しない状態機械(cardDragReducer)。後半は、それを呼ぶ薄いフック(useCardDrag)
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
