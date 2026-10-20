import { useState } from 'react'
import { Github, LoaderCircle } from 'lucide-react'
import { authClient } from '#/lib/auth-client'

type Provider = 'github' | 'google'

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  )
}

const providers: {
  id: Provider
  label: string
  icon: React.ReactNode
  className: string
}[] = [
  {
    id: 'github',
    label: 'GitHub でログイン',
    icon: <Github className="h-5 w-5" aria-hidden="true" />,
    className:
      'bg-neutral-800 text-neutral-50 border-neutral-700 hover:bg-neutral-700',
  },
  {
    id: 'google',
    label: 'Google でログイン',
    icon: <GoogleLogo className="h-5 w-5" />,
    className: 'bg-white text-neutral-900 border-white hover:bg-neutral-200',
  },
]

/**
 * GitHub / Google のログインボタン。
 * ログイン後は、トップページ(`/`)に戻る。失敗したときは、`/login?error=…` に戻る。
 */
export function LoginButtons({ disabled }: { disabled?: boolean }) {
  const [pending, setPending] = useState<Provider | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  async function signIn(provider: Provider) {
    setPending(provider)
    setFailed(null)
    try {
      const origin = window.location.origin
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL: origin,
        errorCallbackURL: `${origin}/login`,
      })
      // 成功すると、ブラウザが認可画面に移動する。ここに来るのは、開始に失敗したとき
      if (error) {
        setFailed(error.message ?? 'ログインを開始できませんでした')
        setPending(null)
      }
    } catch {
      setFailed('サーバーに接続できませんでした。時間をおいて、もう一度お試しください')
      setPending(null)
    }
  }

  return (
    <div className="space-y-3">
      {providers.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={disabled || pending !== null}
          onClick={() => void signIn(p.id)}
          className={`flex w-full items-center justify-center gap-3 rounded-lg border px-5 py-3 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${p.className}`}
        >
          {pending === p.id ? (
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            p.icon
          )}
          {pending === p.id ? '移動しています…' : p.label}
        </button>
      ))}
      {failed && (
        <p role="alert" className="text-sm text-red-300">
          {failed}
        </p>
      )}
    </div>
  )
}
