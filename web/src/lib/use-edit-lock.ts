import { useCallback, useEffect, useRef, useState } from 'react'
import { acquireDocumentLock, heartbeatDocumentLock, releaseDocumentLock } from '#/lib/document-api'
import { HEARTBEAT_MS, conflictState, editedState, heldState, isExpiredLocally, type LockState } from '#/lib/edit-lock'

// 文書の編集ロックのフック。`active` が true の間(編集中)、ロックを持つ。
// - 始まったら取る。取れなければ `taken`(他の人が編集中)
// - 持っている間、30 秒おきに知らせる(ハートビート。編集があったかを一緒に伝える)。外れていたら、`released`(だれも取っていない)か `taken`(他の人が取った)
// - 手元でも 30 分を数え、サーバーの返事を待たずに、外れたことが分かる(1 秒ごとに見る)。予告(解除の 1 分前)は、`isWarning` で見る
// - 終わったら(`active` が false、画面を離れる)外す。保存すると、サーバー側で自動的に外れる
// 外れたあと、`reacquire()` で取り直せる(だれも取っていなければ、取れる)

const TICK_MS = 1000

export function useEditLock(productId: string, documentId: string | null, active: boolean) {
  const [state, setState] = useState<LockState>({ kind: 'off' })
  const [now, setNow] = useState(() => Date.now())
  const editedSinceBeat = useRef(false)
  const holding = useRef(false)

  const acquire = useCallback(async () => {
    if (!documentId) return
    setState({ kind: 'acquiring' })
    try {
      const result = await acquireDocumentLock(productId, documentId)
      if (result.ok) {
        holding.current = true
        editedSinceBeat.current = false
        setState(heldState(result.lock, Date.now()))
      } else {
        holding.current = false
        setState(conflictState(result))
      }
    } catch {
      // 通信の失敗など。取れていないので、外れた扱い(「取り直す」で、もう一度試せる)
      holding.current = false
      setState({ kind: 'released' })
    }
  }, [productId, documentId])

  // 編集が始まったら取り、終わったら外す
  useEffect(() => {
    if (!active || !documentId) return
    void acquire()
    return () => {
      if (holding.current) {
        holding.current = false
        // 失敗しても、サーバーが 90 秒で外す
        void releaseDocumentLock(productId, documentId).catch(() => undefined)
      }
      setState({ kind: 'off' })
    }
  }, [active, productId, documentId, acquire])

  // 持っている間、30 秒おきに知らせる
  useEffect(() => {
    if (!active || !documentId || state.kind !== 'held') return
    const timer = window.setInterval(async () => {
      const edited = editedSinceBeat.current
      editedSinceBeat.current = false
      try {
        const result = await heartbeatDocumentLock(productId, documentId, edited)
        if (result.ok) setState(heldState(result.lock, Date.now()))
        else {
          holding.current = false
          setState(conflictState(result))
        }
      } catch {
        // 一時的な失敗は、次の知らせで取り戻す(90 秒途絶えるまでは、サーバー側は有効)。編集があったかは、次に持ち越す
        editedSinceBeat.current ||= edited
      }
    }, HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [active, productId, documentId, state.kind])

  // 1 秒ごとに、手元の時計を進める(予告と、手元での「外れた」の判定)
  useEffect(() => {
    if (state.kind !== 'held') return
    const timer = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      setState((s) => {
        if (!isExpiredLocally(s, t)) return s
        holding.current = false
        return { kind: 'released' }
      })
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [state.kind])

  /** 内容を編集した(入力・削除)とき、呼ぶ。30 分を数え直し、次の知らせで、サーバーにも伝える */
  const markEdited = useCallback(() => {
    editedSinceBeat.current = true
    setState((s) => editedState(s, Date.now()))
  }, [])

  return { state, now, markEdited, reacquire: acquire, held: state.kind === 'held' }
}
