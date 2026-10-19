import { createFileRoute } from '@tanstack/react-router'
import { authClient } from '#/lib/auth-client'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const { data: session, isPending } = authClient.useSession()

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-20 text-neutral-50">
      <section className="mx-auto max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-xl">
        <p className="text-sm font-medium text-indigo-300">人形使い</p>
        <h1 className="mt-3 text-3xl font-bold">Googleログイン</h1>
        <p className="mt-3 text-neutral-300">
          Googleアカウントでログインして、アプリを利用します。
        </p>

        {isPending ? (
          <p className="mt-8 text-sm text-neutral-400">ログイン状態を確認中…</p>
        ) : session?.user ? (
          <div className="mt-8 flex items-center gap-4">
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                className="h-12 w-12 rounded-full"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{session.user.name}</p>
              <p className="truncate text-sm text-neutral-400">
                {session.user.email}
              </p>
            </div>
            <button
              onClick={() => void authClient.signOut()}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800"
            >
              ログアウト
            </button>
          </div>
        ) : (
          <button
            onClick={() =>
              void authClient.signIn.social({
                provider: 'google',
                callbackURL: window.location.origin,
              })
            }
            className="mt-8 w-full rounded-lg bg-white px-5 py-3 font-semibold text-neutral-900 hover:bg-neutral-200"
          >
            Googleでログイン
          </button>
        )}
      </section>
    </main>
  )
}
