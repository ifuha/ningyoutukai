import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, X } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { LoginButtons } from '#/components/login-buttons'
import { Prompt, Terminal } from '#/components/terminal'
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
// コードを開いた時点で、api に「このコードを、この人が確認した」と伝える(別の人が横から承認できないようにする仕組み)
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
    <main className="dot-grid flex min-h-screen items-center justify-center px-4 py-6">
      <Terminal title="~/ningyoutukai — device">
        <h1 className="text-[clamp(1.5rem,5vw,2.25rem)] leading-tight font-bold tracking-tight">
          コマンドラインのログイン
        </h1>
        {session?.user ? (
          <Approve
            // コードが変わったら、最初から(確認・結果の状態を持ち越さない)
            key={userCode ?? ''}
            userCode={userCode}
            userName={session.user.name}
            userEmail={session.user.email}
          />
        ) : (
          <div className="space-y-3">
            <Prompt>ningyoutukai login</Prompt>
            <p className="text-m">
              コマンドラインツールのログインを許可するには、まず、ここでログインしてください。
            </p>
            <LoginButtons
              callbackPath={userCode ? `/device?user_code=${encodeURIComponent(userCode)}` : '/device'}
            />
          </div>
        )}
      </Terminal>
    </main>
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
    <form onSubmit={submit} className="space-y-3">
      <p className="text-m">コマンドラインに表示されたコードを入力してください。</p>
      <label htmlFor="device-code" className="block text-m font-bold">
        コード
      </label>
      <input
        id="device-code"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="ABCD-EFGH"
        value={value}
        onChange={(e) => setValue(formatUserCode(e.target.value).slice(0, 9))}
        className="h-12 w-full shadow-box bg-surface px-3 font-mono text-l tracking-widest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      />
      <IconButton
        type="submit"
        icon={Check}
        label="確認"
        showLabel
        variant="outline"
        side="bottom"
        disabled={!isCompleteUserCode(value)}
      />
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
    return <p className="text-m opacity-60">コードを確認しています…</p>
  }

  if (phase === 'error') {
    return (
      <div className="space-y-3">
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {message}
        </p>
        <a href="/device" className="text-m underline underline-offset-4">
          コードを入力し直す
        </a>
      </div>
    )
  }

  if (phase === 'approved') {
    return (
      <div className="space-y-3">
        <p role="status" className="text-m">
          <span className="font-bold">許可しました。</span>
          コマンドラインに戻ってください。そのまま、ログインが完了します。
        </p>
        <p className="text-s opacity-60">このページは、閉じて構いません。</p>
      </div>
    )
  }

  if (phase === 'denied') {
    return (
      <p role="status" className="text-m">
        <span className="font-bold">拒否しました。</span>
        コマンドラインのログインは、行われません。
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-m">
        コマンドラインツールが、あなたのアカウントでのログインを求めています。
      </p>
      <dl className="space-y-1 text-m">
        <div className="flex gap-3">
          <dt className="w-20 shrink-0 opacity-60">コード</dt>
          <dd className="font-mono font-bold tracking-widest">{formatUserCode(userCode)}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-20 shrink-0 opacity-60">アカウント</dt>
          <dd className="min-w-0 break-words">
            {userName}
            <span className="block text-s opacity-60">{userEmail}</span>
          </dd>
        </div>
      </dl>
      <p className="text-m">
        コマンドラインに表示されているコードと、同じですか? 違うときや、心当たりがないときは、許可しないでください。
      </p>
      {message && (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
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
    </div>
  )
}
