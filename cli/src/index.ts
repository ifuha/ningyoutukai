#!/usr/bin/env bun
import { run } from './cli'
import { configDir } from './config'
import type { Context } from './context'
import { keychain } from './credentials'

// ブラウザで URL を開く。開けなくても(ヘッドレス・コマンドが無い)失敗しない。URL は画面に出してある
async function openBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url]
  try {
    const proc = Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' })
    await proc.exited
  } catch {
    // 手で開いてもらう
  }
}

const ctx: Context = {
  fetchFn: (url, init) => fetch(url, init),
  store: keychain,
  env: process.env,
  configDir: configDir(),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  openBrowser,
}

process.exit(await run(process.argv.slice(2), ctx))
