/**
 * api(Elysia)のベース URL。認証(`auth-client.ts`)と、Eden(`eden.ts`)で共通。
 * 未設定なら開発用の `http://localhost:3001`。**空文字(`VITE_API_URL=`)なら同一オリジンの相対パス**
 * (本番の案 S: web の Worker が `/api/*` を api に転送する。`src/worker.ts`、docs/deploy.md)。
 * `??` は空文字を通すので、空にすればそのまま相対パスになる。better-auth のクライアントも、
 * baseURL が空なら `window.location.origin` を使う。
 */
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
