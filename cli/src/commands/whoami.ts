import { fetchSession } from '../api'
import type { Context } from '../context'
import { CliError } from '../errors'
import { CLI_NAME, EXIT } from '../meta'
import { resolveAuth } from './auth'

export type WhoamiOptions = { api?: string; json?: boolean }

/** ログイン中のユーザーを出す。未ログイン・期限切れは、終了コード 3 */
export async function whoami(ctx: Context, opts: WhoamiOptions): Promise<void> {
  const { apiUrl, token, source } = await resolveAuth(ctx, opts.api)

  const user = await fetchSession(ctx.fetchFn, apiUrl, token)
  if (!user) {
    throw new CliError(
      `ログインの有効期限が切れています。\`${CLI_NAME} login\` でログインし直してください`,
      EXIT.auth,
    )
  }

  if (opts.json) {
    ctx.out(JSON.stringify({ user, apiUrl, tokenSource: source }, null, 2))
    return
  }
  ctx.out(`ユーザー: ${user.name}`)
  ctx.out(`メール:   ${user.email}`)
  ctx.out(`接続先:   ${apiUrl}`)
}
