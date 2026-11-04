import { rectFromDrag, type Point, type Rect } from '#/lib/section-edit-geometry'

// 「ドラッグでセクションを置く」操作の状態遷移(画面や DOM に依存しない純粋な関数)
// 座標はすべて「キャンバスの座標」。画面の座標からの変換(`toCanvas`)は、呼び出す側(部品)が行う
//
// 状態: 待機(idle) → 押した(dragging) → 離した(確定: create)/ 取り消し(cancel)
// 副作用(`onCreate` / `onCancel` を呼ぶこと)は、ここでは行わず、`effect` として返す。呼ぶ側が実行する
//   → 確定は、`up` を 1 回受けたときだけ。そのあとは待機に戻るので、`onCreate` は 1 回しか出ない

export type DrawState =
  | { kind: 'idle' }
  | { kind: 'dragging'; pointerId: number; start: Point; current: Point }

export const DRAW_IDLE: DrawState = { kind: 'idle' }

export type DrawEvent =
  // ポインタが押された。`button` は、マウスの主ボタンが 0(右クリックは 2)。`isPrimary` は、マルチタッチの 1 本目だけ true
  | { type: 'down'; pointerId: number; button: number; isPrimary: boolean; point: Point }
  | { type: 'move'; pointerId: number; point: Point }
  | { type: 'up'; pointerId: number; button: number; point: Point }
  // `pointercancel` と、ポインタのキャプチャが失われたとき(`lostpointercapture`)
  | { type: 'cancel'; pointerId: number }
  // Esc。ドラッグ中でなくても、取り消しを返す(置く道具から抜ける)
  | { type: 'escape' }
  // 外から道具が切られた(`active` が false になった)。何も呼ばずに待機に戻す
  | { type: 'reset' }

export type DrawEffect = { type: 'create'; rect: Rect } | { type: 'cancel' }

export type DrawStep = {
  state: DrawState
  /** 呼ぶ側が実行すること。なければ null */
  effect: DrawEffect | null
  /** この事象を、この層が受け取ったか(true なら、イベントを親へ伝えない。false なら、親の操作(パンやピンチ)に任せる) */
  consumed: boolean
}

const ignore = (state: DrawState): DrawStep => ({ state, effect: null, consumed: false })

export function drawReducer(state: DrawState, event: DrawEvent): DrawStep {
  switch (event.type) {
    case 'down': {
      // 待機のときだけ始める。ドラッグ中の 2 回目の押下(2 本目の指、別のボタン)は無視する
      if (state.kind !== 'idle') return ignore(state)
      // 主ボタン以外(右クリックなど)と、マルチタッチの 2 本目以降(ピンチ操作)は始めない
      if (event.button !== 0 || !event.isPrimary) return ignore(state)
      return {
        state: { kind: 'dragging', pointerId: event.pointerId, start: event.point, current: event.point },
        effect: null,
        consumed: true,
      }
    }
    case 'move': {
      if (state.kind !== 'dragging' || state.pointerId !== event.pointerId) return ignore(state)
      return { state: { ...state, current: event.point }, effect: null, consumed: true }
    }
    case 'up': {
      if (state.kind !== 'dragging' || state.pointerId !== event.pointerId) return ignore(state)
      // 主ボタン以外の離す操作は、確定にしない(ドラッグ中に別のボタンを押して離したとき)
      if (event.button !== 0) return ignore(state)
      return {
        state: DRAW_IDLE,
        effect: { type: 'create', rect: rectFromDrag(state.start, event.point) },
        consumed: true,
      }
    }
    case 'cancel': {
      // ドラッグ中の、そのポインタだけ。確定のあとに来る `lostpointercapture`(待機)は、何もしない
      if (state.kind !== 'dragging' || state.pointerId !== event.pointerId) return ignore(state)
      return { state: DRAW_IDLE, effect: { type: 'cancel' }, consumed: true }
    }
    case 'escape':
      return { state: DRAW_IDLE, effect: { type: 'cancel' }, consumed: true }
    case 'reset':
      return { state: DRAW_IDLE, effect: null, consumed: false }
  }
}

/** ドラッグ中のプレビューの四角(キャンバスの座標)。ドラッグ中でなければ null。ほぼクリックのときは、既定の大きさ(置かれる大きさ)を見せる */
export function previewRect(state: DrawState): Rect | null {
  return state.kind === 'dragging' ? rectFromDrag(state.start, state.current) : null
}

/** プレビューに添える大きさの文字("300×400") */
export function formatSize(rect: Pick<Rect, 'width' | 'height'>): string {
  return `${Math.round(rect.width)}×${Math.round(rect.height)}`
}
