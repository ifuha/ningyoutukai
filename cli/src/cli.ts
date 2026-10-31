import { parseArgs } from 'node:util'
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

オプション:
  --api <URL>    接続先(環境変数 ${ENV_API_URL} でも指定できる)
  --json         機械が読める JSON で出す(whoami / tasks / task)
  --product <名前 or ID>  プロダクトで絞る(tasks)。名前は一部でもよい
  --status <状態>  状態で絞る(tasks): in_progress / reported / rejected / completed
  --all          完了したタスクも出す(tasks)
  --no-browser   ブラウザを自動で開かない(login)
  -h, --help     この説明を出す
  -v, --version  バージョンを出す

環境変数:
  ${ENV_TOKEN}   トークン(キーチェーンより優先。CI やコンテナ向け)

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
    // `task` だけが、引数(ID)を 1 つ取る。ほかのコマンドは取らない
    const maxArgs = command === 'task' ? 1 : 0
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
