import { postJson, type Fetch } from './api'
import { CliError } from './errors'
import { CLI_NAME, CLIENT_ID, EXIT } from './meta'

// デバイスコードのログイン(RFC 8628)。docs/v3.0/cli.md の 3.2

export type DeviceCode = {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in: number
  interval: number
}

const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
/** `slow_down` を受けたときに、確認の間隔へ足す秒数(RFC 8628 の 3.5) */
const SLOW_DOWN_STEP_SEC = 5

/** コードを発行する(`POST /api/auth/device/code`) */
export async function requestDeviceCode(fetchFn: Fetch, apiUrl: string): Promise<DeviceCode> {
  const res = await postJson(fetchFn, `${apiUrl}/api/auth/device/code`, { client_id: CLIENT_ID })
  if (!res.ok) throw new CliError(`ログインを始められませんでした(${res.status})`, EXIT.error)
  const body = (await res.json().catch(() => null)) as Partial<DeviceCode> | null
  if (!body || typeof body.device_code !== 'string' || typeof body.user_code !== 'string' || typeof body.verification_uri !== 'string') {
    throw new CliError('サーバーの応答が正しくありません(ログインのコード)', EXIT.error)
  }
  return {
    device_code: body.device_code,
    user_code: body.user_code,
    verification_uri: body.verification_uri,
    verification_uri_complete: body.verification_uri_complete,
    expires_in: typeof body.expires_in === 'number' ? body.expires_in : 900,
    interval: typeof body.interval === 'number' && body.interval > 0 ? body.interval : 5,
  }
}

export type PollDeps = {
  fetchFn: Fetch
  apiUrl: string
  sleep: (ms: number) => Promise<void>
  /** 現在時刻(ミリ秒)。期限の判定に使う */
  now: () => number
}

/**
 * 承認されるまで、確認の間隔ごとにトークンを問い合わせる。承認されたらトークンを返す。
 * - `authorization_pending`: 待つ / `slow_down`: 間隔を 5 秒延ばす
 * - `access_denied`(拒否)・`expired_token`(期限切れ)・コードの期限: 終了コード 3 で失敗
 */
export async function pollForToken(deps: PollDeps, code: DeviceCode): Promise<string> {
  let intervalSec = code.interval
  const deadline = deps.now() + code.expires_in * 1000
  const retry = `\`${CLI_NAME} login\` をもう一度実行してください`

  while (deps.now() < deadline) {
    await deps.sleep(intervalSec * 1000)
    const res = await postJson(deps.fetchFn, `${deps.apiUrl}/api/auth/device/token`, {
      grant_type: GRANT_TYPE,
      device_code: code.device_code,
      client_id: CLIENT_ID,
    })
    const body = (await res.json().catch(() => null)) as {
      access_token?: string
      error?: string
    } | null

    if (res.ok && typeof body?.access_token === 'string' && body.access_token !== '') {
      return body.access_token
    }
    switch (body?.error) {
      case 'authorization_pending':
        break
      case 'slow_down':
        intervalSec += SLOW_DOWN_STEP_SEC
        break
      case 'access_denied':
        throw new CliError('ログインが拒否されました', EXIT.auth)
      case 'expired_token':
        throw new CliError(`コードの有効期限が切れました。${retry}`, EXIT.auth)
      default:
        throw new CliError(`ログインできませんでした(${res.status})。${retry}`, EXIT.error)
    }
  }
  throw new CliError(`コードの有効期限が切れました。${retry}`, EXIT.auth)
}
