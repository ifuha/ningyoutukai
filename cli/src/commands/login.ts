import { fetchSession } from '../api'
import { readConfig, resolveApiUrl, writeConfig } from '../config'
import type { Context } from '../context'
import { saveToken } from '../credentials'
import { pollForToken, requestDeviceCode } from '../device-flow'
import { CliError } from '../errors'
import { CLI_NAME, ENV_TOKEN, EXIT } from '../meta'

export type LoginOptions = { api?: string; noBrowser?: boolean }

/** ログイン。ブラウザで承認すると、トークンをキーチェーンに保存する(docs/v3.0/cli.md の 3.2・3.3) */
export async function login(ctx: Context, opts: LoginOptions): Promise<void> {
  const config = await readConfig(ctx.configDir)
  const apiUrl = resolveApiUrl({ flag: opts.api, env: ctx.env, config })

  const code = await requestDeviceCode(ctx.fetchFn, apiUrl)
  const url = code.verification_uri_complete ?? code.verification_uri

  ctx.out('ブラウザで、次のページを開いて、ログインを許可してください:')
  ctx.out('')
  ctx.out(`  ${url}`)
  ctx.out('')
  ctx.out(`  コード: ${code.user_code}`)
  ctx.out('')
  ctx.out('(ページに表示されるコードが、上と同じことを確認してください)')
  if (!opts.noBrowser) await ctx.openBrowser(url)
  ctx.out('承認を待っています…')

  const token = await pollForToken(
    { fetchFn: ctx.fetchFn, apiUrl, sleep: ctx.sleep, now: ctx.now },
    code,
  )

  // 受け取ったトークンが使えることを確かめてから保存する
  const user = await fetchSession(ctx.fetchFn, apiUrl, token)
  if (!user) throw new CliError('トークンを受け取りましたが、ユーザーを確認できませんでした', EXIT.error)

  // 保存できなければ、設定ファイルも書かない(半端な状態にしない)
  await saveToken(ctx.store, apiUrl, token)
  await writeConfig(ctx.configDir, {
    apiUrl,
    userId: user.id,
    userName: user.name,
    email: user.email,
    loggedInAt: new Date(ctx.now()).toISOString(),
  })

  ctx.out(`ログインしました: ${user.name} <${user.email}>`)
  if (ctx.env[ENV_TOKEN]?.trim()) {
    ctx.err(`注意: 環境変数 ${ENV_TOKEN} が設定されています。このツールは、そちらを優先して使います`)
  }
  ctx.out(`ログイン中のユーザーは \`${CLI_NAME} whoami\` で確認できます`)
}
