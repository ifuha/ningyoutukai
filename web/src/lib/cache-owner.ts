import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'

/**
 * 取得したデータ(react-query のキャッシュ)は、取得した人のもの。
 * ログアウトや、別の人のログインで、前の人のデータが、次の人の画面に一瞬でも出ないようにする。
 *
 * `previous`: 前に見たユーザー(`undefined` = まだ一度も確認していない、`null` = 未ログイン)。
 * 確認が済んだ後に、ユーザーが変わったとき(ログアウト・別の人のログイン・セッション切れ)だけ、消す。
 * 最初の確認(ページを開いた直後)では、消さない(キャッシュは、まだ空)
 */
export function shouldClearCache(previous: string | null | undefined, next: string | null): boolean {
  return previous !== undefined && previous !== next
}

/**
 * ログイン中のユーザーが変わったら、キャッシュを消す(ルートで 1 回だけ使う)。
 * ログアウトの呼び出し元(ヘッダー・ホーム・セッション切れの処理)が増えても、消し忘れない
 */
export function useClearCacheOnUserChange() {
  const queryClient = useQueryClient()
  const { data: session, isPending } = authClient.useSession()
  const userId = session?.user?.id ?? null
  const previous = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    // セッションの確認が済むまで(ページを開いた直後)は、何もしない
    if (isPending) return
    if (shouldClearCache(previous.current, userId)) queryClient.clear()
    previous.current = userId
  }, [isPending, userId, queryClient])
}
