import { fetchSession } from '../api'
import { readConfig, resolveApiUrl } from '../config'
import type { Context } from '../context'
import { LOGIN_HINT, loadToken } from '../credentials'
import { CliError } from '../errors'
import { CLI_NAME, EXIT } from '../meta'

export type WhoamiOptions = { api?: string; json?: boolean }

/** ログイン中のユーザーを出す。未ログイン・期限切れは、終了コード 3 */
export async function whoami(ctx: Context, opts: WhoamiOptions): Promise<void> {
  const config = await readConfig(ctx.configDir)
  const apiUrl = resolveApiUrl({ flag: opts.api, env: ctx.env, config })

  const stored = await loadToken({ apiUrl, store: ctx.store, env: ctx.env })
  if (!stored) throw new CliError(LOGIN_HINT, EXIT.auth)

  const user = await fetchSession(ctx.fetchFn, apiUrl, stored.token)
  if (!user) {
    throw new CliError(
      `ログインの有効期限が切れています。\`${CLI_NAME} login\` でログインし直してください`,
      EXIT.auth,
    )
  }

  if (opts.json) {
    ctx.out(JSON.stringify({ user, apiUrl, tokenSource: stored.source }, null, 2))
    return
  }
  ctx.out(`ユーザー: ${user.name}`)
  ctx.out(`メール:   ${user.email}`)
  ctx.out(`接続先:   ${apiUrl}`)
}
