import { Link } from '@tanstack/react-router'
import { StageField } from '#/components/stage-field'

// 「404」の文字の絵。56 マス × 30 マスの白黒の絵(1 マス = 1 単位)。
// 太い書体で「404」を描き、数字の高さがマス目いっぱいになるよう大きさを決め、白黒にして作った。
// 横に連続する黒いマスを、1 本の帯(長方形)にまとめた SVG の path(118 本)。
// SVG なので、どれだけ拡大しても、マスの境目に線が出ない(文字の `█` を並べると、境目に細い隙間が出た)。
// `/device` のロゴ(6 行 × 25 文字)より細かいので、大きくしても、マス目が粗くならない
const ART_SIZE = { width: 56, height: 30 } as const
const ART_PATH =
  'M10 1h6v1h-6zM24 1h8v1h-8zM48 1h5v1h-5zM10 2h6v1h-6zM23 2h10v1h-10zM47 2h6v1h-6zM9 3h7v1h-7zM22 3h12v1h-12zM46 3h7v1h-7zM8 4h8v1h-8zM21 4h13v1h-13zM46 4h7v1h-7zM8 5h8v1h-8zM21 5h14v1h-14zM45 5h8v1h-8zM7 6h9v1h-9zM21 6h6v1h-6zM29 6h6v1h-6zM44 6h9v1h-9zM7 7h9v1h-9zM20 7h6v1h-6zM30 7h5v1h-5zM44 7h9v1h-9zM6 8h10v1h-10zM20 8h6v1h-6zM30 8h6v1h-6zM43 8h10v1h-10zM5 9h11v1h-11zM20 9h6v1h-6zM30 9h6v1h-6zM43 9h10v1h-10zM5 10h5v1h-5zM11 10h5v1h-5zM20 10h6v1h-6zM30 10h6v1h-6zM42 10h5v1h-5zM48 10h5v1h-5zM4 11h5v1h-5zM11 11h5v1h-5zM20 11h5v1h-5zM31 11h5v1h-5zM41 11h6v1h-6zM48 11h5v1h-5zM3 12h6v1h-6zM11 12h5v1h-5zM20 12h5v1h-5zM31 12h5v1h-5zM41 12h5v1h-5zM48 12h5v1h-5zM3 13h5v1h-5zM11 13h5v1h-5zM20 13h5v1h-5zM31 13h5v1h-5zM40 13h5v1h-5zM48 13h5v1h-5zM2 14h5v1h-5zM11 14h5v1h-5zM20 14h5v1h-5zM31 14h5v1h-5zM40 14h5v1h-5zM48 14h5v1h-5zM2 15h5v1h-5zM11 15h5v1h-5zM20 15h5v1h-5zM31 15h5v1h-5zM39 15h5v1h-5zM48 15h5v1h-5zM1 16h5v1h-5zM11 16h5v1h-5zM20 16h5v1h-5zM31 16h5v1h-5zM38 16h5v1h-5zM48 16h5v1h-5zM1 17h5v1h-5zM11 17h5v1h-5zM20 17h5v1h-5zM31 17h5v1h-5zM38 17h5v1h-5zM48 17h5v1h-5zM0 18h18v1h-18zM20 18h5v1h-5zM31 18h5v1h-5zM38 18h18v1h-18zM0 19h18v1h-18zM20 19h6v1h-6zM30 19h6v1h-6zM38 19h18v1h-18zM0 20h18v1h-18zM20 20h6v1h-6zM30 20h6v1h-6zM38 20h18v1h-18zM0 21h18v1h-18zM20 21h6v1h-6zM30 21h6v1h-6zM38 21h18v1h-18zM0 22h18v1h-18zM21 22h5v1h-5zM30 22h6v1h-6zM38 22h18v1h-18zM1 23h17v1h-17zM21 23h6v1h-6zM29 23h6v1h-6zM38 23h17v1h-17zM11 24h5v1h-5zM21 24h14v1h-14zM48 24h5v1h-5zM11 25h5v1h-5zM22 25h13v1h-13zM48 25h5v1h-5zM11 26h5v1h-5zM22 26h12v1h-12zM48 26h5v1h-5zM11 27h5v1h-5zM23 27h10v1h-10zM48 27h5v1h-5zM11 28h5v1h-5zM24 28h8v1h-8zM48 28h5v1h-5z'

/**
 * 「404」の文字の絵。読み上げには、「404」のラベルだけを使う(絵そのものは隠す)。
 * 大きさは、画面の幅に収まるように決める(上限 580px。狭い画面では、左右 2rem ずつ空けて、縮む)
 */
function Art() {
  return (
    <svg
      role="img"
      aria-label="404"
      viewBox={`0 0 ${ART_SIZE.width} ${ART_SIZE.height}`}
      className="mx-auto block h-auto w-[min(580px,calc(100vw-4rem))] fill-ink"
      // マスの斜めの階段を、くっきり出す(ぼかさない)
      shapeRendering="crispEdges"
    >
      <path d={ART_PATH} />
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
