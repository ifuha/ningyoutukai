import { createFileRoute } from '@tanstack/react-router'
import { LoginButtons } from '#/components/login-buttons'
import { authClient } from '#/lib/auth-client'

// ログインに失敗すると、better-auth が `/?error=コード` に戻してくる
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  component: Home,
})

const errorMessages: Record<string, string> = {
  access_denied: 'ログインがキャンセルされました。もう一度お試しください',
  email_not_found:
    'メールアドレスを取得できませんでした。GitHub のメールアドレスを公開設定にして、もう一度お試しください',
}

function loginErrorMessage(code: string) {
  return errorMessages[code] ?? 'ログインできませんでした。もう一度お試しください'
}

// ターミナル風のウィンドウ(開発者向けのログイン画面)。角丸は使わない
function Terminal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="w-full max-w-[560px] border-2 border-ink bg-surface font-mono shadow-[6px_6px_0_0_var(--color-ink)]">
      <header className="flex items-center gap-3 border-b-2 border-ink px-4 py-2 text-xs">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 border-2 border-ink" />
          <span className="h-2.5 w-2.5 border-2 border-ink" />
          <span className="h-2.5 w-2.5 border-2 border-ink bg-ink" />
        </span>
        <span className="opacity-70">{title}</span>
      </header>
      <div className="space-y-5 p-6 sm:p-8">{children}</div>
    </section>
  )
}

function Prompt({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px]">
      <span className="opacity-60" aria-hidden="true">
        ${' '}
      </span>
      {children}
    </p>
  )
}

function Home() {
  const { data: session, isPending } = authClient.useSession()
  const { error } = Route.useSearch()

  // ログイン状態を確認している間は、背景だけを出す(ログイン画面が一瞬見えるのを避ける)
  if (isPending) return <main className="dot-grid h-screen" />

  if (session?.user) {
    return (
      <main className="dot-grid flex h-screen items-center justify-center px-4">
        <Terminal title="~/ningyoutukai — session">
          <Prompt>whoami</Prompt>
          <div>
            <p className="text-2xl font-bold">{session.user.name}</p>
            <p className="mt-1 text-sm opacity-70">{session.user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void authClient.signOut()}
            className="flex h-[60px] w-full items-center gap-3 border-2 border-outline px-4 text-left text-[16px] transition-transform duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-ink)] active:translate-x-0 active:translate-y-0 active:shadow-none"
          >
            <span className="flex-1">ログアウト</span>
            <span className="opacity-60" aria-hidden="true">
              ⏎
            </span>
          </button>
        </Terminal>
      </main>
    )
  }

  return (
    <main className="dot-grid flex h-screen items-center justify-center px-4">
      <Terminal title="~/ningyoutukai — login">
        <h1 className="text-[clamp(2.25rem,7vw,3.5rem)] leading-tight font-bold tracking-tight">
          人形使い
        </h1>
        <div className="space-y-1">
          <Prompt>
            ningyoutukai login
            <span className="cursor ml-1 inline-block h-[1.1em] w-[0.6em] translate-y-[0.2em] bg-ink" aria-hidden="true" />
          </Prompt>
          <p className="text-sm opacity-60"># 誰が、いつ、何をしているか。ひと目で。</p>
        </div>
        <div className="space-y-3">
          <p className="text-sm">? どのアカウントで続けますか?</p>
          <LoginButtons />
          {error && (
            <p role="alert" className="border-l-2 border-ink pl-3 text-sm">
              ERR {loginErrorMessage(error)}
            </p>
          )}
        </div>
        <p className="text-xs opacity-60">キーボードの 1 / 2 でも選べます</p>
      </Terminal>
    </main>
  )
}
