import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { Prompt, Terminal } from '#/components/terminal'
import { authClient } from '#/lib/auth-client'

// ホーム(`/home`)。ログイン必須。未ログインなら、ログイン画面(`/`)へ戻す(`AppShell` が行う)。
// いまは、ログイン中のユーザーと、所属しているプロダクトの一覧だけの仮の画面
// (Figma のホーム画面(サイドバーつき)ができたら、入れ替える)
export const Route = createFileRoute('/home')({ component: Home })

const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const

function Home() {
  const navigate = useNavigate()

  async function signOut() {
    await authClient.signOut()
    void navigate({ to: '/', replace: true })
  }

  return (
    <AppShell>
      {({ user, products }) => (
        <Terminal title="~/ningyoutukai — home">
          <Prompt>whoami</Prompt>
          <div>
            <p className="text-2xl font-bold">{user.name}</p>
            <p className="mt-1 text-sm opacity-70">{user.email}</p>
          </div>

          <div className="space-y-2">
            <Prompt>ls products</Prompt>
            {products.isPending ? (
              <p className="text-sm opacity-60">読み込み中…</p>
            ) : products.isError ? (
              <p role="alert" className="border-l-2 border-ink pl-3 text-sm">
                ERR {products.error.message}
              </p>
            ) : products.data.length === 0 ? (
              <p className="text-sm opacity-60"># まだプロダクトがありません</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {products.data.map((p) => (
                  <li key={p.productId} className="flex gap-3">
                    <span className="flex-1">{p.productName}</span>
                    <span className="opacity-60">{roleLabel[p.role]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-[60px] w-full items-center gap-3 border-2 border-outline px-4 text-left text-[16px] transition-transform duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-ink)] active:translate-x-0 active:translate-y-0 active:shadow-none"
          >
            <span className="flex-1">ログアウト</span>
            <span className="opacity-60" aria-hidden="true">
              ⏎
            </span>
          </button>
        </Terminal>
      )}
    </AppShell>
  )
}
