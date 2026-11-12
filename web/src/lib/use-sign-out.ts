import { useNavigate } from '@tanstack/react-router'
import { authClient } from '#/lib/auth-client'

// ログアウトして、ログイン画面(`/`)へ戻す。ホームと、設定の「一般」で、同じ動きにする。
// 取得したデータの消去は、`cache-owner.ts` が、ユーザーが変わったことを見て行う(ここでは消さない)
export function useSignOut() {
  const navigate = useNavigate()
  return async () => {
    await authClient.signOut()
    void navigate({ to: '/', replace: true })
  }
}
