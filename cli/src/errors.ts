import { EXIT, type ExitCode } from './meta'

/** ユーザーに見せるメッセージと終了コードを持つエラー。コマンドの最上位で受けて、メッセージを出して終了する */
export class CliError extends Error {
  readonly exitCode: ExitCode
  constructor(message: string, exitCode: ExitCode = EXIT.error) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}
