import type { Context } from '../context'
import { createAiToken, isAiToken, listAiTokens, revokeAiToken, type AiTokenInfo } from '../docs-api'
import { CliError } from '../errors'
import { formatDateTime, renderTable, shortId } from '../format'
import { CLI_NAME, ENV_TOKEN, EXIT } from '../meta'
import { resolveAuth } from './auth'

// AI 用のトークンの発行・一覧・取り消し(自分の分だけ)。仕様は docs/v4.0/overview.md
// - 人のログイン(`login`)でだけ使える。AI 用のトークンでは、自分のトークンを増やしたり取り消したりできない
// - 発行したトークンは、AI を動かす環境の環境変数 NINGYOUTUKAI_TOKEN に入れる。中身は、発行のときに一度だけ表示される

export type AiTokenOptions = { api?: string; json?: boolean; days?: string }

const SUBCOMMANDS = ['create', 'list', 'revoke'] as const

function parseDays(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 365) throw new CliError(`--days は 1〜365 の整数で指定してください: ${value}`, EXIT.usage)
  return n
}

const state = (t: AiTokenInfo) => (t.revokedAt ? '取り消し済み' : t.active ? '有効' : '期限切れ')

/** ID(全体か先頭)に合むトークンを探す */
function findToken(tokens: AiTokenInfo[], id: string): AiTokenInfo {
  const needle = id.trim().toLowerCase()
  if (needle.length < 4) throw new CliError(`ID は 4 文字以上で指定してください(\`${CLI_NAME} ai-token list\` の ID 列)`, EXIT.usage)
  const hits = tokens.filter((t) => t.tokenId.toLowerCase().startsWith(needle))
  if (hits.length === 0) throw new CliError(`この ID のトークンはありません: ${id}`, EXIT.error)
  if (hits.length > 1) throw new CliError(`この ID に合うトークンが複数あります。もう少し長く指定してください:\n${hits.map((t) => `  ${t.tokenId}  ${t.name}`).join('\n')}`, EXIT.error)
  return hits[0]!
}

export async function aiToken(ctx: Context, sub: string | undefined, arg: string | undefined, opts: AiTokenOptions): Promise<void> {
  if (!sub || !(SUBCOMMANDS as readonly string[]).includes(sub)) {
    throw new CliError(`使い方:\n  ${CLI_NAME} ai-token create <名前> [--days <日数>]\n  ${CLI_NAME} ai-token list\n  ${CLI_NAME} ai-token revoke <ID>`, EXIT.usage)
  }
  const days = parseDays(opts.days)
  if (sub !== 'create' && opts.days !== undefined) throw new CliError('--days は、create のときだけ使えます', EXIT.usage)
  if (sub === 'create' && !arg?.trim()) throw new CliError(`トークンの名前を指定してください(どの AI かを見分ける名前)\n例: ${CLI_NAME} ai-token create "Claude Code"`, EXIT.usage)
  if (sub === 'revoke' && !arg) throw new CliError(`取り消すトークンの ID を指定してください(\`${CLI_NAME} ai-token list\` の ID 列)`, EXIT.usage)
  if (sub === 'list' && arg) throw new CliError(`余分な引数があります: ${arg}`, EXIT.usage)

  const { apiUrl, token } = await resolveAuth(ctx, opts.api)
  if (isAiToken(token)) {
    throw new CliError(`AI 用のトークンでは、トークンの発行・一覧・取り消しはできません。人のログイン(\`${CLI_NAME} login\`)で行ってください(${ENV_TOKEN} を外す)`, EXIT.auth)
  }

  if (sub === 'create') {
    const created = await createAiToken(ctx.fetchFn, apiUrl, token, { name: arg!.trim(), ...(days ? { expiresInDays: days } : {}) })
    if (opts.json) {
      ctx.out(JSON.stringify(created, null, 2))
      return
    }
    ctx.out(`AI 用のトークンを発行しました(${created.name}。期限 ${formatDateTime(created.expiresAt)})`)
    ctx.out('')
    ctx.out(created.token)
    ctx.out('')
    ctx.out('このトークンは、今回しか表示されません。AI を動かす環境で、次のように設定してください:')
    ctx.out(`  export ${ENV_TOKEN}=${created.token}`)
    return
  }

  if (sub === 'list') {
    const tokens = await listAiTokens(ctx.fetchFn, apiUrl, token)
    if (opts.json) {
      ctx.out(JSON.stringify(tokens, null, 2))
      return
    }
    if (tokens.length === 0) {
      ctx.out('AI 用のトークンはありません')
      return
    }
    ctx.out(
      renderTable([
        ['ID', '名前', 'トークン', '状態', '期限', '最後に使った日時'],
        ...tokens.map((t) => [shortId(t.tokenId), t.name, `${t.tokenPrefix}…`, state(t), formatDateTime(t.expiresAt), formatDateTime(t.lastUsedAt)]),
      ]),
    )
    return
  }

  // revoke
  const tokens = await listAiTokens(ctx.fetchFn, apiUrl, token)
  const found = findToken(tokens, arg!)
  await revokeAiToken(ctx.fetchFn, apiUrl, token, found.tokenId)
  ctx.out(`取り消しました: ${found.name}(${shortId(found.tokenId)})`)
}
