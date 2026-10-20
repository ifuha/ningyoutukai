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

// Figma「login」: ロゴ(仮に、アプリ名の文字)と、2 つのボタンが、中央に縦に並ぶ
function Logo() {
  return (
    <h1 className="text-[clamp(3rem,8vw,6.25rem)] leading-normal font-normal">
      人形使い
    </h1>
  )
}

function Home() {
  const { data: session, isPending } = authClient.useSession()
  const { error } = Route.useSearch()

  // ログイン状態を確認している間は、背景だけを出す(ログイン画面が一瞬見えるのを避ける)
  if (isPending) return <main className="min-h-screen" />

  if (session?.user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
        <p className="text-2xl">{session.user.name}</p>
        <p className="text-base opacity-70">{session.user.email}</p>
        <button
          type="button"
          onClick={() => void authClient.signOut()}
          className="h-[60px] w-full max-w-[312px] border-2 border-outline text-xl hover:opacity-80"
        >
          ログアウト
        </button>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center px-4 pt-[clamp(4rem,30vh,19.5rem)] pb-16">
      <Logo />
      <div className="mt-[clamp(3rem,21vh,13.5rem)] flex w-full flex-col items-center gap-[25px]">
        <LoginButtons />
        {error && (
          <p role="alert" className="max-w-[448px] text-center text-base">
            {loginErrorMessage(error)}
          </p>
        )}
      </div>
    </main>
  )
}
