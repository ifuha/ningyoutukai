import { Link, useLocation } from '@tanstack/react-router'
import { Prompt, Terminal } from '#/components/terminal'
import { displayPath } from '#/lib/not-found-path'

/**
 * 見つからないページ(404)。ログイン画面と同じ、ターミナル風の枠。
 * 「開こうとしたパスが、見つからなかった」という、コマンドの出力の形にする。
 * 戻り先は `/home`(未ログインなら、AppShell が、ログイン画面 `/` に移す)
 */
export function NotFound() {
  const pathname = useLocation({ select: (l) => l.pathname })

  return (
    <main className="dot-grid flex min-h-screen items-center justify-center px-4 py-10">
      <Terminal title="~/ningyoutukai — 404">
        <h1 className="text-[clamp(2.25rem,7vw,3.5rem)] leading-tight font-bold tracking-tight">404</h1>
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
