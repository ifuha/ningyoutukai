import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { eden, edenData } from '#/lib/eden'

const DEBOUNCE_MS = 200

// 入力が止まってから api に聞く(1 文字ごとには聞かない)。空の入力では聞かない
export function useInviteCandidates(productId: string, input: string) {
  const [q, setQ] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim().replace(/^@/, '')), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input])

  return useQuery({
    queryKey: ['products', productId, 'invite-candidates', q],
    queryFn: () =>
      edenData(
        eden().api.product({ productId }).invitation.candidate.get({ query: { q } }),
      ),
    enabled: q !== '',
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}
