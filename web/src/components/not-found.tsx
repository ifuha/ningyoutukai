import { Link } from '@tanstack/react-router'
import { StageField } from '#/components/stage-field'

// 「404」の絵。figlet の書体「DOS Rebel」(8 行 × 38 列。べたの塊 █ と、右下の影 ░ だけでできている)。
// 文字のままだと、大きくしたとき、文字と文字の境目に細い線が出るため、SVG で描く。
// 塊は、べた塗り。影(░ = 約 25%)は、細かい点のパターンで描く(質感を残すため)。
// 同じ文字が横に続くマスは、1 本の長方形にまとめた。1 マスは、幅 6 × 高さ 10 の単位(等幅の文字の、幅 : 高さ = 0.6 : 1)。図の大きさは 228 × 80
const ART_SIZE = { width: 228, height: 80 } as const
const ART_SOLID = 'M6 0h30v10h-30zM42 0h30v10h-30zM102 0h30v10h-30zM156 0h30v10h-30zM192 0h30v10h-30zM12 10h18v10h-18zM48 10h18v10h-18zM90 10h18v10h-18zM126 10h18v10h-18zM162 10h18v10h-18zM198 10h18v10h-18zM12 20h18v10h-18zM48 20h18v10h-18zM72 20h6v10h-6zM84 20h18v10h-18zM132 20h18v10h-18zM162 20h18v10h-18zM198 20h18v10h-18zM222 20h6v10h-6zM12 30h66v10h-66zM84 30h18v10h-18zM132 30h18v10h-18zM162 30h66v10h-66zM48 40h18v10h-18zM72 40h6v10h-6zM84 40h18v10h-18zM132 40h18v10h-18zM198 40h18v10h-18zM222 40h6v10h-6zM48 50h18v10h-18zM90 50h18v10h-18zM126 50h18v10h-18zM198 50h18v10h-18zM42 60h30v10h-30zM102 60h30v10h-30zM192 60h30v10h-30z'
const ART_SHADOW = 'M0 10h12v10h-12zM36 10h12v10h-12zM108 10h18v10h-18zM150 10h12v10h-12zM186 10h12v10h-12zM6 20h6v10h-6zM42 20h6v10h-6zM120 20h12v10h-12zM156 20h6v10h-6zM192 20h6v10h-6zM6 30h6v10h-6zM78 30h6v10h-6zM126 30h6v10h-6zM156 30h6v10h-6zM6 40h42v10h-42zM66 40h6v10h-6zM78 40h6v10h-6zM126 40h6v10h-6zM156 40h42v10h-42zM216 40h6v10h-6zM42 50h6v10h-6zM66 50h6v10h-6zM78 50h12v10h-12zM192 50h6v10h-6zM216 50h6v10h-6zM84 60h18v10h-18zM132 60h6v10h-6zM36 70h30v10h-30zM96 70h36v10h-36zM186 70h30v10h-30z'

// 影(░)の点のパターン。1 マス(幅 6 × 高さ 10)を、横 6 列 × 縦 10 行の細かい点(1 点 = 1 × 1 の単位)に分け、点を網目に置く。
// 実際のフォントの ░ は、点がまばらで、一様な網目(被覆率 約 21%)。縦の棒にすると、雨だれのように見えるので、1 点ずつの四角にする。
// 横に 2 点おき、縦に 2 点おきに、1 点(1/4 = 25%)。1 行おきに、横に 1 点ずらす(千鳥にして、縦縞に見えないように)
const SHADOW_DOTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [2, 0], [4, 0],
  [1, 2], [3, 2], [5, 2],
  [0, 4], [2, 4], [4, 4],
  [1, 6], [3, 6], [5, 6],
  [0, 8], [2, 8], [4, 8],
]

function ShadowPattern() {
  return (
    <defs>
      <pattern id="nf-shadow" width={6} height={10} patternUnits="userSpaceOnUse">
        {SHADOW_DOTS.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
        ))}
      </pattern>
    </defs>
  )
}

/**
 * 「404」の絵。読み上げには、「404」のラベルだけを使う(絵そのものは隠す)。
 * 大きさは、画面の幅に収まるように決める(上限 560px。狭い画面では、左右 2rem ずつ空けて、縮む)。
 * 色は、文字色(`text-ink`)に連動する。ライト・ダークで、自動で切り替わる
 */
function Art() {
  return (
    <svg
      role="img"
      aria-label="404"
      viewBox={`0 0 ${ART_SIZE.width} ${ART_SIZE.height}`}
      className="mx-auto block h-auto w-[min(560px,calc(100vw-4rem))] text-ink"
      shapeRendering="crispEdges"
    >
      <ShadowPattern />
      <path d={ART_SHADOW} fill="url(#nf-shadow)" />
      <path d={ART_SOLID} fill="currentColor" />
    </svg>
  )
}

/**
 * 見つからないページ(404)。幕が開いた舞台に、誰もいない。
 * 窓(枠)は使わず、舞台の上に直接置く。左右の幕の記号に重なる文字は、周りの記号を、紙の色のにじみで消す(`.not-found-halo`)。
 * 文言は、ログイン画面と同じ、ターミナル風。戻り先は `/home`(未ログインなら、AppShell が、ログイン画面 `/` に移す)
 */
export function NotFound() {
  return (
    <main className="relative isolate flex min-h-screen flex-col items-center px-4 pt-[16vh] pb-10 font-mono">
      <StageField className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />
      <div className="stage-in flex w-full max-w-[40rem] flex-col gap-8">
        <Art />
        <p role="alert" className="not-found-halo mx-auto border-l border-line pl-3 text-m">
          ERR ページが見つかりません
        </p>
        <Link
          to="/home"
          className="shadow-box mx-auto bg-surface px-4 py-2 text-m hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ホームへ戻る
        </Link>
      </div>
    </main>
  )
}
