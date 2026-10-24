import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '#/lib/api'
import { eden, edenData } from '#/lib/eden'

// 招待の承認・拒否。成功したら一覧を取り直す(承認したら、プロダクト一覧も)。
// `stale`: 404/409 はその招待がもう無効なので、押せないままにするための印
export function useRespondInvitation(invitationId: string) {
  const queryClient = useQueryClient()
  const respond = useMutation({
    // accept と reject は応答の形が違う(Eden の型が合わない)ので、分けて呼ぶ。戻り値は使わない
    mutationFn: async (action: 'accept' | 'reject') => {
      const invitation = eden().api.invitation({ invitationId })
      if (action === 'accept') await edenData(invitation.accept.post())
      else await edenData(invitation.reject.post())
    },
    onSuccess: (_data, action) => {
      if (action === 'accept')
        void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['invitations'] })
    },
  })
  const stale =
    respond.error instanceof ApiError &&
    (respond.error.status === 404 || respond.error.status === 409)
  return { respond, stale }
}
