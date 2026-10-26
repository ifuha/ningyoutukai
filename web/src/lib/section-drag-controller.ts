import { startDragSession } from '#/lib/drag-session'
import type { DragLock, DragSession, DragTarget, FrameScheduler } from '#/lib/drag-session'
import { createFollower } from '#/lib/drag-follow'
import type { FollowElement, Follower } from '#/lib/drag-follow'
import type { Rect } from '#/lib/section-edit-geometry'
import {
  IDLE,
  endDrag,
  handleCursor,
  moveDrag,
  pressDrag,
  startDrag,
  type DragKind,
  type DragState,
} from '#/lib/section-editor-state'

// セクションの移動・大きさの変更の、ドラッグの制御部(F1 セクション画面。React に依存しない)
//
// 内側の「動かす面」(`SectionMoveSurface`)と、編集枠(`SectionEditor`)の、札・枠の線の近く・ハンドルが使う。
// 押した瞬間から離すまで、window で動きを受ける(`drag-session.ts`。速く動かしても、要素の外へ出ても追従する)。
// - 移動: セクションの四角・編集枠・中のカードを、transform で一緒に動かす(`drag-follow.ts`。React の状態を経由しない。1 フレームに 1 回)。
//   Figma のように、つかんだ点が、いつもマウスの下にある。確定(離す)で、`onCommit` が楽観更新して、新しい位置になったら、transform を戻す
// - 大きさの変更: 四角は、確定まで動かさない。見た目の四角を、1 フレームに 1 回、`onLive` で知らせる(編集枠が描く破線とハンドル)
// - 位置は、いつも「押した点からの絶対計算」(差分の積み重ねではない)。最終の位置は、離したイベントの座標で決める
// - 4px 未満の動きは、クリック(選択だけ。動かさない)。移動のつかみ場所は、押した時点で選択され、4px を超えたら動き出す。
//   ハンドルは、押したらすぐ大きさの変更が始まる
// - Esc・pointercancel・window が非アクティブで取り消す(`onCommit` を呼ばず、元に戻す)

export type SectionDragPointerDown = {
  pointerId: number
  clientX: number
  clientY: number
  currentTarget: { setPointerCapture(pointerId: number): void }
}

export type SectionDragDeps = {
  /** 動きを受ける対象。押した時点で読む */
  getTarget: () => DragTarget
  /** ドラッグ中の、テキストの選択とカーソルの固定の対象。省略可。cursor は、操作に合わせたカーソル */
  getLock?: (cursor: string) => DragLock | undefined
  /** いまのセクションの四角(キャンバスの座標) */
  getBase: () => Rect
  getScale: () => number
  /** 移動で、一緒に動かす要素を集める(ドラッグが確定したときに 1 回) */
  getFollowers: () => FollowElement[]
  /** 離したときの、見た目の更新と、確定(楽観更新)を、同時に反映する(通常は flushSync) */
  batch: (fn: () => void) => void
  /** 確定した四角(1 回のドラッグにつき、多くても 1 回。動かなかったら呼ばない) */
  onCommit: (rect: Rect) => void
  /** ドラッグが確定した(四角あり)・終わった(null)。Esc の優先順位に使う。動くたびには呼ばない */
  onPreview: (rect: Rect | null) => void
  /** 大きさの変更の、見た目の四角(1 フレームに 1 回)。終わったら null。移動では呼ばない */
  onLive: (rect: Rect | null) => void
  /** ドラッグが確定した・終わった(カーソルなどの見た目用。動くたびには呼ばない) */
  onActive: (active: boolean) => void
  scheduler?: FrameScheduler
}

export type SectionDragController = {
  start(kind: DragKind, e: SectionDragPointerDown): void
  /** 何も確定せずに取りやめる(使えなくなったとき) */
  cancel(): void
  /** 続いているドラッグがあるか(押した直後を含む) */
  isActive(): boolean
  /**
   * いまの Esc が、ドラッグの取り消しに使われたか(1 回だけ true。同じ Esc の処理の中で読む)。
   * 動き・離しは window のキャプチャ段階で受けるので、Esc も、ほかのキー処理(矢印キーの途中の取り消し・メニューを閉じる)より先に、
   * ドラッグを取り消す。同じ Esc で、続けて、ほかの動作(メニューを閉じる、など)が起きないように、ほかの処理は、これを見て抜ける
   */
  takeEscape(): boolean
  dispose(): void
}

function cursorFor(kind: DragKind): string {
  return kind.type === 'move' ? 'grabbing' : handleCursor(kind.handle)
}

export function createSectionDragController(deps: SectionDragDeps): SectionDragController {
  let state: DragState = IDLE
  let session: DragSession | null = null
  let follower: Follower | null = null
  // いまの Esc で、ドラッグを取り消したか(同じタスクの中だけ有効。次のタスクで落とす)
  let escaped = false

  // 終わった・取り消したときの後始末(見た目を元に戻す)
  const cleanup = () => {
    follower?.reset()
    follower = null
    deps.onLive(null)
    deps.onActive(false)
    deps.onPreview(null)
  }

  const start: SectionDragController['start'] = (kind, e) => {
    session?.end()
    session = null
    follower?.reset()
    follower = null

    const base = deps.getBase()
    const client = { x: e.clientX, y: e.clientY }
    // 移動は、押した直後の状態から(4px を超えたら動き出す)。ハンドルは、すぐ始まる
    state = kind.type === 'move' ? pressDrag(kind, base, client, e.pointerId) : startDrag(kind, base, client, e.pointerId)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // すでに離れたポインタなど。window で受けているので、ドラッグ自体は続けられる
    }

    // ドラッグが確定した(クリックではない)。固定、見た目の準備、Esc の優先順位への通知
    const confirm = (s: DragSession) => {
      if (state.phase !== 'dragging') return
      s.engage()
      deps.onActive(true)
      deps.onPreview(state.origin)
      if (state.kind.type === 'move') follower = createFollower(deps.getFollowers())
      s.requestFrame()
    }

    const s: DragSession = startDragSession({
      target: deps.getTarget(),
      pointerId: e.pointerId,
      scheduler: deps.scheduler,
      lock: deps.getLock?.(cursorFor(kind)),
      onMove: (ev) => {
        const wasPressed = (state.phase as string) === 'pressed'
        state = moveDrag(state, { x: ev.clientX, y: ev.clientY }, deps.getScale(), ev.pointerId)
        if (wasPressed && (state.phase as string) === 'dragging') confirm(s)
        if (state.phase !== 'dragging') return false
        s.requestFrame()
        // 確定したあとの動きは、パンに渡さない
        return true
      },
      onFrame: () => {
        if (state.phase !== 'dragging') return
        const preview = state.preview
        if (state.kind.type === 'move') {
          follower?.apply(preview.x - state.origin.x, preview.y - state.origin.y)
        } else {
          deps.onLive(preview)
        }
      },
      onUp: (ev) => {
        session = null
        // 離したときの座標で、最終の位置を決める(最後の pointermove ではなく)
        state = moveDrag(state, { x: ev.clientX, y: ev.clientY }, deps.getScale(), ev.pointerId)
        const result = endDrag(state, ev.pointerId)
        state = result.state
        // 見た目の消去と、確定(楽観更新)を、同時に反映する。そのあとで、transform を戻す(間に、元の位置が見えない)
        deps.batch(() => {
          if (result.commit) deps.onCommit(result.commit)
          deps.onLive(null)
          deps.onActive(false)
          deps.onPreview(null)
        })
        follower?.reset()
        follower = null
      },
      onCancel: (reason) => {
        session = null
        state = IDLE
        cleanup()
        if (reason === 'escape') {
          escaped = true
          setTimeout(() => {
            escaped = false
          }, 0)
        }
      },
    })
    session = s
    // ハンドルは、押した時点で大きさの変更が始まっている
    confirm(s)
  }

  return {
    start,
    cancel() {
      session?.end()
      session = null
      if (state.phase === 'idle') return
      state = IDLE
      cleanup()
    },
    isActive: () => state.phase !== 'idle',
    takeEscape() {
      const was = escaped
      escaped = false
      return was
    },
    dispose() {
      session?.end()
      session = null
      // 画面から消えるとき、ドラッグ中だったら、Esc の優先順位の目印だけ戻す(消える部品の状態は、更新しない)
      const wasDragging = state.phase === 'dragging'
      state = IDLE
      follower?.reset()
      follower = null
      if (wasDragging) deps.onPreview(null)
    },
  }
}
