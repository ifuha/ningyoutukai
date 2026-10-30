import { CliError } from './errors'
import { EXIT } from './meta'

// api(Better Auth の `/api/auth/*`)を呼ぶ、薄い部品。fetch は差し替えられる(テスト用)

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export type SessionUser = { id: string; name: string; email: string }

/** 接続できなかったとき(ネットワーク・URL の誤り)は、接続先を示して失敗する */
export async function send(fetchFn: Fetch, url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetchFn(url, init)
  } catch {
    throw new CliError(`サーバーに接続できませんでした: ${new URL(url).origin}`, EXIT.error)
  }
}

export function postJson(fetchFn: Fetch, url: string, body: unknown, token?: string): Promise<Response> {
  return send(fetchFn, url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

/**
 * トークンで、ログイン中のユーザーを取る(`GET /api/auth/get-session`)。
 * トークンが無効・期限切れなら null(未ログインのとき、Better Auth は 200 で null を返す)。
 * サーバーのエラー(5xx)は、期限切れと区別して、失敗にする
 */
export async function fetchSession(
  fetchFn: Fetch,
  apiUrl: string,
  token: string,
): Promise<SessionUser | null> {
  const res = await send(fetchFn, `${apiUrl}/api/auth/get-session`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (res.status === 401 || res.status === 403) return null
  if (!res.ok) throw new CliError(`サーバーがエラーを返しました(${res.status})`, EXIT.error)
  const body = (await res.json().catch(() => null)) as { user?: SessionUser } | null
  const user = body?.user
  return user && typeof user.id === 'string' ? { id: user.id, name: user.name, email: user.email } : null
}

/** サーバー側のセッションを無効にする(`POST /api/auth/sign-out`)。失敗しても、呼び出し側は続ける */
export async function signOut(fetchFn: Fetch, apiUrl: string, token: string): Promise<boolean> {
  try {
    const res = await postJson(fetchFn, `${apiUrl}/api/auth/sign-out`, {}, token)
    return res.ok
  } catch {
    return false
  }
}
