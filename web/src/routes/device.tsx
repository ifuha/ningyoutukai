import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, X } from 'lucide-react'
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
// 見た目はホーム(`/home`)に合わせる: 背景の山(DotField)の上に、細い等幅の見出し(`01 / …`)と、番号つきの罫線の行を並べる
export const Route = createFileRoute('/device')({
  validateSearch: (search: Record<string, unknown>): { user_code?: string } => {
    const code = typeof search.user_code === 'string' ? normalizeUserCode(search.user_code) : ''
    return code === '' ? {} : { user_code: code }
  },
  component: DevicePage,
})

/** 見出しの文言(ページの進み具合ごと) */
const headings: Record<DevicePhase, string> = {
  'enter-code': 'コードの入力',
  checking: 'コードの確認',
  confirm: 'コマンドラインのログイン',
  approved: '許可しました',
  denied: '拒否しました',
  error: '失敗しました',
}

function DevicePage() {
  const { data: session, isPending } = authClient.useSession()
  const { user_code: userCode } = Route.useSearch()

  // ログイン状態を確認している間は、背景だけ
  if (isPending) return <main className="dot-grid h-screen" />

  return (
    <main className="dot-grid flex min-h-screen justify-center px-4 py-6">
      <section aria-label="コマンドラインのログイン" className="relative z-10 w-full max-w-2xl">
        {/* 背景。ホームと同じ山の絵(アプリ共通のドットの上に重ねる) */}
        <DotField shape="char" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />
        <div className="mb-6 flex items-center justify-between gap-x-6 font-mono text-s">
          <span className="min-w-0 truncate opacity-70">
            &gt; {session?.user ? session.user.name : 'ningyoutukai login'}
          </span>
        </div>
        {session?.user ? (
          <Approve
            // コードが変わったら、最初から(確認・結果の状態を持ち越さない)
            key={userCode ?? ''}
            userCode={userCode}
            userName={session.user.name}
            userEmail={session.user.email}
          />
        ) : (
          <SignIn userCode={userCode} />
        )}
      </section>
    </main>
  )
}

/** ホームの見出し(`01 / プロダクト`)と同じ形 */
function Heading({ children }: { children: React.ReactNode }) {
  return <h1 className="font-mono text-s opacity-70">01 / {children}</h1>
}

/** 番号つきの罫線の行(ホームのプロダクト一覧の行と同じ形。リンクではなく、項目と値) */
function Row({
  index,
  label,
  children,
  note,
}: {
  index: number
  label: string
  children: React.ReactNode
  note?: string
}) {
  return (
    <li className="rise border-b border-line" style={{ animationDelay: `${(index - 1) * 70}ms` }}>
      <div className="flex min-h-12 items-center gap-5 py-2">
        <span className="w-8 shrink-0 pl-2 font-mono text-s opacity-70">{String(index).padStart(2, '0')}</span>
        <span className="w-24 shrink-0 text-s opacity-70">{label}</span>
        <span className="min-w-0 flex-1 break-words text-l font-medium">
          {children}
          {note && <span className="block text-s font-normal opacity-60">{note}</span>}
        </span>
      </div>
    </li>
  )
}

function Rows({ children }: { children: React.ReactNode }) {
  return <ol className="mt-4 border-t border-line bg-surface">{children}</ol>
}

/** エラー・通知(ホームと同じ、左に線の 1 行) */
function Notice({ role, children }: { role: 'alert' | 'status'; children: React.ReactNode }) {
  return (
    <p role={role} className="mt-4 border-l border-line pl-3 text-m">
      {children}
    </p>
  )
}

// ログインしていないとき: GitHub / Google のログイン。ログイン後に、同じコードの画面へ戻る
function SignIn({ userCode }: { userCode: string | undefined }) {
  return (
    <>
      <Heading>ログイン</Heading>
      <p className="mt-4 text-m">
        コマンドラインツールのログインを許可するには、まず、ここでログインしてください。
      </p>
      <div className="mt-4 max-w-md">
        <LoginButtons callbackPath={userCode ? `/device?user_code=${encodeURIComponent(userCode)}` : '/device'} />
      </div>
    </>
  )
}

function Approve({
  userCode,
  userName,
  userEmail,
}: {
  userCode: string | undefined
  userName: string
  userEmail: string
}) {
  if (!userCode) return <EnterCode />
  return <Confirm userCode={userCode} userName={userName} userEmail={userEmail} />
}

// コードが付いていない URL で開いたとき: コマンドラインに出たコードを入力する
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
      <Heading>{headings['enter-code']}</Heading>
      <p className="mt-4 text-m">コマンドラインに表示されたコードを入力してください。</p>
      <Rows>
        <Row index={1} label="コード">
          <input
            id="device-code"
            type="text"
            aria-label="コード"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABCD-EFGH"
            value={value}
            onChange={(e) => setValue(formatUserCode(e.target.value).slice(0, 9))}
            className="h-10 w-full bg-transparent font-mono text-l tracking-widest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </Row>
      </Rows>
      <div className="mt-4">
        <IconButton
          type="submit"
          icon={Check}
          label="確認"
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
function Confirm({
  userCode,
  userName,
  userEmail,
}: {
  userCode: string
  userName: string
  userEmail: string
}) {
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
        <Heading>{headings.checking}</Heading>
        <p className="mt-4 text-m opacity-60">コードを確認しています…</p>
      </>
    )
  }

  if (phase === 'error') {
    return (
      <>
        <Heading>{headings.error}</Heading>
        <Notice role="alert">ERR {message}</Notice>
        <p className="mt-4 text-m">
          <a
            href="/device"
            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          >
            コードを入力し直す
          </a>
        </p>
      </>
    )
  }

  if (phase === 'approved') {
    return (
      <>
        <Heading>{headings.approved}</Heading>
        <Notice role="status">コマンドラインに戻ってください。そのまま、ログインが完了します。</Notice>
        <p className="mt-4 text-s opacity-60">このページは、閉じて構いません。</p>
      </>
    )
  }

  if (phase === 'denied') {
    return (
      <>
        <Heading>{headings.denied}</Heading>
        <Notice role="status">コマンドラインのログインは、行われません。</Notice>
      </>
    )
  }

  return (
    <>
      <Heading>{headings.confirm}</Heading>
      <p className="mt-4 text-m">コマンドラインツールが、あなたのアカウントでのログインを求めています。</p>
      <Rows>
        <Row index={1} label="コード">
          <span className="font-mono font-bold tracking-widest">{formatUserCode(userCode)}</span>
        </Row>
        <Row index={2} label="アカウント" note={userEmail}>
          {userName}
        </Row>
      </Rows>
      <p className="mt-4 text-m">
        コマンドラインに表示されているコードと、同じですか? 違うときや、心当たりがないときは、許可しないでください。
      </p>
      {message && <Notice role="alert">ERR {message}</Notice>}
      <div className="mt-4 flex flex-wrap gap-3">
        <IconButton
          icon={Check}
          label="許可"
          showLabel
          variant="solid"
          side="bottom"
          disabled={busy}
          onClick={() => void decide('approve')}
        />
        <IconButton
          icon={X}
          label="拒否"
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
