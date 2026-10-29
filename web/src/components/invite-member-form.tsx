import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { eden, edenData } from '#/lib/eden'
import { errorMessage } from '#/lib/error-message'
import { candidateValue, moveActive } from '#/lib/invite-candidate'
import { useInviteCandidates } from '#/lib/use-invite-candidates'

// 入力が `@` を含み、先頭が `@` でなければメール、それ以外は GitHub のユーザー名として送る
// (先頭の `@` は、api が取り除く)
function toBody(value: string) {
  return value.includes('@') && !value.startsWith('@')
    ? { email: value }
    : { githubId: value }
}

// 「メンバーを招待」のフォーム(リーダーにだけ出す)。見た目は暫定(ターミナル風)
export function InviteMemberForm({ productId }: { productId: string }) {
  const [value, setValue] = useState('')
  const [invited, setInvited] = useState<string | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const candidates = useInviteCandidates(productId, value).data ?? []
  const showList = listOpen && value.trim() !== '' && candidates.length > 0

  function pick(index: number) {
    const c = candidates[index]
    if (!c) return
    setValue(candidateValue(c))
    setListOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && showList) {
      e.preventDefault()
      e.stopPropagation() // モーダルまで閉じない
      setListOpen(false)
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && candidates.length > 0) {
      e.preventDefault()
      setListOpen(true)
      setActive((i) => moveActive(i, e.key === 'ArrowDown' ? 1 : -1, candidates.length))
    } else if (e.key === 'Enter' && showList && active >= 0) {
      e.preventDefault() // 送信せず、候補を入れる
      pick(active)
    }
  }

  const invite = useMutation({
    mutationFn: (invitee: string) =>
      edenData(
        eden().api.product({ productId }).invitation.post(toBody(invitee)),
      ),
    onSuccess: (_data, invitee) => {
      setInvited(invitee)
      setValue('')
    },
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const invitee = value.trim()
    if (invitee === '' || invite.isPending) return
    setInvited(null)
    invite.mutate(invitee)
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="invite-member" className="block text-m font-bold">
        メンバーを招待
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <input
            id="invite-member"
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls="invite-member-candidates"
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `invite-candidate-${active}` : undefined}
            autoComplete="off"
            placeholder="名前・GitHub のユーザー名・メールアドレス"
            value={value}
            readOnly={invite.isPending}
            onChange={(e) => {
              setValue(e.target.value)
              setListOpen(true)
              setActive(-1)
            }}
            onFocus={() => setListOpen(true)}
            onBlur={() => setListOpen(false)}
            onKeyDown={onKeyDown}
            className="h-10 w-full border border-line bg-surface px-3 font-mono text-l focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink read-only:opacity-60"
          />
          {showList && (
            <ul
              id="invite-member-candidates"
              role="listbox"
              className="absolute inset-x-0 top-full z-10 mt-1 border border-line bg-surface shadow-lg"
            >
              {candidates.map((c, i) => (
                <li
                  key={c.userId}
                  id={`invite-candidate-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // blur より先に選ぶ(クリックで入力欄のフォーカスが外れて、リストが消えないように)
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(i)
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-m ${i === active ? 'bg-ink text-surface' : ''}`}
                >
                  {c.avatarUrl ? (
                    <img
                      src={c.avatarUrl}
                      alt=""
                      className="size-8 shrink-0 border border-current object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center border border-current font-bold"
                    >
                      {[...c.userName][0] ?? '?'}
                    </span>
                  )}
                  <span className="font-bold">{c.userName}</span>
                  <span className="min-w-0 truncate font-mono">{candidateValue(c)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <IconButton
          type="submit"
          icon={Send}
          label="招待"
          showLabel
          variant="outline"
          side="bottom"
          disabled={invite.isPending}
        />
      </div>
      {invite.isError && (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {errorMessage(invite.error.message)}
        </p>
      )}
      {invited && !invite.isError && (
        <p role="status" className="border-l border-line pl-3 text-m">
          招待しました: {invited}
        </p>
      )}
    </form>
  )
}
