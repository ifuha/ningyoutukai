import { parseArgs } from 'node:util'
import { aiToken } from './commands/ai-token'
import { context, doc, docs, report } from './commands/docs'
import { login } from './commands/login'
import { logout } from './commands/logout'
import { task } from './commands/task'
import { tasks } from './commands/tasks'
import { whoami } from './commands/whoami'
import type { Context } from './context'
import { CliError } from './errors'
import { CLI_NAME, ENV_API_URL, ENV_TOKEN, EXIT, type ExitCode } from './meta'

export const VERSION = '0.1.0'

export function helpText(): string {
  return `${CLI_NAME} — 人形使いを、ターミナルから使う

使い方:
  ${CLI_NAME} <コマンド> [オプション]

コマンド:
  login     ブラウザで承認して、ログインする
  logout    この端末のログインを取り消す
  whoami    ログイン中のユーザーを出す
  tasks     自分に割り振られたタスクの一覧(全プロダクト。既定は完了以外)
  task <ID> タスクの詳細とメッセージ(ID は tasks の ID 列。先頭の一部でもよい)

AI に任せるとき(Markdown の文書を渡す・AI が報告する):
  docs <ID>             タスクに渡された文書の一覧
  doc <ID> <文書>       渡された文書の本文(Markdown)を出す。文書は名前か ID(先頭の一部でもよい)
  context <ID>          タスクの説明・渡された文書の本文・報告のしかたを、Markdown 1 つにして出す(AI が読む)
  report <ID>           AI の報告の下書きを保存する(AI 用のトークンで。担当者が確認して、完了報告に出す)
  ai-token create <名前>  AI 用のトークンを発行する(人のログインで。中身は一度だけ表示)
  ai-token list|revoke <ID>  AI 用のトークンの一覧・取り消し

オプション:
  --api <URL>    接続先(環境変数 ${ENV_API_URL} でも指定できる)
  --json         機械が読める JSON で出す(whoami / tasks / task)
  --product <名前 or ID>  プロダクトで絞る(tasks)。名前は一部でもよい
  --status <状態>  状態で絞る(tasks): in_progress / reported / rejected / completed
  --all          完了したタスクも出す(tasks)
  --ver <N>      文書の前の版を出す(doc)
  --file <パス>  報告の本文のファイル(report)    --stdin  標準入力から読む(report)
  --no-read      読んだ文書を控えない(report。既定は、渡された文書すべての、いまの版を控える)
  --days <日数>  トークンの期限(ai-token create。1〜365、既定 90)
  --no-browser   ブラウザを自動で開かない(login)
  -h, --help     この説明を出す
  -v, --version  バージョンを出す

環境変数:
  ${ENV_TOKEN}   トークン(キーチェーンより優先。CI やコンテナ向け)。AI を動かす環境では、AI 用のトークン(pmai_…)を入れる

終了コード: 0 成功 / 1 エラー / 2 使い方の誤り / 3 未ログイン・期限切れ・拒否`
}

/** 引数を解釈してコマンドを実行し、終了コードを返す。例外は、ここで受けて、メッセージにする */
export async function run(argv: string[], ctx: Context): Promise<ExitCode> {
  try {
    let parsed
    try {
      parsed = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          api: { type: 'string' },
          json: { type: 'boolean' },
          'no-browser': { type: 'boolean' },
          product: { type: 'string' },
          status: { type: 'string' },
          all: { type: 'boolean' },
          ver: { type: 'string' },
          file: { type: 'string' },
          stdin: { type: 'boolean' },
          'no-read': { type: 'boolean' },
          days: { type: 'string' },
          help: { type: 'boolean', short: 'h' },
          version: { type: 'boolean', short: 'v' },
        },
      })
    } catch (e) {
      throw new CliError(
        `${e instanceof Error ? e.message : '引数を解釈できません'}\n\`${CLI_NAME} --help\` で使い方を見られます`,
        EXIT.usage,
      )
    }
    const { values, positionals } = parsed
    const [command, ...rest] = positionals

    if (values.version) {
      ctx.out(`${CLI_NAME} ${VERSION}`)
      return EXIT.ok
    }
    if (values.help || !command) {
      ctx.out(helpText())
      return command || values.help ? EXIT.ok : EXIT.usage
    }
    // 引数(ID・文書・サブコマンド)の数。`task` `docs` `context` `report` は ID の 1 つ、`doc` は ID と文書の 2 つ、`ai-token` はサブコマンドと引数の 2 つ。ほかは取らない
    const maxArgs = command === 'doc' || command === 'ai-token' ? 2 : ['task', 'docs', 'context', 'report'].includes(command) ? 1 : 0
    if (rest.length > maxArgs) {
      throw new CliError(`余分な引数があります: ${rest.slice(maxArgs).join(' ')}`, EXIT.usage)
    }

    switch (command) {
      case 'login':
        await login(ctx, { api: values.api, noBrowser: values['no-browser'] })
        break
      case 'logout':
        await logout(ctx, { api: values.api })
        break
      case 'whoami':
        await whoami(ctx, { api: values.api, json: values.json })
        break
      case 'tasks':
        await tasks(ctx, {
          api: values.api,
          product: values.product,
          status: values.status,
          all: values.all,
          json: values.json,
        })
        break
      case 'task': {
        const id = rest[0]
        if (!id) throw new CliError(`タスクの ID を指定してください(\`${CLI_NAME} tasks\` の ID 列)`, EXIT.usage)
        await task(ctx, id, { api: values.api, json: values.json })
        break
      }
      case 'docs':
      case 'context':
      case 'report': {
        const id = rest[0]
        if (!id) throw new CliError(`タスクの ID を指定してください(\`${CLI_NAME} tasks\` の ID 列)`, EXIT.usage)
        if (command === 'docs') await docs(ctx, id, { api: values.api, json: values.json })
        else if (command === 'context') await context(ctx, id, { api: values.api, json: values.json })
        else await report(ctx, id, { api: values.api, json: values.json, file: values.file, stdin: values.stdin, noRead: values['no-read'] })
        break
      }
      case 'doc': {
        const [id, name] = rest
        if (!id || !name) throw new CliError(`タスクの ID と文書を指定してください(例: ${CLI_NAME} doc <タスクの ID> spec.md)`, EXIT.usage)
        await doc(ctx, id, name, { api: values.api, json: values.json, ver: values.ver })
        break
      }
      case 'ai-token':
        await aiToken(ctx, rest[0], rest[1], { api: values.api, json: values.json, days: values.days })
        break
      default:
        throw new CliError(
          `知らないコマンドです: ${command}\n\`${CLI_NAME} --help\` で使い方を見られます`,
          EXIT.usage,
        )
    }
    return EXIT.ok
  } catch (e) {
    if (e instanceof CliError) {
      ctx.err(`エラー: ${e.message}`)
      return e.exitCode
    }
    ctx.err(`エラー: 予期しない失敗です(${e instanceof Error ? e.message : String(e)})`)
    return EXIT.error
  }
}
