// セクションを動かしている間、見た目を「マウスに追従」させる部品(F1 セクション画面)
//
// ドラッグ中に、動くたびに React の状態を更新すると、全カード・全セクションが描き直されて、マウスに遅れる。
// そこで、動かす要素(セクションの四角、その編集枠、中にあるカード)の `transform` を、直接書く(1 フレームに 1 回)。
// 確定(離す)で、api と楽観更新が新しい位置を反映したら、`transform` を戻す。取り消したら、戻すだけ。
//
// `transform: translate(dx, dy)` は、親(キャンバスの変換された層)の拡大の内側で効くので、dx・dy は「キャンバスの座標」の差分でよい。
// 親子の線(SVG)は、確定まで動かさない(測り直すのは、位置が変わったあと)

/** 動かす要素の、最小の形(テストでは、偽のものを渡す) */
export type FollowElement = { style: { transform: string } }
/** 動かす要素を探す対象(通常は document) */
export type FollowRoot = { querySelectorAll(selector: string): ArrayLike<FollowElement> }

/** セレクターに入れてよい値(UUID など)。それ以外は、探さない(セレクターが壊れないように) */
const SAFE_VALUE = /^[A-Za-z0-9_-]+$/

/**
 * セクションの移動で、一緒に動かす要素のセレクター。
 * - セクションの四角(`SectionBox` の `data-section-id`)
 * - セクションの編集枠(`SectionEditor` の `data-section-editor`)。つかむ場所・ハンドル・メニューが、四角と一緒に動く
 * - 中にあるカード(`MemberCard` の `data-card-id`)。api と同じ規則で、位置を持つ所属メンバーだけを渡す
 */
export function followSelectors(sectionId: string, memberIds: readonly string[]): string {
  const selectors: string[] = []
  if (SAFE_VALUE.test(sectionId)) {
    selectors.push(`[data-section-id="${sectionId}"]`, `[data-section-editor="${sectionId}"]`)
  }
  for (const id of memberIds) {
    if (SAFE_VALUE.test(id)) selectors.push(`[data-card-id="${id}"]`)
  }
  return selectors.join(', ')
}

/** 動かす要素を集める(ドラッグが確定したときに 1 回。動かすたびには探さない) */
export function collectFollowers(
  root: FollowRoot,
  sectionId: string,
  memberIds: readonly string[],
): FollowElement[] {
  const selector = followSelectors(sectionId, memberIds)
  if (selector === '') return []
  return Array.from(root.querySelectorAll(selector))
}

export type Follower = {
  /** すべての要素を、元の位置から (dx, dy) だけ動かして見せる(キャンバスの座標の差分) */
  apply(dx: number, dy: number): void
  /** 動かしていた分を戻す(確定のあと・取り消し) */
  reset(): void
}

export function createFollower(elements: readonly FollowElement[]): Follower {
  let last = ''
  return {
    apply(dx, dy) {
      const value = `translate(${dx}px, ${dy}px)`
      if (value === last) return
      last = value
      for (const el of elements) el.style.transform = value
    },
    reset() {
      last = ''
      for (const el of elements) el.style.transform = ''
    },
  }
}
