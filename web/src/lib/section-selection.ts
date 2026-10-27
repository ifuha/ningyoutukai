import { pickSectionForCard } from '#/lib/section-edit-geometry'
import type { PickableSection, Point } from '#/lib/section-edit-geometry'
import type { CanvasTool } from '#/lib/section-interaction-types'

// セクションの選択。リーダーだけが選択して編集できる(リーダーでなければ、いつも選択なし)。
// 選択は、セクションのクリックで入り、背景のクリックか Esc で外れる。選択中のセクションが消えたら、外れる。

/** 持っている選択を、いまの状態に合わせる(リーダーでない・セクションが消えた、なら null) */
export function reconcileSelection(
  selectedId: string | null,
  sections: readonly { sectionId: string }[],
  canEdit: boolean,
): string | null {
  if (!canEdit || selectedId === null) return null
  return sections.some((s) => s.sectionId === selectedId) ? selectedId : null
}

export type BackgroundClick =
  | { type: 'select'; sectionId: string }
  | { type: 'clear' }
  | { type: 'none' }

// クリックされた要素が、ボタン・入力欄・カードなど(背景ではない)か。背景ではないクリックでは、選択を変えない
const INTERACTIVE = 'button, a, input, textarea, select, label, [data-card-id], [data-no-deselect]'

export function isInteractiveTarget(
  target: { closest?: (selector: string) => unknown } | null,
): boolean {
  return !!target?.closest?.(INTERACTIVE)
}

/**
 * キャンバスのクリックの動き。
 * - 「セクション」の道具のとき(描くとき)・リーダーでないとき・ボタンやカードのクリックのときは、何もしない
 * - それ以外は、クリックした点にあるセクション(重なるときは、面積が小さい方)を選ぶ。どこにもなければ、選択を外す
 * @param point クリックした点(キャンバス座標)
 */
export function resolveBackgroundClick({
  tool,
  canEdit,
  interactive,
  point,
  sections,
}: {
  tool: CanvasTool
  canEdit: boolean
  /** クリックされたのが、ボタン・入力欄・カードなどか(`isInteractiveTarget`) */
  interactive: boolean
  point: Point
  sections: readonly PickableSection[]
}): BackgroundClick {
  if (tool === 'section' || !canEdit || interactive) return { type: 'none' }
  const id = pickSectionForCard(point, sections)
  return id === null ? { type: 'clear' } : { type: 'select', sectionId: id }
}
