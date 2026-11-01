import { readConfig, resolveApiUrl } from '../config'
import type { Context } from '../context'
import { LOGIN_HINT, loadToken, type StoredToken } from '../credentials'
import { CliError } from '../errors'
import { EXIT } from '../meta'

/** 接続先とトークンを決める。ログインしていなければ、`login` を案内して失敗(終了コード 3) */
export async function resolveAuth(
  ctx: Context,
  apiFlag: string | undefined,
): Promise<{ apiUrl: string; token: string; source: StoredToken['source'] }> {
  const config = await readConfig(ctx.configDir)
  const apiUrl = resolveApiUrl({ flag: apiFlag, env: ctx.env, config })
  const stored = await loadToken({ apiUrl, store: ctx.store, env: ctx.env })
  if (!stored) throw new CliError(LOGIN_HINT, EXIT.auth)
  return { apiUrl, token: stored.token, source: stored.source }
}
