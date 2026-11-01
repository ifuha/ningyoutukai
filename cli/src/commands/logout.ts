import { signOut } from '../api'
import { clearConfig, readConfig, resolveApiUrl } from '../config'
import type { Context } from '../context'
import { loadToken, removeToken } from '../credentials'
import { ENV_TOKEN } from '../meta'

export type LogoutOptions = { api?: string }

/** ログアウト。キーチェーンのトークンと設定ファイルを消し、サーバー側のセッションも無効にする */
export async function logout(ctx: Context, opts: LogoutOptions): Promise<void> {
  const config = await readConfig(ctx.configDir)
  const apiUrl = resolveApiUrl({ flag: opts.api, env: ctx.env, config })
  const stored = await loadToken({ apiUrl, store: ctx.store, env: {} }) // 環境変数は見ない(消せないため)

  if (stored) {
    // サーバー側のセッションを無効にする。失敗しても(接続できない・すでに無効)、この端末のログアウトは続ける
    const revoked = await signOut(ctx.fetchFn, apiUrl, stored.token)
    await removeToken(ctx.store, apiUrl)
    if (!revoked) ctx.err('注意: サーバー側のセッションは、無効にできませんでした(この端末のトークンは消しました)')
  }
  await clearConfig(ctx.configDir)

  ctx.out(stored ? 'ログアウトしました' : 'ログインしていません')
  if (ctx.env[ENV_TOKEN]?.trim()) {
    ctx.err(`注意: 環境変数 ${ENV_TOKEN} は消せません。不要なら、シェルの設定から外してください`)
  }
}
