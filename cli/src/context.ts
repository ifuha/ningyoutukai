import type { Fetch } from './api'
import type { SecretStore } from './credentials'

/** コマンドが使う外部とのつながり。本物は `index.ts` で組み立て、テストでは差し替える */
export type Context = {
  fetchFn: Fetch
  store: SecretStore
  env: Record<string, string | undefined>
  /** 設定ファイルのディレクトリ */
  configDir: string
  /** 標準出力・標準エラーへ 1 行 */
  out: (line: string) => void
  err: (line: string) => void
  sleep: (ms: number) => Promise<void>
  now: () => number
  /** ブラウザで URL を開く(開けなくても失敗しない) */
  openBrowser: (url: string) => Promise<void>
}
