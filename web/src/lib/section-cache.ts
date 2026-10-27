import { applyDeltaToMembers } from '#/lib/section-edit-geometry'
import type { Point } from '#/lib/section-edit-geometry'
import { sectionStyles } from '#/lib/section-style'

// 楽観更新のための、キャッシュの更新の計算(画面・react-query に依存しない純粋な関数)。
// 対象は 2 つ: セクションの一覧(`['products', productId, 'sections']`)と、ツリー(`[..., 'tree']`。メンバーの位置・所属)。
// api と同じ規則で計算する(失敗したら元に戻し、成功・失敗のあとはサーバーの値で取り直して整合を取る)。

export type CachedMember = {
  productMemberId: string
  sectionId: string | null
  positionX: number | null
  positionY: number | null
}
export type CachedTree<M extends CachedMember> = { leader: M; members: M[] }
export type CachedSection = {
  sectionId: string
  sectionName: string
  color: string
  x: number
  y: number
  width: number
  height: number
  /** 所属する productMemberId */
  memberIds: string[]
}

/** セクションの更新で変えられる項目(api の PATCH と同じ) */
export type SectionPatch<S extends CachedSection = CachedSection> = Partial<
  Pick<S, 'sectionName' | 'color' | 'x' | 'y' | 'width' | 'height'>
>

export type UpdateFailure = 'not-found' | 'out-of-range'
export type CacheUpdate<S, T> =
  | { ok: true; sections: S[]; tree: T | undefined }
  | { ok: false; reason: UpdateFailure }

function mapMembers<M extends CachedMember, T extends CachedTree<M>>(
  tree: T,
  fn: (m: M) => M,
): T {
  return { ...tree, leader: fn(tree.leader), members: tree.members.map(fn) }
}

/**
 * セクションの更新(名前・色・位置・大きさ)。
 * 位置(`x` / `y`)が変わるときは、**そのセクションに所属するメンバーのうち、位置を持つものを、同じ差分だけ動かす**(api と同じ)。
 * 位置が NULL のメンバーは、NULL のまま。1 人でも座標の上限(±1,000,000)を超えるなら、何も変えずに失敗(api は 422)。
 * 大きさだけの変更では、メンバーは動かさない。
 */
export function applySectionUpdate<
  S extends CachedSection,
  M extends CachedMember,
  T extends CachedTree<M>,
>(
  sections: readonly S[],
  tree: T | undefined,
  sectionId: string,
  patch: SectionPatch<S>,
): CacheUpdate<S, T> {
  const current = sections.find((s) => s.sectionId === sectionId)
  if (!current) return { ok: false, reason: 'not-found' }
  // 値が undefined の項目は、変えない(キーがあっても)
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as SectionPatch<S>
  const updated = { ...current, ...defined }
  const delta: Point = { x: updated.x - current.x, y: updated.y - current.y }

  let nextTree = tree
  if (tree && (delta.x !== 0 || delta.y !== 0)) {
    const inSection = [tree.leader, ...tree.members].filter((m) => m.sectionId === sectionId)
    const moved = applyDeltaToMembers(inSection, delta)
    if (!moved.ok) return { ok: false, reason: 'out-of-range' }
    const byId = new Map(moved.members.map((m) => [m.productMemberId, m]))
    nextTree = mapMembers<M, T>(tree, (m) => (byId.get(m.productMemberId) as M | undefined) ?? m)
  }
  return {
    ok: true,
    sections: sections.map((s) => (s.sectionId === sectionId ? updated : s)),
    tree: nextTree,
  }
}

/** セクションの削除。所属メンバーは無所属に戻り、メンバーと位置は残る(api の `ON DELETE SET NULL`) */
export function applySectionDelete<
  S extends CachedSection,
  M extends CachedMember,
  T extends CachedTree<M>,
>(sections: readonly S[], tree: T | undefined, sectionId: string): CacheUpdate<S, T> {
  if (!sections.some((s) => s.sectionId === sectionId)) {
    return { ok: false, reason: 'not-found' }
  }
  return {
    ok: true,
    sections: sections.filter((s) => s.sectionId !== sectionId),
    tree: tree
      ? mapMembers<M, T>(tree, (m) =>
          m.sectionId === sectionId ? { ...m, sectionId: null } : m,
        )
      : tree,
  }
}

/**
 * カードの移動(位置と所属)。`sectionId` が undefined のときは、所属を変えない。null で無所属、文字列でそのセクションへ。
 * セクションの `memberIds` も合わせる(移るメンバーを、元のセクションから外し、先のセクションに足す)。
 */
export function applyMemberMove<
  S extends CachedSection,
  M extends CachedMember,
  T extends CachedTree<M>,
>(
  sections: readonly S[],
  tree: T | undefined,
  memberId: string,
  position: Point,
  sectionId: string | null | undefined,
): { sections: S[]; tree: T | undefined } {
  const nextTree = tree
    ? mapMembers<M, T>(tree, (m) =>
        m.productMemberId === memberId
          ? {
              ...m,
              positionX: position.x,
              positionY: position.y,
              ...(sectionId === undefined ? {} : { sectionId }),
            }
          : m,
      )
    : tree
  if (sectionId === undefined) return { sections: [...sections], tree: nextTree }
  return {
    sections: sections.map((s) => {
      const others = s.memberIds.filter((id) => id !== memberId)
      return s.sectionId === sectionId
        ? { ...s, memberIds: [...others, memberId] }
        : others.length === s.memberIds.length
          ? s
          : { ...s, memberIds: others }
    }),
    tree: nextTree,
  }
}

/** セクションの追加(作成の応答を足す)。並びは、取り直したときにサーバーの順になる */
export function applySectionCreate<S extends CachedSection>(
  sections: readonly S[],
  created: S,
): S[] {
  return [...sections.filter((s) => s.sectionId !== created.sectionId), created]
}

const BASE_NAME = 'セクション'

/** 新しいセクションの既定の名前。「セクション 1」「セクション 2」…のうち、まだ無い最小のもの(同じ名前は 409 になるため) */
export function nextSectionName(existing: readonly string[]): string {
  const used = new Set(existing.map((n) => n.trim()))
  for (let n = 1; ; n += 1) {
    const name = `${BASE_NAME} ${n}`
    if (!used.has(name)) return name
  }
}

const COLORS = Object.keys(sectionStyles) as (keyof typeof sectionStyles)[]

/** 新しいセクションの既定の色。6 色を、作った数に応じて順に使う */
export function nextSectionColor(existing: readonly unknown[]): keyof typeof sectionStyles {
  return COLORS[existing.length % COLORS.length]
}
