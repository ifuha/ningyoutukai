/** api(Elysia)のベース URL。認証(`auth-client.ts`)と、通常の API 呼び出しで共通 */
export const API_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

/** api が返すエラーの形(すべて `{ message }`) */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * api を、ログインの cookie 付きで呼ぶ。失敗したら、`ApiError`(`message` は、画面に出せる文)を投げる。
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { credentials: 'include', ...init })
  } catch {
    throw new ApiError(0, 'サーバーに接続できませんでした。時間をおいて、もう一度お試しください')
  }
  if (!res.ok) {
    let message = 'エラーが発生しました'
    try {
      const body = (await res.json()) as { message?: unknown }
      if (typeof body.message === 'string') message = body.message
    } catch {
      // 本文が JSON でなければ、既定の文のまま
    }
    throw new ApiError(res.status, message)
  }
  return (await res.json()) as T
}

/** `GET /api/product`(自分が所属するプロダクトの一覧)の 1 件 */
export type ProductSummary = {
  productId: string
  productName: string
  createdAt: string
  role: 'leader' | 'member'
}
