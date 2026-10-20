import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Prompt } from '#/components/terminal'
import { api, ApiError, type Invitation } from '#/lib/api'

const buttonClass =
  'flex h-9 items-center justify-center border-2 border-outline bg-secondary px-3 text-sm text-outline transition-transform duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink active:translate-x-0 active:translate-y-0 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-none'

// 招待 1 件分の行。承認・拒否のどちらも、成功したら一覧を取り直す。
// 失敗(404/409)は、行を残してエラーを読めるようにする(取り直すと行ごと消える)
function InvitationRow({ invitation }: { invitation: Invitation }) {
  const queryClient = useQueryClient()
  const respond = useMutation({
    mutationFn: (action: 'accept' | 'reject') =>
      api(`/api/invitation/${invitation.invitationId}/${action}`, {
        method: 'POST',
      }),
    onSuccess: (_data, action) => {
      // 承認したら、サイドバーのプロダクト一覧にも反映する
      if (action === 'accept')
        void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['invitations'] })
    },
  })
  // 404/409 はその招待がもう無効なので、押せないままにする
  const stale =
    respond.error instanceof ApiError &&
    (respond.error.status === 404 || respond.error.status === 409)

  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words">{invitation.productName}</p>
          <p className="text-xs opacity-60">
            招待元: {invitation.leaderNames.join('、')}
          </p>
        </div>
        <button
          type="button"
          disabled={respond.isPending || stale}
          onClick={() => respond.mutate('accept')}
          className={buttonClass}
        >
          承認
        </button>
        <button
          type="button"
          disabled={respond.isPending || stale}
          onClick={() => respond.mutate('reject')}
          className={buttonClass}
        >
          拒否
        </button>
      </div>
      {respond.isError && (
        <p role="alert" className="border-l-2 border-ink pl-3 text-sm">
          ERR {respond.error.message}
        </p>
      )}
    </li>
  )
}

// ホームの「招待」セクション(自分宛ての保留中の招待)。0 件のときは何も出さない
export function InvitationList() {
  const invitations = useQuery({
    queryKey: ['invitations'],
    queryFn: () => api<Invitation[]>('/api/invitation'),
    retry: false,
  })

  if (invitations.isPending)
    return <p className="text-sm opacity-60">読み込み中…</p>
  if (invitations.isError)
    return (
      <p role="alert" className="border-l-2 border-ink pl-3 text-sm">
        ERR {invitations.error.message}
      </p>
    )
  if (invitations.data.length === 0) return null

  return (
    <div className="space-y-2">
      <Prompt>ls invitations</Prompt>
      <ul className="space-y-3 text-sm">
        {invitations.data.map((i) => (
          <InvitationRow key={i.invitationId} invitation={i} />
        ))}
      </ul>
    </div>
  )
}
