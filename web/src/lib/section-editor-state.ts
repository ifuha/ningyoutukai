// セクションの編集枠(`SectionEditor`)の、DOM に依存しない状態遷移と計算
// ドラッグ(移動・大きさの変更)、名前の編集、色・削除のメニュー、キー操作を、純粋な関数にして、テストで守る
// 座標は「キャンバスの座標」。画面の座標(px)の差分は、拡大率(scale)で割ってキャンバスの差分にする
import type { SectionColor } from '#/lib/section'
import {
  moveRect,
  rectsEqualWithin,
  resizeRect,
  type Point,
  type Rect,
  type ResizeHandle,
} from '#/lib/section-edit-geometry'

// ---------------------------------------------------------------- 拡大率

/** 拡大率が 0 以下・NaN・Infinity のときは、1 として扱う(割り算で壊れないように) */
export function safeScale(scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

/** 画面の大きさ(px)を、拡大率に関わらず一定の見た目にするための、キャンバスでの大きさ(= px / scale) */
export function screenSize(px: number, scale: number): number {
  return px / safeScale(scale)
}

/** 拡大率を打ち消す(小さなメニューなどを、拡大率に関わらず読める大きさにする)ための style */
export function inverseScaleStyle(scale: number): { transform: string; transformOrigin: string } {
  return { transform: `scale(${1 / safeScale(scale)})`, transformOrigin: 'top left' }
}

// ---------------------------------------------------------------- 配置の寸法

/** 札(名前のラベル)の位置と大きさ。`SectionBox` の札と同じ(Figma の `Frame 71`: 120 × 32)。
 *  四角の外側の左端から 18px 右、上の辺から 16px 上(`SectionBox` は枠線 2px の内側を基準に -18 / 16 なので、外側基準では 18 / -16) */
export const TAG_RECT = { left: 18, top: -16, width: 120, height: 32 } as const
/** メニューのボタンの位置(札の右どなり) */
export const MENU_BUTTON_OFFSET = { left: TAG_RECT.left + TAG_RECT.width + 6, top: TAG_RECT.top } as const
/** リサイズのハンドルの、画面での見た目の大きさ(px) */
export const HANDLE_PX = 12
/** 枠の線の近くの、つかめる帯の、画面での太さ(px。線をまたいで、内と外に半分ずつ) */
export const BAND_PX = 12
/** クリックとみなす、ポインタの移動の上限(画面の px) */
export const CLICK_THRESHOLD_PX = 4
/** 矢印キーの移動量(キャンバスの座標)。Shift で大きく */
export const NUDGE_STEP = 1
export const NUDGE_STEP_SHIFT = 10
/** 矢印キーを押し続けたとき、変更を 1 回にまとめる待ち時間(ms) */
export const NUDGE_SETTLE_MS = 350

const HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** 8 つのハンドルの中心の位置(四角の左上を原点とした、キャンバスの座標)と、見た目の大きさ */
export function handleBoxes(
  rect: Pick<Rect, 'width' | 'height'>,
  scale: number,
): { handle: ResizeHandle; cx: number; cy: number; size: number }[] {
  const size = screenSize(HANDLE_PX, scale)
  const { width: w, height: h } = rect
  const pos: Record<ResizeHandle, [number, number]> = {
    nw: [0, 0],
    n: [w / 2, 0],
    ne: [w, 0],
    e: [w, h / 2],
    se: [w, h],
    s: [w / 2, h],
    sw: [0, h],
    w: [0, h / 2],
  }
  return HANDLES.map((handle) => ({ handle, cx: pos[handle][0], cy: pos[handle][1], size }))
}

/** ハンドルに合わせた、マウスカーソルの形 */
export function handleCursor(handle: ResizeHandle): string {
  switch (handle) {
    case 'n':
    case 's':
      return 'ns-resize'
    case 'e':
    case 'w':
      return 'ew-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
    case 'nw':
    case 'se':
      return 'nwse-resize'
  }
}

/** 枠の線の近くの、つかめる 4 つの帯(四角の左上を原点とした、キャンバスの座標)。線をまたいで、内と外に半分ずつ */
export function bandBoxes(
  rect: Pick<Rect, 'width' | 'height'>,
  scale: number,
): { side: 'top' | 'right' | 'bottom' | 'left'; left: number; top: number; width: number; height: number }[] {
  const b = screenSize(BAND_PX, scale)
  const half = b / 2
  const { width: w, height: h } = rect
  return [
    { side: 'top', left: -half, top: -half, width: w + b, height: b },
    { side: 'bottom', left: -half, top: h - half, width: w + b, height: b },
    { side: 'left', left: -half, top: -half, width: b, height: h + b },
    { side: 'right', left: w - half, top: -half, width: b, height: h + b },
  ]
}

// ---------------------------------------------------------------- クリックの判定

/** 押した位置と離した位置が近ければ、クリック(ドラッグではない)。画面の座標(px)で比べる */
export function isClick(down: Point, up: Point, threshold = CLICK_THRESHOLD_PX): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= threshold
}

// ---------------------------------------------------------------- ドラッグ(移動・大きさの変更)

export type DragKind = { type: 'move' } | { type: 'resize'; handle: ResizeHandle }

export type DragState =
  | { phase: 'idle' }
  | {
      phase: 'dragging'
      /** ドラッグを始めたポインタ。ほかの指(マルチタッチ)の動きは無視する */
      pointerId: number
      kind: DragKind
      /** ドラッグを始めたときの四角 */
      origin: Rect
      /** ドラッグを始めたときの、画面の座標 */
      startClient: Point
      /** いまの、見た目だけの四角(確定するまで、親には渡さない) */
      preview: Rect
    }

export const IDLE: DragState = { phase: 'idle' }

export function startDrag(kind: DragKind, origin: Rect, client: Point, pointerId: number): DragState {
  return { phase: 'dragging', pointerId, kind, origin, startClient: client, preview: origin }
}

/** ポインタが動いたとき。画面の差分を拡大率で割って、キャンバスの差分にする。別のポインタ・ドラッグ中でないときは、何もしない */
export function moveDrag(state: DragState, client: Point, scale: number, pointerId: number): DragState {
  if (state.phase !== 'dragging' || state.pointerId !== pointerId) return state
  const s = safeScale(scale)
  const delta = { x: (client.x - state.startClient.x) / s, y: (client.y - state.startClient.y) / s }
  const preview =
    state.kind.type === 'move'
      ? moveRect(state.origin, delta)
      : resizeRect(state.origin, state.kind.handle, delta)
  return { ...state, preview }
}

/** ポインタが離されたとき。`commit` が、親に渡す四角(1 回だけ)。動かなかったとき(`rectsEqualWithin`)は `null` */
export function endDrag(
  state: DragState,
  pointerId: number,
): { state: DragState; commit: Rect | null } {
  if (state.phase !== 'dragging' || state.pointerId !== pointerId) return { state, commit: null }
  const commit = rectsEqualWithin(state.origin, state.preview) ? null : state.preview
  return { state: IDLE, commit }
}

/** Esc・`pointercancel`・ポインタのキャプチャが失われたとき。親には何も渡さず、元に戻す */
export function cancelDrag(): DragState {
  return IDLE
}

/** ドラッグ中の、見た目だけの四角。ドラッグ中でなければ `null` */
export function dragPreview(state: DragState): Rect | null {
  return state.phase === 'dragging' ? state.preview : null
}

// ---------------------------------------------------------------- 矢印キーの移動(変更を 1 回にまとめる)

/** 矢印キーの移動を、見た目の四角に重ねる(座標の上限に収める) */
export function nudgeRect(rect: Rect, delta: Point): Rect {
  return moveRect(rect, delta)
}

/** 待ち時間が過ぎたとき、親に渡す四角。元と同じ(往復して戻った)なら `null` */
export function settleNudge(origin: Rect, preview: Rect): Rect | null {
  return rectsEqualWithin(origin, preview) ? null : preview
}

// ---------------------------------------------------------------- 名前の編集

/** セクション名の上限(api の `SECTION_NAME_MAX` と同じ。前後の空白を取り除いたあとの、コードポイントの数) */
export const SECTION_NAME_MAX = 50

export type RenameState =
  | { editing: false }
  | { editing: true; original: string; draft: string }

/** 入力の途中の文字列を整える: NUL 文字(api が受け付けない)を取り除き、50 コードポイントに収める */
export function limitDraft(draft: string): string {
  const cleaned = draft.replaceAll('\u0000', '')
  const chars = [...cleaned]
  return chars.length > SECTION_NAME_MAX ? chars.slice(0, SECTION_NAME_MAX).join('') : cleaned
}

export function startRename(original: string): RenameState {
  return { editing: true, original, draft: limitDraft(original) }
}

export function changeDraft(state: RenameState, draft: string): RenameState {
  return state.editing ? { ...state, draft: limitDraft(draft) } : state
}

/** 確定するとき(Enter・外のクリック)。`rename` が親に渡す名前(1 回だけ)。
 *  空・空白だけ、または変更がないときは、渡さずに、元の表示に戻る */
export function commitRename(state: RenameState): { state: RenameState; rename: string | null } {
  if (!state.editing) return { state, rename: null }
  const trimmed = state.draft.trim()
  const next: RenameState = { editing: false }
  if (trimmed === '' || trimmed === state.original.trim()) return { state: next, rename: null }
  return { state: next, rename: trimmed }
}

export function cancelRename(): RenameState {
  return { editing: false }
}

/** 名前の入力欄のキー。日本語の変換中(IME)の Enter は、確定ではなく、変換の確定なので、無視する */
export function nameKeyAction(e: { key: string; isComposing: boolean; keyCode?: number }): 'commit' | 'cancel' | null {
  if (e.isComposing || e.keyCode === 229) return null
  if (e.key === 'Enter') return 'commit'
  if (e.key === 'Escape') return 'cancel'
  return null
}

// ---------------------------------------------------------------- 色・削除のメニュー

/** セクションの色の並びと、画面に出す名前(色が増えたとき、`satisfies` が、ここの不足をコンパイルエラーにする) */
export const SECTION_COLOR_ORDER = ['red', 'yellow', 'green', 'purple', 'lightblue', 'blue'] as const satisfies readonly SectionColor[]
export const SECTION_COLOR_LABELS = {
  red: '赤',
  yellow: '黄',
  green: '緑',
  purple: '紫',
  lightblue: '水色',
  blue: '青',
} as const satisfies Record<SectionColor, string>

export type MenuState = 'closed' | 'menu' | 'confirm-delete'

export type MenuAction =
  | { type: 'toggle' }
  | { type: 'close' }
  | { type: 'ask-delete' }
  | { type: 'cancel-delete' }

/** メニューの状態遷移。確認の表示(`confirm-delete`)は、「やめる」か、閉じるまで残る */
export function menuReduce(state: MenuState, action: MenuAction): MenuState {
  switch (action.type) {
    case 'toggle':
      return state === 'closed' ? 'menu' : 'closed'
    case 'close':
      return 'closed'
    case 'ask-delete':
      return 'confirm-delete'
    case 'cancel-delete':
      return state === 'confirm-delete' ? 'menu' : state
  }
}

/** 色を選んだとき。メニューは閉じる。いまと同じ色なら、親に渡さない(`color` が `null`) */
export function pickColor(
  current: SectionColor,
  chosen: SectionColor,
): { menu: MenuState; color: SectionColor | null } {
  return { menu: 'closed', color: chosen === current ? null : chosen }
}

/** 「削除する」を押したとき。確認の表示のときだけ、削除する(`remove` が true)。それ以外の状態からは、削除しない */
export function confirmDelete(state: MenuState): { menu: MenuState; remove: boolean } {
  return state === 'confirm-delete' ? { menu: 'closed', remove: true } : { menu: state, remove: false }
}

// ---------------------------------------------------------------- キー操作(選択中)

export type KeyInfo = {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  /** 入力欄・テキストエリアなどの中でのキー操作か(名前を入力しているとき、削除や移動にしない) */
  inEditable: boolean
}

export type KeyAction =
  | { type: 'ask-delete' }
  | { type: 'nudge'; delta: Point }
  | { type: 'escape' }
  | null

/** 選択中のセクションへのキー操作。Delete / Backspace は削除の確認、矢印キーは 1px(Shift で 10px)の移動、Esc は取り消し */
export function keyAction(e: KeyInfo): KeyAction {
  if (e.inEditable) return null
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  const step = e.shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP
  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      return { type: 'ask-delete' }
    case 'ArrowLeft':
      return { type: 'nudge', delta: { x: -step, y: 0 } }
    case 'ArrowRight':
      return { type: 'nudge', delta: { x: step, y: 0 } }
    case 'ArrowUp':
      return { type: 'nudge', delta: { x: 0, y: -step } }
    case 'ArrowDown':
      return { type: 'nudge', delta: { x: 0, y: step } }
    case 'Escape':
      return { type: 'escape' }
    default:
      return null
  }
}
