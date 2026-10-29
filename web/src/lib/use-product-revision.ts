import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { eden, edenData } from '#/lib/eden'
import { isDragEngaged } from '#/lib/drag-session'
import { revisionAction } from '#/lib/revision-sync'

// 他の人の変更を、画面に反映する(プロダクトの画面で使う)。
// 10 秒ごとに、プロダクトの版(api の `GET /api/product/:productId/revision`)を見て、変わったときだけ、
// そのプロダクトのデータ(ツリー・セクション・メンバー・タスクなど。`['products', productId]` 以下)を取り直す。
// - タブが見えていないあいだは、見に行かない。見えるようになったら、すぐ見る(react-query の標準の動き)
// - ドラッグの最中は、取り直しを待つ(終わったあとに反映する。30 秒を超えたら、待たずに反映する)
// - 自分の操作でも版は変わるので、自分の操作のあとに、もう一度、取り直すことがある(同じ内容が返るだけ)
// - 版が取れなかったとき(通信の失敗など)は、何もしない。次の呼び出しで、また試す

/** 版を見に行く間隔(ミリ秒) */
export const REVISION_POLL_MS = 10_000
/** ドラッグの最中に、取り直しを待つ間隔(ミリ秒) */
const DEFER_MS = 400
/** 待つ上限(ミリ秒)。ドラッグが何かの拍子に終わらなくても、反映が止まりつづけないように */
const MAX_DEFER_MS = 30_000

export function useProductRevision(productId: string, enabled = true) {
  const queryClient = useQueryClient()
  // 前に反映した版(最初の版は基準)。プロダクトが変わったら、基準から取り直す
  const applied = useRef<{ productId: string; revision: string } | null>(null)

  // 版の問い合わせは、取り直しの対象(`['products', productId]` 以下)に入れない(取り直しが、版の問い合わせまで巻き込まないように)
  const revision = useQuery({
    queryKey: ['product-revision', productId],
    queryFn: () => edenData(eden().api.product({ productId }).revision.get()),
    enabled,
    refetchInterval: REVISION_POLL_MS,
    refetchIntervalInBackground: false,
    retry: false,
    gcTime: 0,
  })
  const latest = revision.data?.revision

  useEffect(() => {
    if (!latest) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const since = Date.now()
    const decide = () => {
      const current = applied.current
      const base = current && current.productId === productId ? current.revision : null
      const waitedTooLong = Date.now() - since > MAX_DEFER_MS
      const action = revisionAction(base, latest, isDragEngaged() && !waitedTooLong)
      if (action === 'baseline' || action === 'refresh') {
        applied.current = { productId, revision: latest }
      }
      if (action === 'refresh') {
        void queryClient.invalidateQueries({ queryKey: ['products', productId] })
      }
      if (action === 'defer') timer = setTimeout(decide, DEFER_MS)
    }
    decide()
    return () => clearTimeout(timer)
  }, [latest, productId, queryClient])
}
