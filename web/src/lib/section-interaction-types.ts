import type { PointerEventHandler } from 'react'
import type { PickableSection, Point, Rect } from '#/lib/section-edit-geometry'
import type { Section, SectionColor } from '#/lib/section'

// F1 セクション画面の第 2 段階(編集)で、部品どうしが受け渡す型。
// 座標は、すべて「キャンバス座標」(拡大率・パンを含まない。セクションの `x` / `y` と同じ座標系)。
// カードの位置(`Point`)は、**カードの左上の座標**(中心ではない)。

/** 道具(モード)。ツールバーの「選択」「移動」「セクション」に対応する */
export type CanvasTool = 'select' | 'pan' | 'section'

/**
 * A: セクションを描く層(`web/src/components/section-draw-layer.tsx`)。
 * `active` のときだけ、キャンバス全面でポインタを受け、ドラッグで四角のプレビューを描き、離したら `onCreate(rect)`。
 * Esc で `onCancel`。
 */
export type SectionDrawLayerProps = {
  active: boolean
  scale: number
  toCanvas: (client: Point) => Point
  onCreate: (rect: Rect) => void
  onCancel: () => void
}

/**
 * B: セクションの編集枠(`web/src/components/section-editor.tsx`)。
 * `onChange` は、移動・大きさの変更の**確定時**(ドラッグの終わり)に、新しい四角を渡す。
 */
export type SectionEditorProps = {
  section: Pick<
    Section,
    'sectionId' | 'sectionName' | 'color' | 'x' | 'y' | 'width' | 'height'
  >
  selected: boolean
  canEdit: boolean
  scale: number
  onSelect: () => void
  onChange: (rect: Rect) => void
  onRename: (name: string) => void
  onColorChange: (color: SectionColor) => void
  onDelete: () => void
}

/**
 * C: カードのドラッグが返す、カードの要素に付けるポインタのハンドラ。
 * 押したところだけ。動き・離し・取り消しは、押した瞬間から window で受ける(`web/src/lib/drag-session.ts`。速く動かして、カードの外へ出ても追従する)
 */
export type CardDragHandlers = {
  onPointerDown: PointerEventHandler<HTMLElement>
}

/**
 * C: カードのドラッグ(`web/src/lib/use-card-drag.ts`)の引数。
 * `onDrop` の `position` はカードの左上、`sectionId` は `pickSectionForCard` の結果(どれにも入らなければ null)。
 */
export type UseCardDragOptions = {
  enabled: boolean
  scale: number
  sections: PickableSection[]
  getCardRect: (memberId: string) => Rect | null
  onDrop: (memberId: string, position: Point, sectionId: string | null) => void
}

/** C: カードのドラッグの戻り値 */
export type UseCardDragResult = {
  draggingId: string | null
  /** 影のカードの基準の位置(ドラッグを始めたときのカードの左上)。以降の動きは、`ghostRef` の要素の transform に直接書かれる */
  previewPosition: Point | null
  hoverSectionId: string | null
  getDragHandlers: (memberId: string) => CardDragHandlers
  /** 影のカードの要素に付ける(React の状態を経由せず、動くたびに transform を書くため) */
  ghostRef: (el: HTMLElement | null) => void
}

/**
 * ツリーの「変換された層」(パンとズームがかかる層)の中の部品が使う、キャンバスの見え方。
 * `CanvasViewContext`(`web/src/lib/canvas-view.ts`)で提供する。
 */
export type CanvasView = {
  /** 拡大率(1 = 100%) */
  scale: number
  /** 画面の座標(`clientX` / `clientY`)をキャンバス座標にする。パンとズームを考慮する */
  toCanvas: (client: Point) => Point
}
