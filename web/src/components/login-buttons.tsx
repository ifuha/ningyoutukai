import { useState } from 'react'
import { authClient } from '#/lib/auth-client'

type Provider = 'github' | 'google'

// Figma「login」のボタン: 幅 448 / 高さ 90、文字 24px、ボタンの間隔 25px
// GitHub は塗りつぶし、Google は枠線(ライト / ダークの色は styles.css のトークン)
const providers: { id: Provider; label: string; className: string }[] = [
  {
    id: 'github',
    label: 'GitHubではじめる',
    className: 'bg-primary text-on-primary border-2 border-primary',
  },
  {
    id: 'google',
    label: 'Googleではじめる',
    className: 'bg-secondary text-outline border-2 border-outline',
  },
]

/**
 * GitHub / Google のログインボタン。
 * ログイン画面はトップページ(`/`)。ログインしたあとも、失敗したときも、`/` に戻る
 * (失敗したときは、`/?error=…` の形で、理由が付く)。
 */
export function LoginButtons() {
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
        errorCallbackURL: origin,
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
    <div className="flex w-full max-w-[448px] flex-col gap-[25px]">
      {providers.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={pending !== null}
          onClick={() => void signIn(p.id)}
          className={`flex h-[90px] w-full items-center justify-center px-6 text-[24px] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${p.className}`}
        >
          {pending === p.id ? '移動しています…' : p.label}
        </button>
      ))}
      {failed && (
        <p role="alert" className="text-center text-base">
          {failed}
        </p>
      )}
    </div>
  )
}
