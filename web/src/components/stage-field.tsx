import { DotField } from '#/components/dot-field'

// 人形劇の舞台。「人形使い」(人形を操る人)にちなんだ背景で、ホームの山の絵(`DotField`)と同じ、記号の濃さで描く絵。
// 左右に、ひだのある幕。上に、波形の縁の飾り幕。下に、手前に向かって板の継ぎ目が広がる床。
// 中央の上から、3 本の糸が、ロゴ(吊るされた人形)へ降りる。幕の間(舞台の奥)は、何も描かない。
// 画面の中央は、ページの窓が隠すので、絵が見えるのは、左右の幕と、上と下の縁

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** 上の飾り幕の、下の縁(波形)。ny がこれより上なら、飾り幕 */
export function valanceBottom(nx: number): number {
  return 0.055 + 0.022 * Math.abs(Math.sin(nx * Math.PI * 10))
}

/** 幕の、内側の縁(画面の端からの距離)。上は広く、下へ向かって絞る(たくし上げた幕) */
export function curtainEdge(ny: number, t: number): number {
  return 0.13 + 0.07 * Math.pow(1 - ny, 1.6) + 0.006 * Math.sin(ny * 18 + t * 0.4)
}

/** 床の始まり(画面の高さの割合) */
export const FLOOR_TOP = 0.8
/** 床の手前の縁(フットライトの帯)の始まり。床の奥(0)から手前(1)までの割合 */
export const LIP_Z = 0.93

/** 糸の、横の位置(画面の幅の割合)。ロゴの真上に、3 本 */
export const STRING_X = [0.46, 0.5, 0.54] as const
/** 糸の、下の端(画面の高さの割合)。ロゴは、これより下から始まる */
export const STRING_BOTTOM = 0.115

/** 時刻 t(秒)の、点 (nx, ny) の大きさ(0〜1)。nx / ny は 0〜1 の位置 */
export function stageSize(nx: number, ny: number, t: number): number {
  const vb = valanceBottom(nx)
  // 上の飾り幕
  if (ny < vb) return 0.34 + 0.12 * Math.sin(nx * 120)

  // 糸(中央の上から、ロゴへ)
  if (ny < STRING_BOTTOM && STRING_X.some((x) => Math.abs(nx - x) < 0.0065)) return 0.5

  // 左右の幕(端からの距離 d は、左右で対称)
  const d = Math.min(nx, 1 - nx)
  const edge = curtainEdge(ny, t)
  if (d < edge) {
    // ひだ(縦縞)。ゆっくり揺れる
    const fold = 0.5 + 0.5 * Math.sin(d * 140 + Math.sin(ny * 6) * 1.2 + Math.sin(t * 0.35) * 0.6)
    const rim = smooth(edge - 0.03, edge, d) * 0.1 // 縁に近いほど濃い(影)
    return Math.min(0.6, 0.14 + 0.32 * fold + rim)
  }

  // 床
  if (ny > FLOOR_TOP) {
    const z = (ny - FLOOR_TOP) / (1 - FLOOR_TOP) // 0(奥)〜 1(手前)
    // 舞台の手前の縁(画面の下の端。フットライトの帯)
    if (z > LIP_Z) return 0.5
    // 奥の壁との境目(巾木)
    if (z < 0.04) return 0.32
    // 板の継ぎ目: 奥ほど中央に集まる(遠近)
    const seam = smooth(0.8, 1, Math.abs(Math.sin(((nx - 0.5) / (0.25 + z)) * 14)))
    return 0.08 + 0.2 * seam
  }

  // 幕の間(舞台の奥): 何も描かない
  return 0
}

// 端で薄れさせない(幕と床が、画面の端まで届く)。毎回同じ関数を渡す(`DotField` が、描き直しの条件に使うため)
const noFade = () => 1

/** 舞台の絵の背景(canvas) */
export function StageField({ className }: { className?: string }) {
  return <DotField shape="char" scene={stageSize} fade={noFade} className={className} />
}
