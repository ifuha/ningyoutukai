import { Link } from '@tanstack/react-router'
import { StageField } from '#/components/stage-field'

// 「404」の絵。figlet の書体「BlurVision ASCII」(7 行 × 40 列。濃淡の文字 ░ ▒ ▓ █ だけでできている。各棒の左右が、段々濃くなって、ぼやける)。
// 文字のままだと、大きくしたとき、文字と文字の境目に細い線が出るため、SVG で描く。
// 濃淡の質感(細かい点)を残すため、濃さごとに、べた塗り(█)と、点のパターン(▓ 75%・▒ 50%・░ 25%)を描き分ける。
// 同じ濃さが横に続くマスは、1 本の長方形にまとめた。1 マスは、幅 6 × 高さ 10 の単位(等幅の文字の、幅 : 高さ = 0.6 : 1)。図の大きさは 240 × 70
const ART_SIZE = { width: 240, height: 70 } as const
const ART_SOLID = 'M18 0h6v10h-6zM60 0h6v10h-6zM96 0h48v10h-48zM174 0h6v10h-6zM216 0h6v10h-6zM18 10h6v10h-6zM60 10h6v10h-6zM96 10h6v10h-6zM138 10h6v10h-6zM174 10h6v10h-6zM216 10h6v10h-6zM18 20h6v10h-6zM60 20h6v10h-6zM96 20h6v10h-6zM138 20h6v10h-6zM174 20h6v10h-6zM216 20h6v10h-6zM18 30h48v10h-48zM96 30h6v10h-6zM138 30h6v10h-6zM174 30h48v10h-48zM60 40h6v10h-6zM96 40h6v10h-6zM138 40h6v10h-6zM216 40h6v10h-6zM60 50h6v10h-6zM96 50h6v10h-6zM138 50h6v10h-6zM216 50h6v10h-6zM60 60h6v10h-6zM96 60h48v10h-48zM216 60h6v10h-6z'
const ART_D75 = 'M12 0h6v10h-6zM24 0h6v10h-6zM54 0h6v10h-6zM66 0h6v10h-6zM90 0h6v10h-6zM144 0h6v10h-6zM168 0h6v10h-6zM180 0h6v10h-6zM210 0h6v10h-6zM222 0h6v10h-6zM12 10h6v10h-6zM24 10h6v10h-6zM54 10h6v10h-6zM66 10h6v10h-6zM90 10h6v10h-6zM102 10h6v10h-6zM132 10h6v10h-6zM144 10h6v10h-6zM168 10h6v10h-6zM180 10h6v10h-6zM210 10h6v10h-6zM222 10h6v10h-6zM12 20h6v10h-6zM24 20h6v10h-6zM54 20h6v10h-6zM66 20h6v10h-6zM90 20h6v10h-6zM102 20h6v10h-6zM132 20h6v10h-6zM144 20h6v10h-6zM168 20h6v10h-6zM180 20h6v10h-6zM210 20h6v10h-6zM222 20h6v10h-6zM12 30h6v10h-6zM66 30h6v10h-6zM90 30h6v10h-6zM102 30h6v10h-6zM132 30h6v10h-6zM144 30h6v10h-6zM168 30h6v10h-6zM222 30h6v10h-6zM54 40h6v10h-6zM66 40h6v10h-6zM90 40h6v10h-6zM102 40h6v10h-6zM132 40h6v10h-6zM144 40h6v10h-6zM210 40h6v10h-6zM222 40h6v10h-6zM54 50h6v10h-6zM66 50h6v10h-6zM90 50h6v10h-6zM102 50h6v10h-6zM132 50h6v10h-6zM144 50h6v10h-6zM210 50h6v10h-6zM222 50h6v10h-6zM54 60h6v10h-6zM66 60h6v10h-6zM90 60h6v10h-6zM144 60h6v10h-6zM210 60h6v10h-6zM222 60h6v10h-6z'
const ART_D50 = 'M6 0h6v10h-6zM30 0h6v10h-6zM48 0h6v10h-6zM72 0h6v10h-6zM84 0h6v10h-6zM150 0h6v10h-6zM162 0h6v10h-6zM186 0h6v10h-6zM204 0h6v10h-6zM228 0h6v10h-6zM6 10h6v10h-6zM30 10h6v10h-6zM48 10h6v10h-6zM72 10h6v10h-6zM84 10h6v10h-6zM108 10h6v10h-6zM126 10h6v10h-6zM150 10h6v10h-6zM162 10h6v10h-6zM186 10h6v10h-6zM204 10h6v10h-6zM228 10h6v10h-6zM6 20h6v10h-6zM30 20h6v10h-6zM48 20h6v10h-6zM72 20h6v10h-6zM84 20h6v10h-6zM108 20h6v10h-6zM126 20h6v10h-6zM150 20h6v10h-6zM162 20h6v10h-6zM186 20h6v10h-6zM204 20h6v10h-6zM228 20h6v10h-6zM6 30h6v10h-6zM72 30h6v10h-6zM84 30h6v10h-6zM108 30h6v10h-6zM126 30h6v10h-6zM150 30h6v10h-6zM162 30h6v10h-6zM228 30h6v10h-6zM48 40h6v10h-6zM72 40h6v10h-6zM84 40h6v10h-6zM108 40h6v10h-6zM126 40h6v10h-6zM150 40h6v10h-6zM204 40h6v10h-6zM228 40h6v10h-6zM48 50h6v10h-6zM72 50h6v10h-6zM84 50h6v10h-6zM108 50h6v10h-6zM126 50h6v10h-6zM150 50h6v10h-6zM204 50h6v10h-6zM228 50h6v10h-6zM48 60h6v10h-6zM72 60h6v10h-6zM84 60h6v10h-6zM150 60h6v10h-6zM204 60h6v10h-6zM228 60h6v10h-6z'
const ART_D25 = 'M0 0h6v10h-6zM36 0h12v10h-12zM78 0h6v10h-6zM156 0h6v10h-6zM192 0h12v10h-12zM234 0h6v10h-6zM0 10h6v10h-6zM36 10h12v10h-12zM78 10h6v10h-6zM114 10h12v10h-12zM156 10h6v10h-6zM192 10h12v10h-12zM234 10h6v10h-6zM0 20h6v10h-6zM36 20h12v10h-12zM78 20h6v10h-6zM114 20h12v10h-12zM156 20h6v10h-6zM192 20h12v10h-12zM234 20h6v10h-6zM0 30h6v10h-6zM78 30h6v10h-6zM114 30h12v10h-12zM156 30h6v10h-6zM234 30h6v10h-6zM42 40h6v10h-6zM78 40h6v10h-6zM114 40h12v10h-12zM156 40h6v10h-6zM198 40h6v10h-6zM234 40h6v10h-6zM42 50h6v10h-6zM78 50h6v10h-6zM114 50h12v10h-12zM156 50h6v10h-6zM198 50h6v10h-6zM234 50h6v10h-6zM42 60h6v10h-6zM78 60h6v10h-6zM156 60h6v10h-6zM198 60h6v10h-6zM234 60h6v10h-6z'

// 点のパターン。1 マス(幅 6 × 高さ 10)を、横 6 列 × 縦 10 行の細かい点(1 点 = 1 単位)に分け、濃さに合わせて、縦の列に点を置く:
// ▓ は 5 列(約 83%)、▒ は 3 列(50%)、░ は 1〜2 列(約 25%)。実際のフォントの ░ ▒ ▓ の被覆率(21% / 49% / 86%)に近い。
// 縦の列にそろえると、元の絵の、縦の筋のような質感になる(点がばらけると、ノイズに見える)。
// 各配列は、点を置く列(0〜5)。縦に 2 点ずつの短い棒を 5 本重ねて、1 本おきに、横に 1 点ずらす(まっすぐな縦縞に見えないように)
const PATTERN_COLS = {
  'nf-d75': [0, 1, 3, 4, 5],
  'nf-d50': [0, 2, 4],
  'nf-d25': [1, 4],
} as const

function Patterns() {
  return (
    <defs>
      {Object.entries(PATTERN_COLS).map(([id, cols]) => (
        <pattern key={id} id={id} width={6} height={10} patternUnits="userSpaceOnUse">
          {cols.map((c) => (
            // 縦に 2 点ずつの、短い棒(1 マスに、縦 5 本。1 本おきに、横に 1 点ずらす)
            [0, 1, 2, 3, 4].map((r) => (
              <rect key={`${c}-${r}`} x={(c + (r % 2)) % 6} y={r * 2} width={1} height={2} fill="currentColor" />
            ))
          ))}
        </pattern>
      ))}
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
      <Patterns />
      {/* 上から下へ、薄い → 濃い(上端 40%、下端 100%)。絵全体に、縦のグラデーションをかける */}
      <linearGradient id="nf-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
        <stop offset="1" stopColor="#fff" stopOpacity="1" />
      </linearGradient>
      <mask id="nf-fade-mask" maskContentUnits="objectBoundingBox">
        <rect width="1" height="1" fill="url(#nf-fade)" />
      </mask>
      <g mask="url(#nf-fade-mask)">
        <path d={ART_D25} fill="url(#nf-d25)" />
        <path d={ART_D50} fill="url(#nf-d50)" />
        <path d={ART_D75} fill="url(#nf-d75)" />
        <path d={ART_SOLID} fill="currentColor" />
      </g>
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
