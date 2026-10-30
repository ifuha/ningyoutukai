import { createAuthClient } from 'better-auth/react'
import { deviceAuthorizationClient } from 'better-auth/client/plugins'
import { API_URL } from '#/lib/api'

export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { credentials: 'include' },
  // CLI のログイン(承認ページ `/device`)
  plugins: [deviceAuthorizationClient()],
})
