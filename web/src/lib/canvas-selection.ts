import type { Point, Rect } from '#/lib/section-edit-geometry'

// キャンバスの選択(カード・セクション・メモ)の計算。画面にも api にも触れない純粋関数。
// Figma と同じ操作感:
//   - 何もない所をドラッグ → 触れたものを選ぶ(範囲選択)
//   - Shift を押しながら押す・範囲選択 → いまの選択に足す/外す
//   - 選択中のものを押したまま離す(動かさない) → その 1 つだけを選ぶ
// 選択は `ItemKey`(種類 + ID)の集合で持つ。ID だけで持つと、カードとセクションが同じ ID のときに混ざる

export type ItemKind = 'card' | 'section' | 'note'

/** 選択の対象を、種類と ID で表したもの。文字列なので、Set / Map のキーにそのまま使える */
export type ItemKey = `${ItemKind}:${string}`

/** 範囲選択の対象。`rect` はキャンバス座標 */
export type Selectable = {
  kind: ItemKind
  id: string
  rect: Rect
}

/** 範囲選択の判定。'touch' は触れたもの(重なり)、'contain' は完全に入ったものだけ */
export type MarqueeMode = 'touch' | 'contain'

/** まとめて動かす候補(複数選択の移動で使う) */
export type MoveCandidate = {
  kind: ItemKind
  id: string
  /** カードのとき、所属するセクション(なければ null) */
  sectionId?: string | null
  /** カードが、自由な位置(positionX / positionY)を持つか */
  hasPosition?: boolean
}

/** メモの幅・高さ(px。`web/src/components/sticky-note.tsx` の w-56 / h-52)。DOM から測らずに使う */
export const NOTE_SIZE = { width: 224, height: 208 } as const

export function itemKey(kind: ItemKind, id: string): ItemKey {
  return `${kind}:${id}`
}

export function parseKey(key: ItemKey): { kind: ItemKind; id: string } {
  const at = key.indexOf(':')
  return { kind: key.slice(0, at) as ItemKind, id: key.slice(at + 1) }
}

/** 2 点を、正の幅・高さの四角にする */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

// 幅・高さが 0 の四角は、何とも重ならない(押しただけ・真横にドラッグしたとき)
/** 2 つの四角が、少しでも重なるか。辺が触れるだけでは、重ならない */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** `inner` が、`outer` の内側に完全に入っているか(辺の上を含む) */
export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

/** 範囲選択の四角に入るもののキー。順序は、受け取った順のまま */
export function itemsInRect(
  items: readonly Selectable[],
  marquee: Rect,
  mode: MarqueeMode = 'touch',
): ItemKey[] {
  return items
    .filter((item) => (mode === 'contain' ? rectContains(marquee, item.rect) : rectsIntersect(marquee, item.rect)))
    .map((item) => itemKey(item.kind, item.id))
}

/**
 * 範囲選択に入れるメモ。**変更できないメモ(他の人のメモ)は、まとめて動かせないので、範囲選択では選ばない**
 * (押したときは、これまでどおり選べる。動かせないだけ)
 */
export function notesForMarquee<N extends { canEdit: boolean }>(notes: readonly N[]): N[] {
  return notes.filter((note) => note.canEdit)
}

/** Shift を押しながらの、1 つの選択の切り替え */
export function toggleKey(selected: ReadonlySet<ItemKey>, key: ItemKey): Set<ItemKey> {
  const next = new Set(selected)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

/**
 * ものを押したときの選択。
 * - Shift あり: 押したものを足す/外す(離しても、ほかの選択は残す)
 * - Shift なし・押したものが選択済み: 選択を変えず、離したときに「その 1 つだけ」にするか(`collapseOnRelease`)
 * - Shift なし・押したものが未選択: その 1 つだけを選ぶ
 */
export function pressItem(
  selected: ReadonlySet<ItemKey>,
  key: ItemKey,
  additive: boolean,
): { selected: Set<ItemKey>; collapseOnRelease: boolean } {
  if (additive) return { selected: toggleKey(selected, key), collapseOnRelease: false }
  if (selected.has(key)) {
    return { selected: new Set(selected), collapseOnRelease: selected.size > 1 }
  }
  return { selected: new Set([key]), collapseOnRelease: false }
}

/** 範囲選択の結果を、いまの選択に重ねる。Shift ありは足す、なしは置き換える */
export function applyMarquee(
  base: Iterable<ItemKey>,
  hits: Iterable<ItemKey>,
  additive: boolean,
): Set<ItemKey> {
  const next = additive ? new Set(base) : new Set<ItemKey>()
  for (const key of hits) next.add(key)
  return next
}

/** 複数の四角を囲む、いちばん小さい四角。空なら null */
export function boundingRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (const r of rects) {
    left = Math.min(left, r.x)
    top = Math.min(top, r.y)
    right = Math.max(right, r.x + r.width)
    bottom = Math.max(bottom, r.y + r.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * 選択を、いまの状態に合わせる(消えたもの・選べないものを外す)。
 * 集合の同一性は、中身が同じでも新しくする(呼び出し側は `useMemo` で包む)
 */
export function reconcileItemSelection(
  selected: ReadonlySet<ItemKey>,
  available: ReadonlySet<ItemKey>,
): Set<ItemKey> {
  const next = new Set<ItemKey>()
  for (const key of selected) if (available.has(key)) next.add(key)
  return next
}

/**
 * まとめて動かす候補から、二重に動かさないものを除く(複数選択の移動で使う)。
 * セクションを選んでいるとき、その所属カードのうち位置を持つものは、セクションの移動で一緒に動くので、除く。
 * 位置を持たないカード(自動配置)は、もともと動かない。カード単体の選択は、そのまま残す。
 */
export function itemsToMove(candidates: readonly MoveCandidate[]): MoveCandidate[] {
  const selectedSections = new Set(
    candidates.filter((c) => c.kind === 'section').map((c) => c.id),
  )
  return candidates.filter((c) => {
    if (c.kind !== 'card' || !c.hasPosition) return true
    return !(c.sectionId && selectedSections.has(c.sectionId))
  })
}
