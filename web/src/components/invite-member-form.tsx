import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { eden, edenData } from '#/lib/eden'
import { errorMessage } from '#/lib/error-message'

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
        <input
          id="invite-member"
          type="text"
          autoComplete="off"
          placeholder="GitHub のユーザー名 または メールアドレス"
          value={value}
          readOnly={invite.isPending}
          onChange={(e) => setValue(e.target.value)}
          className="h-10 min-w-0 flex-1 shadow-box bg-surface px-3 font-mono text-l focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink read-only:opacity-60"
        />
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
