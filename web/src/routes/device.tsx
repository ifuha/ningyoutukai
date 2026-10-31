import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, X } from 'lucide-react'
// ドット絵風のフォント(DotGothic16)。このページだけで読み込む。文字の範囲ごとに分かれていて、使う文字の分だけ読み込まれる
import '@fontsource/dotgothic16/latin-400.css'
import '@fontsource/dotgothic16/japanese-400.css'
import { DotField } from '#/components/dot-field'
import { IconButton } from '#/components/icon-button'
import { LoginButtons } from '#/components/login-buttons'
import { authClient } from '#/lib/auth-client'
import {
  deviceErrorMessage,
  formatUserCode,
  isCompleteUserCode,
  normalizeUserCode,
  type DevicePhase,
} from '#/lib/device-login'

// CLI のログインの承認ページ(`/device`)。コマンドラインツールの `login` が出したコードを、ログイン中の人が許可・拒否する
// (docs/v3.0/cli.md の「3.2 ログインの流れ」)。ログイン必須。URL の `user_code` にコードが付いていれば、入力を省ける。
// コードを開いた時点で、api に「このコードを、この人が確認した」と伝える(別の人が横から承認できないようにする仕組み)。
//
// 見た目(frontend-design の手順で設計):
// - ここでの人の仕事は 1 つ: **ターミナルに出ているコードと、ここのコードが同じか見比べて、許可するか決める**。
//   だから主役は、そのコード。墨の地に紙の文字で大きく出し(64px。9 文字が 34rem の列に収まる大きさ。狭い画面は 36px まで縮む)、開いたときに 1 文字ずつ打たれていく(動きはこの 1 回だけ)。
// - 文字は DotGothic16 だけ(太字がないので、太字は使わない。大きさは 16px の倍数で、ドットをくっきり出す: コード 64、見出し 32、本文 16)。
// - 番号・ラベル・罫線の行は使わない(手順の連なりではないので、番号は意味を持たない)。区切りは余白で行う。
// - 背景は、ホームと同じ山の絵。
export const Route = createFileRoute('/device')({
  validateSearch: (search: Record<string, unknown>): { user_code?: string } => {
    const code = typeof search.user_code === 'string' ? normalizeUserCode(search.user_code) : ''
    return code === '' ? {} : { user_code: code }
  },
  component: DevicePage,
})

function DevicePage() {
  const { data: session, isPending } = authClient.useSession()
  const { user_code: userCode } = Route.useSearch()

  // ログイン状態を確認している間は、背景だけ
  if (isPending) return <main className="dot-grid h-screen" />

  return (
    // `font-dot`: このページの文字をドット絵風にする。`--font-mono` も同じフォントにして、`font-mono` の部分(ログインボタン)も揃える。
    // `[font-synthesis:none]`: 太字のない書体を、ブラウザが無理に太くして滲ませない
    <main className="dot-grid flex min-h-screen justify-center px-4 py-10 font-dot [--font-mono:var(--font-dot)] [font-synthesis:none] sm:py-16">
      <section aria-label="ターミナルのログイン" className="relative z-10 w-full max-w-[34rem]">
        {/* 背景。ホームと同じ山の絵(アプリ共通のドットの上に重ねる) */}
        <DotField shape="char" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />
        {session?.user ? (
          <Approve
            // コードが変わったら、最初から(確認・結果の状態を持ち越さない)
            key={userCode ?? ''}
            userCode={userCode}
            userName={session.user.name}
          />
        ) : (
          <SignIn userCode={userCode} />
        )}
      </section>
    </main>
  )
}

/** ページの問い・見出し(32px) */
function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="text-[32px] leading-10">{children}</h1>
}

/** 本文(16px) */
function Body({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) {
  return <p className={`mt-4 text-[16px] leading-7 ${dim ? 'opacity-70' : ''}`}>{children}</p>
}

/** エラー・結果の通知(左に線の 1 行) */
function Notice({ role, children }: { role: 'alert' | 'status'; children: React.ReactNode }) {
  return (
    <p role={role} className="mt-4 border-l-2 border-ink pl-3 text-[16px] leading-7">
      {children}
    </p>
  )
}

/**
 * 確認コード。墨の地に紙の文字(このページで唯一の重い面)。1 文字ずつ現れ、最後にカーソルが点滅する。
 * 読み上げには、まとめた 1 つのラベルを使う(1 文字ずつの `span` は隠す)
 */
function Code({ code, settled = false }: { code: string; settled?: boolean }) {
  const formatted = formatUserCode(code)
  const chars = [...formatted]
  return (
    <p
      role="img"
      aria-label={`確認コード ${chars.filter((c) => c !== '-').join(' ')}`}
      className={`mt-6 bg-ink px-5 py-6 text-[clamp(36px,12vw,64px)] leading-none tracking-[0.06em] text-surface sm:px-8 sm:py-8 ${settled ? 'opacity-60' : ''}`}
    >
      {chars.map((c, i) => (
        <span key={i} aria-hidden="true" className="code-char" style={{ '--i': i } as React.CSSProperties}>
          {c}
        </span>
      ))}
      {!settled && (
        <span
          aria-hidden="true"
          className="code-char cursor ml-[0.12em] inline-block h-[0.8em] w-[0.5em] translate-y-[0.06em] bg-surface"
          style={{ '--i': chars.length } as React.CSSProperties}
        />
      )}
    </p>
  )
}

// ログインしていないとき: GitHub / Google のログイン。ログイン後に、同じコードの画面へ戻る
function SignIn({ userCode }: { userCode: string | undefined }) {
  return (
    <>
      <Title>先にログインしてください</Title>
      <Body>ターミナルのログインを許可するには、ここでログインが必要です。</Body>
      <div className="mt-6 max-w-md">
        <LoginButtons callbackPath={userCode ? `/device?user_code=${encodeURIComponent(userCode)}` : '/device'} />
      </div>
    </>
  )
}

function Approve({ userCode, userName }: { userCode: string | undefined; userName: string }) {
  if (!userCode) return <EnterCode />
  return <Confirm userCode={userCode} userName={userName} />
}

// コードが付いていない URL で開いたとき: ターミナルに出たコードを入力する
function EnterCode() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isCompleteUserCode(value)) return
    void navigate({ to: '/device', search: { user_code: normalizeUserCode(value) } })
  }

  return (
    <form onSubmit={submit}>
      <Title>ターミナルのコードを入力</Title>
      <Body>`login` を実行すると、ターミナルに 8 文字のコードが出ます。</Body>
      <input
        id="device-code"
        type="text"
        aria-label="ターミナルに出たコード"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="ABCD-EFGH"
        value={value}
        onChange={(e) => setValue(formatUserCode(e.target.value).slice(0, 9))}
        className="mt-6 w-full bg-ink px-5 py-6 text-[clamp(36px,12vw,64px)] leading-none tracking-[0.06em] text-surface placeholder:text-surface/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink sm:px-8 sm:py-8"
      />
      <div className="mt-6">
        <IconButton
          type="submit"
          icon={Check}
          label="コードを確認"
          showLabel
          variant="outline"
          side="bottom"
          disabled={!isCompleteUserCode(value)}
        />
      </div>
    </form>
  )
}

// コードが付いているとき: 開いた時点で確認(claim)し、許可・拒否を選ばせる
function Confirm({ userCode, userName }: { userCode: string; userName: string }) {
  const [phase, setPhase] = useState<DevicePhase>('checking')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPhase('checking')
    void authClient
      .device({ query: { user_code: userCode } })
      .then(({ error }) => {
        if (cancelled) return
        if (error) {
          setMessage(deviceErrorMessage((error as { error?: string }).error))
          setPhase('error')
        } else {
          setPhase('confirm')
        }
      })
      .catch(() => {
        if (cancelled) return
        setMessage(deviceErrorMessage(undefined))
        setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [userCode])

  async function decide(kind: 'approve' | 'deny') {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const { error } =
        kind === 'approve'
          ? await authClient.device.approve({ userCode })
          : await authClient.device.deny({ userCode })
      if (error) {
        setMessage(deviceErrorMessage((error as { error?: string }).error))
        setPhase('error')
      } else {
        setPhase(kind === 'approve' ? 'approved' : 'denied')
      }
    } catch {
      setMessage(deviceErrorMessage(undefined))
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'checking') {
    return (
      <>
        <Title>コードを確認しています</Title>
        <Body dim>少しお待ちください。</Body>
      </>
    )
  }

  if (phase === 'error') {
    return (
      <>
        <Title>コードを確認できませんでした</Title>
        <Notice role="alert">{message}</Notice>
        <Body>
          <a
            href="/device"
            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          >
            コードを入力し直す
          </a>
        </Body>
      </>
    )
  }

  if (phase === 'approved') {
    return (
      <>
        <Title>許可しました</Title>
        <Code code={userCode} settled />
        <Notice role="status">ターミナルに戻ってください。ログインは、そのまま完了します。</Notice>
        <Body dim>このページは、閉じて構いません。</Body>
      </>
    )
  }

  if (phase === 'denied') {
    return (
      <>
        <Title>許可しませんでした</Title>
        <Code code={userCode} settled />
        <Notice role="status">ターミナルのログインは、行われません。</Notice>
      </>
    )
  }

  return (
    <>
      <Title>ターミナルのコードと同じですか?</Title>
      <Code code={userCode} />
      <Body>{userName} のアカウントで、ターミナルのログインを許可します。</Body>
      <Body dim>違う、または心当たりがないときは、許可しないでください。</Body>
      {message && <Notice role="alert">{message}</Notice>}
      <div className="mt-8 flex flex-wrap gap-3">
        <IconButton
          icon={Check}
          label="ログインを許可"
          showLabel
          variant="solid"
          side="bottom"
          disabled={busy}
          onClick={() => void decide('approve')}
        />
        <IconButton
          icon={X}
          label="許可しない"
          showLabel
          variant="outline"
          side="bottom"
          disabled={busy}
          onClick={() => void decide('deny')}
        />
      </div>
    </>
  )
}
