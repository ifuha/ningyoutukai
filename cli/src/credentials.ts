import { CliError } from './errors'
import { CLI_NAME, ENV_TOKEN, EXIT, SECRET_SERVICE } from './meta'

// トークンの保存。平文のファイルには置かない(docs/v3.0/cli.md の 3.3)。OS のキーチェーンに保存する。
// キーチェーンが使えない環境でも、平文のファイルに黙って落とさない。失敗して、環境変数 NINGYOUTUKAI_TOKEN を案内する

/** キーチェーンの読み書き。テストでは、メモリ上のものに差し替える */
export interface SecretStore {
  get(service: string, name: string): Promise<string | null>
  set(service: string, name: string, value: string): Promise<void>
  delete(service: string, name: string): Promise<void>
}

/** OS のキーチェーン(Bun 標準の `Bun.secrets`。macOS: Keychain / Linux: libsecret / Windows: 資格情報マネージャー) */
export const keychain: SecretStore = {
  get: (service, name) => Bun.secrets.get({ service, name }),
  set: (service, name, value) => Bun.secrets.set({ service, name, value }),
  delete: async (service, name) => {
    await Bun.secrets.delete({ service, name })
  },
}

export type TokenSource = 'env' | 'keychain'
export type StoredToken = { token: string; source: TokenSource }

const KEYCHAIN_HELP = `キーチェーンを使えませんでした。環境変数 ${ENV_TOKEN} にトークンを入れて使うこともできます`

/** トークンを探す。環境変数 `NINGYOUTUKAI_TOKEN` が先、次にキーチェーン。無ければ null */
export async function loadToken(opts: {
  apiUrl: string
  store: SecretStore
  env?: Record<string, string | undefined>
}): Promise<StoredToken | null> {
  const env = opts.env ?? process.env
  const fromEnv = env[ENV_TOKEN]?.trim()
  if (fromEnv) return { token: fromEnv, source: 'env' }
  try {
    const stored = await opts.store.get(SECRET_SERVICE, opts.apiUrl)
    return stored ? { token: stored, source: 'keychain' } : null
  } catch {
    // 読めないときは「保存されていない」と同じに扱う(ログインを促す。保存のときに、原因を案内する)
    return null
  }
}

/** トークンをキーチェーンに保存する。失敗したら、平文に落とさず、案内つきで失敗する */
export async function saveToken(store: SecretStore, apiUrl: string, token: string): Promise<void> {
  try {
    await store.set(SECRET_SERVICE, apiUrl, token)
  } catch (e) {
    const detail = e instanceof Error && e.message ? `(${e.message})` : ''
    throw new CliError(`${KEYCHAIN_HELP}${detail}。トークンは保存していません`, EXIT.error)
  }
}

/** キーチェーンのトークンを消す(無くても、失敗しない) */
export async function removeToken(store: SecretStore, apiUrl: string): Promise<void> {
  try {
    await store.delete(SECRET_SERVICE, apiUrl)
  } catch {
    // 消せなくても、ログアウトは続ける
  }
}

/** ログインを促すメッセージ */
export const LOGIN_HINT = `ログインしていません。\`${CLI_NAME} login\` でログインしてください`
