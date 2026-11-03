import { Link, useLocation } from '@tanstack/react-router'
import { StageField } from '#/components/stage-field'
import { Prompt } from '#/components/terminal'
import { displayPath } from '#/lib/not-found-path'

// 「404」の文字の絵(ANSI Shadow。`/device` のロゴと同じ書体)。6 行・25 文字幅。真ん中の「0」の中心は、全体の中心(50%)
const ART = [
  '██╗  ██╗ ██████╗ ██╗  ██╗',
  '██║  ██║██╔═████╗██║  ██║',
  '███████║██║██╔██║███████║',
  '╚════██║████╔╝██║╚════██║',
  '     ██║╚██████╔╝     ██║',
  '     ╚═╝ ╚═════╝      ╚═╝',
]

/**
 * 「404」の文字の絵。読み上げには、「404」のラベルだけを使う(1 文字ずつの絵は隠す)
 */
function Art() {
  return (
    <div role="img" aria-label="404" className="not-found-art mx-auto w-fit">
      <div
        // 行の高さは、文字の大きさと同じ(`leading-none`)。罫線の文字が、上下に隙間なくつながる(`/device` のロゴと同じ)
        className="text-[min(26px,calc((100vw-6rem)/15))] leading-none"
        style={{ fontFamily: 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace' }}
      >
        {ART.map((line, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="block whitespace-pre"
            // 上から下へ、ごくわずかに薄く(文字色を、紙の色に混ぜる。薄くしすぎると、細い罫線が背景に溶ける)
            style={{ color: `color-mix(in srgb, var(--color-ink) ${100 - i * 4}%, var(--color-surface))` }}
          >
            {line}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * 見つからないページ(404)。幕が開いた舞台に、誰もいない。
 * 窓(枠)は使わず、舞台の上に直接置く。左右の幕に重なる文字は、周りの記号を、紙の色のにじみで消す(`.not-found-halo`)。
 * 文言は、ログイン画面と同じ、ターミナル風(開こうとしたパスが、見つからなかった、というコマンドの出力)。
 * 戻り先は `/home`(未ログインなら、AppShell が、ログイン画面 `/` に移す)
 */
export function NotFound() {
  const pathname = useLocation({ select: (l) => l.pathname })

  return (
    <main className="relative isolate flex min-h-screen flex-col items-center px-4 pt-[16vh] pb-10 font-mono">
      <StageField className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />
      <div className="stage-in flex w-full max-w-[26rem] flex-col gap-8">
        <Art />
        <div className="not-found-halo space-y-1">
          <Prompt>
            cd <span className="break-all">{displayPath(pathname)}</span>
            <span className="cursor ml-1 inline-block h-[1.1em] w-[0.6em] translate-y-[0.2em] bg-ink" aria-hidden="true" />
          </Prompt>
          <p role="alert" className="border-l border-line pl-3 text-m">
            ERR ページが見つかりません
          </p>
        </div>
        <Link
          to="/home"
          className="shadow-box self-start bg-surface px-4 py-2 text-m hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ホームへ戻る
        </Link>
      </div>
    </main>
  )
}
