import type { Invitation } from '#/lib/invitation'
import { useRespondInvitation } from '#/lib/use-respond-invitation'

const buttonClass =
  'flex h-8 flex-1 items-center justify-center border border-line text-m hover:bg-side-item disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent'

// サイドバー用の、招待 1 件分のコンパクトな行。失敗(404/409)は行を残してエラーを出す
export function SidebarInvitation({ invitation }: { invitation: Invitation }) {
  const { respond, stale } = useRespondInvitation(invitation.invitationId)
  const disabled = respond.isPending || stale

  return (
    <li className="space-y-1">
      <p className="truncate text-l font-medium">{invitation.productName}</p>
      <p className="truncate text-s opacity-60">
        招待元: {invitation.leaderNames.join('、')}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => respond.mutate('accept')}
          className={buttonClass}
        >
          承認
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => respond.mutate('reject')}
          className={buttonClass}
        >
          拒否
        </button>
      </div>
      {respond.isError && (
        <p role="alert" className="border-l-2 border-line pl-2 text-s break-words">
          ERR {respond.error.message}
        </p>
      )}
    </li>
  )
}
