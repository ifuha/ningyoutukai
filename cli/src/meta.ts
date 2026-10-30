// CLI の定数。コマンド名は未定(docs/v3.0/cli.md の「7. 決めたこと・後で決めること」)なので、ここ 1 か所に置く

/** コマンド名(メッセージの案内に使う) */
export const CLI_NAME = 'ningyoutukai'

/** デバイスコードのログインで api に名乗る client_id(api の `CLI_CLIENT_ID` と同じ) */
export const CLIENT_ID = 'ningyoutukai-cli'

/** 接続先の既定(本番の web のオリジン。api は同じオリジンの `/api` にある) */
export const DEFAULT_API_URL = 'https://ningyoutukai-web.kosame-project.workers.dev'

/** キーチェーンの項目の「サービス名」。項目の名前は、接続先の URL */
export const SECRET_SERVICE = 'ningyoutukai-cli'

/** 環境変数 */
export const ENV_API_URL = 'NINGYOUTUKAI_API_URL'
export const ENV_TOKEN = 'NINGYOUTUKAI_TOKEN'

/** 終了コード */
export const EXIT = {
  ok: 0,
  /** API のエラー・その他の失敗 */
  error: 1,
  /** 使い方の誤り */
  usage: 2,
  /** 未ログイン・期限切れ・拒否 */
  auth: 3,
} as const
export type ExitCode = (typeof EXIT)[keyof typeof EXIT]
