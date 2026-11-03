import { Link, useLocation } from '@tanstack/react-router'
import { StageField } from '#/components/stage-field'
import { Prompt, Terminal } from '#/components/terminal'
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
 * 糸が切れた人形。真ん中の「0」を人形の頭に見立てる。
 * 上から下りていた糸(窓の上端から)は、「0」の少し上で途切れ、切れた先の短い糸が、「0」の上で、ゆらっと揺れて止まる
 * (ページを開いたときの 1 回だけ。動きを減らす設定では、止めたまま)。
 * 読み上げには、「404」のラベルだけを使う(絵は隠す)
 */
function Art() {
  return (
    <div role="img" aria-label="404" className="not-found-art relative mx-auto w-fit pt-14">
      {/* 上から下りてきた糸(窓の上端から、「0」の上の、切れ目まで) */}
      <span aria-hidden="true" className="absolute top-0 left-1/2 h-9 w-px bg-ink opacity-60" />
      {/* 切れた先の短い糸。「0」の上端を支点に、揺れて止まる */}
      <span
        aria-hidden="true"
        className="not-found-string absolute left-1/2 top-[2.75rem] h-3 w-px origin-bottom bg-ink opacity-60"
      />
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
 * 見つからないページ(404)。舞台の幕が閉じて、糸の切れた人形が、「404」の下に落ちている。
 * 窓の中は、ログイン画面と同じ、ターミナル風(開こうとしたパスが、見つからなかった、というコマンドの出力)。
 * 戻り先は `/home`(未ログインなら、AppShell が、ログイン画面 `/` に移す)
 */
export function NotFound() {
  const pathname = useLocation({ select: (l) => l.pathname })

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center px-4 py-10">
      {/* 幕は、閉じたまま(舞台に、出せるものがない) */}
      <StageField closed className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />
      <Terminal title="~/ningyoutukai — 404">
        <Art />
        <div className="space-y-1">
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
          className="shadow-box inline-block px-4 py-2 text-m hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ホームへ戻る
        </Link>
      </Terminal>
    </main>
  )
}
