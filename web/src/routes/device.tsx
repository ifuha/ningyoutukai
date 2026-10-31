import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
// ドット絵風のフォント(DotGothic16)。このページだけで読み込む。文字の範囲ごとに分かれていて、使う文字の分だけ読み込まれる
import '@fontsource/dotgothic16/latin-400.css'
import '@fontsource/dotgothic16/japanese-400.css'
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
// 見た目は LazyVim(Neovim のターミナル UI)。ここでの人の仕事は 1 つ: **ターミナルに出ているコードと、ここのコードが同じか見比べて、
// 許可するか決める**。だから主役はコードで、LazyVim のダッシュボードのように、キー付きのメニュー(`a` 許可 / `d` 拒否)で選ぶ。
// - 配色は Tokyo Night(ライトは Tokyo Night Day)。アプリの明暗に従う(`styles.css` の `.tui`)
// - 枠線つきのウィンドウ(角に札)
// - 文字は DotGothic16 だけ(太字がないので、太字は使わない。大きさは 16px の倍数)
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

  // ログイン状態を確認している間は、空の画面(明るさのちらつきを避けるため、配色は先に当てる)
  if (isPending) return <main className="tui min-h-screen bg-(--tui-bg)" />

  return session?.user ? (
    <Approve
      // コードが変わったら、最初から(確認・結果の状態を持ち越さない)
      key={userCode ?? ''}
      userCode={userCode}
    />
  ) : (
    <SignIn userCode={userCode} />
  )
}

// ---------------------------------------------------------------- 枠(ロゴ・ウィンドウ・ステータスライン)

type Tone = 'blue' | 'green' | 'red' | 'purple'

const toneText: Record<Tone, string> = {
  blue: 'text-(--tui-blue)',
  green: 'text-(--tui-green)',
  red: 'text-(--tui-red)',
  purple: 'text-(--tui-purple)',
}

/**
 * ページの枠。LazyVim のダッシュボードのように、ロゴ → 枠線つきのウィンドウ。
 * 確認用の画面からも使えるよう、切り出してある
 */
export function DeviceFrame({ children }: { children: React.ReactNode }) {
  return (
    // `font-dot`: このページの文字をドット絵風にする。`[font-synthesis:none]`: 太字のない書体を、ブラウザが無理に太くして滲ませない
    <main className="tui flex min-h-screen flex-col bg-(--tui-bg) font-dot text-(--tui-fg) [font-synthesis:none]">
      <div className="flex flex-1 flex-col items-center px-4 pt-[12vh] pb-10">
        <header className="text-center">
          <p className="bg-linear-to-r from-(--tui-blue) to-(--tui-purple) bg-clip-text text-[64px] leading-[72px] text-transparent">
            人形使い
          </p>
        </header>
        <section
          aria-label="ターミナルのログイン"
          className="relative mt-10 w-full max-w-[34rem] border border-(--tui-border) px-5 pt-8 pb-6"
        >
          <span className="absolute -top-3 left-4 bg-(--tui-blue) px-3 text-[16px] leading-6 text-(--tui-bg-dark)">
            Device
          </span>
          {children}
        </section>
      </div>
    </main>
  )
}

// ---------------------------------------------------------------- 部品

/** 問い・見出し */
function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="text-[24px] leading-8 sm:text-[32px] sm:leading-10">{children}</h1>
}

/** 本文。`dim` はコメント色 */
function Body({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) {
  return <p className={`mt-4 text-[16px] leading-7 ${dim ? 'text-(--tui-comment)' : ''}`}>{children}</p>
}

/** エラー・結果の通知(左に色つきの線) */
function Notice({
  tone,
  role,
  children,
}: {
  tone: 'red' | 'green'
  role: 'alert' | 'status'
  children: React.ReactNode
}) {
  const color = tone === 'red' ? 'border-(--tui-red) text-(--tui-red)' : 'border-(--tui-green) text-(--tui-green)'
  return (
    <p role={role} className={`mt-4 border-l-2 pl-3 text-[16px] leading-7 ${color}`}>
      {children}
    </p>
  )
}

/**
 * 確認コード。カーソル行の背景(`cursorline`)に、青い文字。1 文字ずつ現れ、最後にカーソルが点滅する。
 * 読み上げには、まとめた 1 つのラベルを使う(1 文字ずつの `span` は隠す)
 */
function Code({ code, settled = false }: { code: string; settled?: boolean }) {
  const chars = [...formatUserCode(code)]
  return (
    <p
      role="img"
      aria-label={`確認コード ${chars.filter((c) => c !== '-').join(' ')}`}
      className={`mt-5 w-fit max-w-full bg-(--tui-cursorline) px-4 py-3 text-[32px] leading-none tracking-[0.06em] text-(--tui-blue) min-[400px]:text-[48px] sm:px-6 sm:py-4 ${settled ? 'opacity-60' : ''}`}
    >
      {chars.map((c, i) => (
        <span key={i} aria-hidden="true" className="code-char" style={{ '--i': i } as React.CSSProperties}>
          {c}
        </span>
      ))}
      {!settled && (
        <span
          aria-hidden="true"
          className="code-char cursor ml-[0.12em] inline-block h-[0.8em] w-[0.5em] translate-y-[0.06em] bg-(--tui-blue)"
          style={{ '--i': chars.length } as React.CSSProperties}
        />
      )}
    </p>
  )
}

/** LazyVim のダッシュボードのような、キー付きのメニューの行。カーソルが乗ると(フォーカスで)背景が付く */
function MenuRow({
  label,
  keyHint,
  tone,
  onClick,
  disabled,
  type = 'button',
}: {
  label: string
  keyHint: string
  tone: Tone
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-[16px] leading-6 hover:bg-(--tui-cursorline) focus-visible:bg-(--tui-cursorline) focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <kbd className="min-w-6 shrink-0 text-(--tui-yellow)">{keyHint}</kbd>
      <span className={`flex-1 ${toneText[tone]}`}>{label}</span>
    </button>
  )
}

/** 入力欄にいないときだけ効く、1 文字のショートカット(修飾キーつき・長押しは無視) */
function useKeys(keys: Record<string, () => void>, active: boolean) {
  useEffect(() => {
    if (!active) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const run = keys[e.key.toLowerCase()]
      if (run) {
        e.preventDefault()
        run()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
}

// ---------------------------------------------------------------- 画面

// ログインしていないとき: GitHub / Google のログイン。ログイン後に、同じコードの画面へ戻る
function SignIn({ userCode }: { userCode: string | undefined }) {
  const [pending, setPending] = useState<'github' | 'google' | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  async function signIn(provider: 'github' | 'google') {
    if (pending) return
    setPending(provider)
    setFailed(null)
    try {
      const origin = window.location.origin
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL: `${origin}/device${userCode ? `?user_code=${encodeURIComponent(userCode)}` : ''}`,
        errorCallbackURL: origin,
      })
      // 成功すると、ブラウザが認可画面に移動する。ここに来るのは、開始に失敗したとき
      if (error) {
        setFailed('ログインを開始できませんでした。時間をおいて、もう一度お試しください')
        setPending(null)
      }
    } catch {
      setFailed('サーバーに接続できませんでした。時間をおいて、もう一度お試しください')
      setPending(null)
    }
  }

  useKeys({ g: () => void signIn('github'), o: () => void signIn('google') }, pending === null)

  return (
    <DeviceFrame>
      <Title>先にログインしてください</Title>
      <Body dim>ターミナルのログインを許可するには、ここでログインが必要です。</Body>
      <div className="-mx-3 mt-5">
        <MenuRow
          label={pending === 'github' ? '移動しています…' : 'GitHub でログイン'}
          keyHint="g"
          tone="blue"
          disabled={pending !== null}
          onClick={() => void signIn('github')}
        />
        <MenuRow
          label={pending === 'google' ? '移動しています…' : 'Google でログイン'}
          keyHint="o"
          tone="green"
          disabled={pending !== null}
          onClick={() => void signIn('google')}
        />
      </div>
      {failed && (
        <Notice tone="red" role="alert">
          {failed}
        </Notice>
      )}
    </DeviceFrame>
  )
}

function Approve({ userCode }: { userCode: string | undefined }) {
  if (!userCode) return <EnterCode />
  return <Confirm userCode={userCode} />
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
    <DeviceFrame>
      <form onSubmit={submit}>
        <Title>ターミナルのコードを入力</Title>
        <Body dim>`login` を実行すると、ターミナルに 8 文字のコードが出ます。</Body>
        <input
          id="device-code"
          type="text"
          aria-label="ターミナルに出たコード"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          placeholder="ABCD-EFGH"
          value={value}
          onChange={(e) => setValue(formatUserCode(e.target.value).slice(0, 9))}
          className="mt-5 w-full max-w-[22rem] bg-(--tui-cursorline) px-4 py-3 text-[32px] leading-none tracking-[0.06em] text-(--tui-blue) placeholder:text-(--tui-comment) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tui-blue) min-[400px]:text-[48px] sm:px-6 sm:py-4"
        />
        <div className="-mx-3 mt-5">
          <MenuRow
            type="submit"
            label="コードを確認"
            keyHint="Enter"
            tone="blue"
            disabled={!isCompleteUserCode(value)}
          />
        </div>
      </form>
    </DeviceFrame>
  )
}

// コードが付いているとき: 開いた時点で確認(claim)し、許可・拒否を選ばせる
function Confirm({ userCode }: { userCode: string }) {
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

  return (
    <ConfirmView
      phase={phase}
      userCode={userCode}
      message={message}
      busy={busy}
      onDecide={(kind) => void decide(kind)}
    />
  )
}

/** 確認ページの見た目だけ(通信を持たない)。進み具合ごとの画面を、そのまま描ける */
export function ConfirmView({
  phase,
  userCode,
  message,
  busy,
  onDecide,
}: {
  phase: DevicePhase
  userCode: string
  message: string | null
  busy: boolean
  onDecide: (kind: 'approve' | 'deny') => void
}) {
  // 許可・拒否を選べるのは、確認の画面だけ。a で許可、d で拒否
  useKeys({ a: () => onDecide('approve'), d: () => onDecide('deny') }, phase === 'confirm' && !busy)

  const frame = (children: React.ReactNode) => (
    <DeviceFrame>
      {children}
    </DeviceFrame>
  )

  if (phase === 'checking') {
    return frame(
      <>
        <Title>コードを確認しています</Title>
        <Body dim>少しお待ちください。</Body>
      </>,
    )
  }

  if (phase === 'error') {
    return frame(
      <>
        <Title>コードを確認できませんでした</Title>
        <Notice tone="red" role="alert">
          {message}
        </Notice>
        <Body>
          <a
            href="/device"
            className="text-(--tui-blue) underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--tui-blue)"
          >
            コードを入力し直す
          </a>
        </Body>
      </>,
    )
  }

  if (phase === 'approved') {
    return frame(
      <>
        <Title>許可しました</Title>
        <Code code={userCode} settled />
        <Notice tone="green" role="status">
          ターミナルに戻ってください。ログインは、そのまま完了します。
        </Notice>
        <Body dim>このページは、閉じて構いません。</Body>
      </>,
    )
  }

  if (phase === 'denied') {
    return frame(
      <>
        <Title>許可しませんでした</Title>
        <Code code={userCode} settled />
        <Notice tone="red" role="status">
          ターミナルのログインは、行われません。
        </Notice>
      </>,
    )
  }

  return frame(
    <>
      <Title>ターミナルのコードと同じですか?</Title>
      <Code code={userCode} />
      <Body dim>違う、または心当たりがないときは、許可しないでください。</Body>
      {message && (
        <Notice tone="red" role="alert">
          {message}
        </Notice>
      )}
      <div className="-mx-3 mt-6">
        <MenuRow
          label="ログインを許可"
          keyHint="a"
          tone="green"
          disabled={busy}
          onClick={() => onDecide('approve')}
        />
        <MenuRow
          label="許可しない"
          keyHint="d"
          tone="red"
          disabled={busy}
          onClick={() => onDecide('deny')}
        />
      </div>
    </>,
  )
}
