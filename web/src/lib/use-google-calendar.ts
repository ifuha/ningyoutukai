import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { eden, edenData } from '#/lib/eden'

// Google カレンダーの連携(状態の取得と、連携の開始)。ホームと、設定の「一般」で、同じ動きにする
// 連携を始めると、Google の承認の画面へ移り、終わると、いま開いていたページへ戻る

/** `calendar`: 連携の状態(取得中・連携済みか) / `connect`: 連携を始める / `linkError`: 始められなかった */
export function useGoogleCalendar() {
  const { data: session } = authClient.useSession()
  const [linkError, setLinkError] = useState(false)
  const calendar = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: () => edenData(eden().api.calendar.status.get()),
    enabled: Boolean(session?.user),
    retry: false,
  })

  const connect = async () => {
    setLinkError(false)
    const here = window.location.href
    const { error } = await authClient.linkSocial({
      provider: 'google',
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
      callbackURL: here,
      errorCallbackURL: here,
      additionalParams: { access_type: 'offline', prompt: 'consent' },
    })
    if (error) setLinkError(true)
  }

  return { calendar, connect, linkError }
}
