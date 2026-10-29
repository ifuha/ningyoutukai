import { Check, X } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import type { Invitation } from '#/lib/invitation'
import { useRespondInvitation } from '#/lib/use-respond-invitation'

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
      <div className="flex justify-center gap-2">
        <IconButton
          icon={Check}
          label="承認"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => respond.mutate('accept')}
        />
        <IconButton
          icon={X}
          label="拒否"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => respond.mutate('reject')}
        />
      </div>
      {respond.isError && (
        <p role="alert" className="border-l-2 border-ink pl-2 text-s break-words">
          ERR {respond.error.message}
        </p>
      )}
    </li>
  )
}
