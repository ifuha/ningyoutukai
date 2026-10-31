import { useMemo } from 'react'
import { DotField } from '#/components/dot-field'

// 人形劇の舞台。「人形使い」(人形を操る人)にちなんだ背景で、ホームの山の絵(`DotField`)と同じ、記号の濃さで描く絵。
// 左右に、ひだのある幕。上に、波形の縁の飾り幕。(床は描かない。幕との区別が付きにくくなるため、幕だけにした)
// 中央の上から、3 本の糸が、ロゴ(吊るされた人形)へ降りる。幕の間(舞台の奥)は、何も描かない。
// 画面の中央は、ページの窓が隠すので、絵が見えるのは、左右の幕と、上の縁。
// ページを開いたとき、幕は閉じていて(中央で合わさる)、左右へ開いていく(`openProgress`)。

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

/** 幕が閉じているあいだの、内側の縁(画面の端からの距離)。端から 0.5 は、中央で合わさる位置 */
const CLOSED_EDGE = 0.52
/** 幕が開き始めるまでの待ち(秒)と、開ききるまでの時間(秒) */
export const OPEN_DELAY_SEC = 0.05
export const OPEN_SEC = 0.45

/**
 * 幕の開き具合(0 = 閉じている 〜 1 = 開ききった)。ページを開いてからの経過時間(秒)から決める。
 * 最初に少し止まり、そのあとゆっくり動き出して、最後に静かに止まる(出だしは遅く、終わりは緩やか)
 */
export function openProgress(elapsedSec: number): number {
  const p = Math.min(1, Math.max(0, (elapsedSec - OPEN_DELAY_SEC) / OPEN_SEC))
  return 1 - Math.pow(1 - p, 3)
}

/** 糸の、横の位置(画面の幅の割合)。ロゴの真上に、3 本 */
export const STRING_X = [0.46, 0.5, 0.54] as const
/** 糸の、下の端(画面の高さの割合)。ロゴは、これより下から始まる */
export const STRING_BOTTOM = 0.115

/**
 * 時刻 t(秒)の、点 (nx, ny) の大きさ(0〜1)。nx / ny は 0〜1 の位置。
 * `open`: 幕の開き具合(0 = 閉じている 〜 1 = 開ききった。既定は開ききった)
 */
export function stageSize(nx: number, ny: number, t: number, open = 1): number {
  const vb = valanceBottom(nx)
  // 上の飾り幕
  if (ny < vb) return 0.34 + 0.12 * Math.sin(nx * 120)

  // 糸(中央の上から、ロゴへ)
  if (ny < STRING_BOTTOM && STRING_X.some((x) => Math.abs(nx - x) < 0.0065)) return 0.5

  // 左右の幕(端からの距離 d は、左右で対称)
  const d = Math.min(nx, 1 - nx)
  // 閉じているときの縁から、開ききったときの縁へ、動く(縁より外側が幕。縁が動くと、ひだが現れ・隠れる)
  const edge = CLOSED_EDGE + (curtainEdge(ny, t) - CLOSED_EDGE) * open
  if (d < edge) {
    // ひだ(縦縞)。ゆっくり揺れる
    const fold = 0.5 + 0.5 * Math.sin(d * 140 + Math.sin(ny * 6) * 1.2 + Math.sin(t * 0.35) * 0.6)
    const rim = smooth(edge - 0.03, edge, d) * 0.1 // 縁に近いほど濃い(影)
    return Math.min(0.6, 0.14 + 0.32 * fold + rim)
  }

  // 幕の間(舞台の奥)と、その下: 何も描かない
  return 0
}

// 端で薄れさせない(幕が、画面の端まで届く)。毎回同じ関数を渡す(`DotField` が、描き直しの条件に使うため)
const noFade = () => 1

/**
 * 舞台の絵の背景(canvas)。マウントしたときから、幕が開いていく。
 * 動きを減らす設定のときは、最初から開ききった絵(止まった絵は、時刻 0 で 1 枚だけ描かれるので、閉じたまま残らないようにする)
 */
export function StageField({ className }: { className?: string }) {
  // 描く絵は、毎回同じ関数を渡す(`DotField` が、描き直しの条件に使うため)。マウントした時刻を、ここで控える
  const scene = useMemo(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // `DotField` が渡す時刻は、`requestAnimationFrame` のもの(`performance.now()` と同じ時計)
    const startedAt = typeof performance !== 'undefined' ? performance.now() / 1000 : 0
    return (nx: number, ny: number, t: number) =>
      stageSize(nx, ny, t, reduce ? 1 : openProgress(t - startedAt))
  }, [])
  return <DotField shape="char" scene={scene} fade={noFade} className={className} />
}
