import { Copy, KeyRound, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconButton } from '#/components/icon-button'
import { createAiToken, listAiTokens, revokeAiToken, type AiTokenInfo } from '#/lib/document-api'
import { formatDocDate } from '#/lib/document-tree'
import { TOKEN_ACTIVE_MAX, TOKEN_DAYS_DEFAULT, TOKEN_NAME_MAX, activeCount, envLine, parseTokenDays, tokenNameError, tokenState, tokenStateLabel } from '#/lib/ai-token-ui'
import { retryDelay, retryTransient } from '#/lib/query-retry'

// ユーザー設定の「AI のトークン」。仕様は docs/v4.0/overview.md
// - AI(Claude Code など)に、**あなたのタスク**と、**そのタスクに渡された文書**を読ませ、**報告の下書き**を保存させるための鍵。AI は、あなたが使う道具
// - AI にできるのは、それだけ。プロダクトの変更や、文書の書き込み、自分でタスクを完了にすることはできない。報告は、あなたが確認して出す
// - 中身(pmai_…)は、発行したときに**一度だけ**表示する。取り消すと、すぐ使えなくなる。有効なトークンは 10 個まで

const inputClass = 'h-10 min-w-0 shadow-box bg-panel px-2 text-m text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60'

export function AiTokenSettings() {
  const queryClient = useQueryClient()
  const key = ['me', 'ai-tokens'] as const
  const tokens = useQuery({ queryKey: key, queryFn: listAiTokens, retry: retryTransient, retryDelay })
  const [name, setName] = useState('')
  const [days, setDays] = useState(String(TOKEN_DAYS_DEFAULT))
  const [formError, setFormError] = useState<string | null>(null)
  // 発行した直後の、中身(一度だけ表示する)
  const [issued, setIssued] = useState<{ token: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => createAiToken({ name: name.trim(), expiresInDays: parseTokenDays(days) ?? TOKEN_DAYS_DEFAULT }),
    onSuccess: async (created) => {
      setIssued({ token: created.token, name: created.name })
      setCopied(false)
      setName('')
      await queryClient.invalidateQueries({ queryKey: key })
    },
  })
  const revoke = useMutation({
    mutationFn: (tokenId: string) => revokeAiToken(tokenId),
    onSuccess: async () => {
      setConfirmId(null)
      await queryClient.invalidateQueries({ queryKey: key })
    },
  })

  const active = tokens.data ? activeCount(tokens.data) : 0

  const submit = () => {
    const problem = tokenNameError(name) ?? (parseTokenDays(days) === null ? '期限は 1〜365 の整数(日)で入力してください' : null)
    setFormError(problem)
    if (!problem) create.mutate()
  }

  return (
    <div className="space-y-4">
      <p className="text-m">
        AI(Claude Code など)に、<strong className="font-bold">あなたのタスク</strong>と、そのタスクに<strong className="font-bold">渡された文書</strong>を読ませ、
        <strong className="font-bold">報告の下書き</strong>を保存させるための鍵です。AI はあなたが使う道具で、できるのはそれだけです。プロダクトの変更や、文書の書き込み、タスクを自分で完了にすることはできません。下書きは、あなたが確認して、完了報告に出します。
      </p>

      {issued && (
        <div role="status" className="space-y-2 shadow-box bg-side-item p-3">
          <p className="text-m font-bold">「{issued.name}」のトークンを発行しました</p>
          <p className="text-s">このトークンは、<strong className="font-bold">今回しか表示されません</strong>。AI を動かす環境に、次のように設定してください(`pm login` は要りません)。</p>
          <pre className="overflow-x-auto bg-panel p-2 font-mono text-s select-all">{envLine(issued.token)}</pre>
          <div className="flex flex-wrap gap-2">
            <IconButton
              icon={Copy}
              label={copied ? 'コピーしました' : '設定の行をコピー'}
              showLabel
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(envLine(issued.token)).then(() => setCopied(true), () => setCopied(false))
              }}
            />
            <IconButton icon={X} label="閉じる(もう表示されません)" showLabel size="sm" variant="outline" onClick={() => setIssued(null)} />
          </div>
        </div>
      )}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h3 className="text-m font-bold">新しいトークンを発行する</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="block text-s">名前(どの AI か)</span>
            <input value={name} maxLength={TOKEN_NAME_MAX} placeholder="例: Claude Code(仕事用)" disabled={create.isPending} onChange={(e) => setName(e.target.value)} className={`${inputClass} w-64 max-w-full`} />
          </label>
          <label className="space-y-1">
            <span className="block text-s">期限(日。1〜365)</span>
            <input inputMode="numeric" value={days} maxLength={3} disabled={create.isPending} onChange={(e) => setDays(e.target.value)} className={`${inputClass} w-20 text-right`} />
          </label>
          <IconButton type="submit" icon={KeyRound} label="発行" showLabel variant="outline" className="bg-panel" disabled={create.isPending || !name.trim() || active >= TOKEN_ACTIVE_MAX} />
        </div>
        {active >= TOKEN_ACTIVE_MAX && <p className="text-s">有効なトークンは {TOKEN_ACTIVE_MAX} 個までです。使っていないものを取り消してください。</p>}
        {(formError || create.isError) && (
          <p role="alert" className="border-l border-line pl-3 text-m">
            {formError ?? `ERR ${create.error?.message}`}
          </p>
        )}
      </form>

      <section className="space-y-1" aria-label="発行したトークン">
        <h3 className="text-m font-bold">
          発行したトークン <span className="text-s font-normal opacity-70">(有効 {active} 個)</span>
        </h3>
        {tokens.isPending ? (
          <p className="text-m opacity-60">読み込み中…</p>
        ) : tokens.isError ? (
          <p role="alert" className="border-l border-line pl-3 text-m">
            ERR {tokens.error.message}
          </p>
        ) : tokens.data.length === 0 ? (
          <p className="text-m opacity-70"># まだありません</p>
        ) : (
          <ul className="divide-y divide-line">
            {tokens.data.map((t) => (
              <TokenRow
                key={t.tokenId}
                token={t}
                confirming={confirmId === t.tokenId}
                pending={revoke.isPending && revoke.variables === t.tokenId}
                onAskRevoke={() => setConfirmId(t.tokenId)}
                onCancel={() => setConfirmId(null)}
                onRevoke={() => revoke.mutate(t.tokenId)}
              />
            ))}
          </ul>
        )}
        {revoke.isError && (
          <p role="alert" className="border-l border-line pl-3 text-m">
            ERR {revoke.error.message}
          </p>
        )}
      </section>
    </div>
  )
}

/** トークン 1 件(表示)。取り消しは 2 段階(「取り消す」→「取り消す(確定)」) */
export function TokenRow({
  token,
  confirming,
  pending,
  onAskRevoke,
  onCancel,
  onRevoke,
}: {
  token: AiTokenInfo
  confirming?: boolean
  pending?: boolean
  onAskRevoke: () => void
  onCancel: () => void
  onRevoke: () => void
}) {
  const state = tokenState(token)
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-m font-medium" title={token.name}>
          {token.name} <span className="font-mono text-s font-normal opacity-60">{token.tokenPrefix}…</span>
        </p>
        <p className="text-s opacity-70">
          <span data-state={state}>{tokenStateLabel[state]}</span> · 期限 {formatDocDate(token.expiresAt)} · {token.lastUsedAt ? `最後に使った ${formatDocDate(token.lastUsedAt)}` : 'まだ使われていません'}
        </p>
      </div>
      {state === 'active' &&
        (confirming ? (
          <div className="flex gap-1">
            <IconButton icon={Trash2} label="取り消す(確定)" showLabel size="sm" variant="danger-solid" disabled={pending} onClick={onRevoke} />
            <IconButton icon={X} label="やめる" size="sm" variant="outline" disabled={pending} onClick={onCancel} />
          </div>
        ) : (
          <IconButton icon={Trash2} label="取り消す" size="sm" side="left" variant="danger" onClick={onAskRevoke} />
        ))}
    </li>
  )
}
