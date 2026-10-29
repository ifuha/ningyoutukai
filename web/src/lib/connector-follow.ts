import { connectorPath } from '#/lib/tree-layout'
import type { Box } from '#/lib/tree-layout'

// ドラッグの最中に、親子の線(SVG)を、動いているカードに追従させる部品(F1 セクション画面)
//
// ドラッグ中は、カードやセクションの見た目を `transform` で直接動かす(React の状態を経由しない)。線(`TreeConnectors`)は、
// 測ったカードの位置から React が描くので、そのままだと、確定まで、元の位置に残る。
// そこで、動かす間は、線の端点を計算し直して、SVG の `path` の `d` と、矢印の `points` を、直接書く(1 フレームに 1 回)。
//
// 座標は、`TreeConnectors` と同じ(中身の左上が原点)。`transform: translate(dx, dy)` の差分は、キャンバスの座標の差分で、
// 中身の座標でも同じ値になる(拡大率は、親の変換が受け持つ)。
//
// 確定のとき(`finish(true)`)は、書いた値を戻さない。楽観更新のあと、React が新しい位置で描き直す(一瞬、元の位置に戻ってちらつくのを避ける)。
// 確定しなかったとき(`finish(false)`)は、元の端点に戻す。

/** 属性を書ける要素の、最小の形(テストでは、偽のものを渡す) */
export type AttrTarget = { setAttribute(name: string, value: string): void }

export type ConnectorTarget = {
  /** 線の先のカード(`data-card-id`) */
  id: string
  /** 動かす前の、カードの位置と大きさ */
  box: Box
  /** 線の `path` */
  path: AttrTarget
  /** 矢印の `polygon` */
  arrow: AttrTarget
}

export type ConnectorFollower = {
  /** 動くカードを、元の位置から (dx, dy) だけ動かした位置に合わせて、線を描き直す(キャンバスの座標の差分) */
  apply(dx: number, dy: number): void
  /** ドラッグが終わった。確定したなら何もしない(React が新しい位置で描く)。確定しなかったなら、元の線に戻す */
  finish(committed: boolean): void
}

const shifted = (box: Box, dx: number, dy: number): Box => ({
  ...box,
  left: box.left + dx,
  top: box.top + dy,
})

/**
 * @param parentId 線の根元(リーダー)のカード
 * @param parent 動かす前の、根元の位置と大きさ
 * @param moving 動いているカードの id。根元が入っていれば、すべての線が動く
 */
export function createConnectorFollower({
  parentId,
  parent,
  targets,
  moving,
}: {
  parentId: string
  parent: Box
  targets: readonly ConnectorTarget[]
  moving: ReadonlySet<string>
}): ConnectorFollower {
  const parentMoves = moving.has(parentId)
  // 動かすと線が変わる線だけ(根元が動くなら、すべて。そうでなければ、動くカードへの線だけ)
  const affected = targets.filter((t) => parentMoves || moving.has(t.id))
  let touched = false

  const write = (t: ConnectorTarget, from: Box, to: Box) => {
    const { d, arrow } = connectorPath(from, to)
    t.path.setAttribute('d', d)
    t.arrow.setAttribute('points', arrow)
  }

  return {
    apply(dx, dy) {
      if (affected.length === 0) return
      touched = true
      const p = parentMoves ? shifted(parent, dx, dy) : parent
      for (const t of affected) {
        write(t, p, moving.has(t.id) ? shifted(t.box, dx, dy) : t.box)
      }
    },
    finish(committed) {
      if (!committed && touched) {
        for (const t of affected) write(t, parent, t.box)
      }
      touched = false
    },
  }
}

/** 検索できる対象の、最小の形(通常は、中身の要素。テストでは偽のもの) */
export type ConnectorRoot = {
  querySelector(selector: string): AttrTarget | null
}

/** セレクターに入れてよい値(UUID など)。それ以外は、探さない(セレクターが壊れないように) */
const SAFE_VALUE = /^[A-Za-z0-9_-]+$/

/**
 * `TreeConnectors` が描いた線の要素(`data-connector-to`)を探して、動かす対象にする。
 * 見つからない線(自動配置の CSS の線など)は、対象から外す。ドラッグが確定したときに 1 回だけ呼ぶ(動かすたびには探さない)
 */
export function collectConnectorTargets(
  root: ConnectorRoot,
  boxes: readonly { id: string; box: Box }[],
): ConnectorTarget[] {
  const out: ConnectorTarget[] = []
  for (const { id, box } of boxes) {
    if (!SAFE_VALUE.test(id)) continue
    const path = root.querySelector(`[data-connector-to="${id}"] path`)
    const arrow = root.querySelector(`[data-connector-to="${id}"] polygon`)
    if (path && arrow) out.push({ id, box, path, arrow })
  }
  return out
}
