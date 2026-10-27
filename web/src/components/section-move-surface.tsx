import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { flushSync } from 'react-dom'
import type { SectionEditorProps } from '#/components/section-editor'
import { collectFollowers, type FollowRoot } from '#/lib/drag-follow'
import type { DragTarget } from '#/lib/drag-session'
import type { Rect } from '#/lib/section-edit-geometry'
import { createSectionDragController, type SectionDragController } from '#/lib/section-drag-controller'

// セクションの内側の「動かす面」。セクションを、カードのように、内側の空いている場所をつかんでドラッグして動かせるようにする。
//
// 置く場所: キャンバスの変換された層の中で、`SectionBox` の上、**カードの下**(カードの上のドラッグは、これまでどおりカードのドラッグ)。
//   カードのない、空いた場所のドラッグだけが、この面に届く。編集枠(`SectionEditor`。カードの上)の札・帯・ハンドルは、さらに上にあるので優先される。
// 振る舞い(`canEdit` のときだけ。false のときは、何も出さず、何も受けない):
// - 押したら、そのセクションを選択する(`onSelect`)。キャンバスの移動(パン)は始めない(押下を、親に伝えない)。
// - 動きが 4px 以内なら、クリック(選択するだけ。動かさない)。超えたらドラッグになり、**押した点を起点に**動く。
// - **マウスに追従する**: 押した瞬間から離すまで、window で動きを受ける(速く動かしても、面の外へ出ても追従する)。
//   動いている間は、セクションの四角・編集枠・中のカードを、transform で一緒に動かす(React の状態を経由しない。1 フレームに 1 回)。
//   つかんだ点が、いつもマウスの下にある(Figma と同じ)。確定は、離したときに 1 回だけ `onChange(rect)`。動かなかったら呼ばない。
//   所属メンバーのカードの連動は、`onChange` を受ける側(`updateSection` の楽観更新)が行う。transform は、その反映と同時に戻す
// - Esc・`pointercancel` で取り消し(`onChange` は呼ばない)。右クリックは無視。2 本目の指は、押している間は無視する(パンも始めない)。
// - `data-no-deselect`: この面のクリックが、「背景のクリック」として、選択を外さないようにする(キャンバスのクリックの判定が無視する)。
// 計算と後始末は、`section-drag-controller.ts`(編集枠の、札・帯・ハンドルと同じ制御部)が行う。

export type SectionMoveSurfaceProps = Pick<
  SectionEditorProps,
  'section' | 'canEdit' | 'scale' | 'onSelect' | 'onChange' | 'onPreview' | 'offsetX' | 'offsetY'
> & {
  /** 一緒に動かす、位置を持つ所属メンバー(api と同じ規則)。省略は、なし */
  followMemberIds?: readonly string[]
}

type Latest = Pick<SectionMoveSurfaceProps, 'scale' | 'onSelect' | 'onChange' | 'onPreview' | 'followMemberIds' | 'section'> & {
  base: Rect
}

export function SectionMoveSurface({
  section,
  canEdit,
  scale,
  onSelect,
  onChange,
  onPreview,
  followMemberIds,
  offsetX = 0,
  offsetY = 0,
}: SectionMoveSurfaceProps) {
  const base: Rect = { x: section.x, y: section.y, width: section.width, height: section.height }

  // イベントの中(古い render の関数)から、最新の値を読むための入れ物
  const latest = useRef<Latest>({ base, scale, onSelect, onChange, onPreview, followMemberIds, section })
  latest.current = { base, scale, onSelect, onChange, onPreview, followMemberIds, section }

  // カーソル(つかんでいる間は grabbing)のためだけの状態。動くたびには変わらない(確定と終わりのときだけ)
  const [dragging, setDragging] = useState(false)

  const controllerRef = useRef<SectionDragController | null>(null)
  if (controllerRef.current === null) {
    controllerRef.current = createSectionDragController({
      getTarget: () => window as unknown as DragTarget,
      getLock: (cursor) => ({ body: document.body, cursor }),
      getBase: () => latest.current.base,
      getScale: () => latest.current.scale,
      getFollowers: () =>
        collectFollowers(
          document as unknown as FollowRoot,
          latest.current.section.sectionId,
          latest.current.followMemberIds ?? [],
        ),
      batch: (fn) => flushSync(fn),
      onCommit: (rect) => latest.current.onChange(rect),
      // 親に、動かしている最中か(四角あり)を知らせる。Esc の優先順位に使う(動くたびには呼ばない)
      onPreview: (rect) => latest.current.onPreview?.(rect),
      onLive: () => {},
      onActive: setDragging,
    })
  }
  const controller = controllerRef.current

  // リーダーでなくなった・消えたときは、途中のドラッグを捨てる
  useEffect(() => {
    if (!canEdit) controller.cancel()
  }, [canEdit, controller])
  useEffect(() => () => controller.dispose(), [controller])

  if (!canEdit) return null

  return (
    <div
      data-section-move-surface={section.sectionId}
      data-no-deselect=""
      className="pointer-events-auto absolute"
      style={{
        left: base.x + offsetX,
        top: base.y + offsetY,
        width: base.width,
        height: base.height,
        cursor: dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onPointerDown={(e: ReactPointerEvent<HTMLElement>) => {
        // 動かしている最中の、ほかのポインタ(2 本目の指)は、無視する(パンも、始めない)
        if (controller.isActive() && !e.isPrimary) {
          e.stopPropagation()
          return
        }
        // 右クリック・中ボタン・主でないポインタは、受けない(親の処理に任せる)
        if (e.button !== 0 || !e.isPrimary) return
        e.stopPropagation()
        e.preventDefault()
        latest.current.onSelect()
        controller.start({ type: 'move' }, e)
      }}
    />
  )
}
