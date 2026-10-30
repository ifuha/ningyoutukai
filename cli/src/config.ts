import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_API_URL, ENV_API_URL } from './meta'

// 設定ファイル(秘密でない値だけ)。トークンは入れない(キーチェーンに保存する: credentials.ts)

export type Config = {
  apiUrl: string
  userId?: string
  userName?: string
  email?: string
  /** ログインした日時(ISO 8601) */
  loggedInAt?: string
}

type Env = Record<string, string | undefined>

/** 設定ファイルのあるディレクトリ。`XDG_CONFIG_HOME` があればそれ、なければ `~/.config` */
export function configDir(env: Env = process.env, home: string = homedir()): string {
  const base = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME !== '' ? env.XDG_CONFIG_HOME : join(home, '.config')
  return join(base, 'ningyoutukai')
}

export const configPath = (dir: string) => join(dir, 'config.json')

/** 末尾のスラッシュを取り除く(`https://x/` → `https://x`) */
export function normalizeApiUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/** 接続先の決め方。優先順位: `--api` > 環境変数 > 設定ファイル > 既定 */
export function resolveApiUrl(opts: { flag?: string; env?: Env; config?: Config | null }): string {
  const env = opts.env ?? process.env
  const picked = [opts.flag, env[ENV_API_URL], opts.config?.apiUrl, DEFAULT_API_URL].find(
    (v) => typeof v === 'string' && v.trim() !== '',
  )
  return normalizeApiUrl(picked as string)
}

/** 設定を読む。無い・壊れているときは null(壊れたファイルで落とさない) */
export async function readConfig(dir: string): Promise<Config | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(configPath(dir), 'utf8'))
    if (parsed && typeof parsed === 'object' && typeof (parsed as Config).apiUrl === 'string') {
      return parsed as Config
    }
    return null
  } catch {
    return null
  }
}

/** 設定を書く。ディレクトリは 0700、ファイルは 0600(自分だけが読める) */
export async function writeConfig(dir: string, config: Config): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await chmod(dir, 0o700).catch(() => {})
  const path = configPath(dir)
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  await chmod(path, 0o600).catch(() => {})
}

export async function clearConfig(dir: string): Promise<void> {
  await rm(configPath(dir), { force: true })
}
