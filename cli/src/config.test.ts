import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clearConfig, configDir, readConfig, resolveApiUrl, writeConfig } from './config'
import { DEFAULT_API_URL } from './meta'

const dirs: string[] = []
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true })
})
const tmp = async () => {
  const d = await mkdtemp(join(tmpdir(), 'ningyoutukai-cfg-'))
  dirs.push(d)
  return d
}

describe('configDir', () => {
  test('XDG_CONFIG_HOME があれば、それを使う', () => {
    expect(configDir({ XDG_CONFIG_HOME: '/x/cfg' }, '/home/u')).toBe('/x/cfg/ningyoutukai')
  })
  test('なければ ~/.config', () => {
    expect(configDir({}, '/home/u')).toBe('/home/u/.config/ningyoutukai')
    expect(configDir({ XDG_CONFIG_HOME: '' }, '/home/u')).toBe('/home/u/.config/ningyoutukai')
  })
})

describe('resolveApiUrl', () => {
  test('優先順位: --api > 環境変数 > 設定ファイル > 既定', () => {
    const config = { apiUrl: 'https://from-config' }
    const env = { NINGYOUTUKAI_API_URL: 'https://from-env' }
    expect(resolveApiUrl({ flag: 'https://from-flag', env, config })).toBe('https://from-flag')
    expect(resolveApiUrl({ env, config })).toBe('https://from-env')
    expect(resolveApiUrl({ env: {}, config })).toBe('https://from-config')
    expect(resolveApiUrl({ env: {}, config: null })).toBe(DEFAULT_API_URL)
  })
  test('末尾のスラッシュと前後の空白を取り除く', () => {
    expect(resolveApiUrl({ flag: ' https://x.example/// ', env: {} })).toBe('https://x.example')
  })
  test('空の値は、飛ばして次を使う', () => {
    expect(resolveApiUrl({ flag: '', env: { NINGYOUTUKAI_API_URL: '  ' }, config: { apiUrl: 'https://c' } })).toBe(
      'https://c',
    )
  })
})

describe('設定ファイル', () => {
  test('書いて、読める。ファイルは 0600、ディレクトリは 0700(自分だけが読める)', async () => {
    const dir = join(await tmp(), 'nested', 'ningyoutukai')
    const config = { apiUrl: 'https://x', userId: 'u1', userName: '太郎', email: 'a@example.com', loggedInAt: '2026-10-30T00:00:00.000Z' }
    await writeConfig(dir, config)
    expect(await readConfig(dir)).toEqual(config)
    expect((await stat(join(dir, 'config.json'))).mode & 0o777).toBe(0o600)
    expect((await stat(dir)).mode & 0o777).toBe(0o700)
  })
  test('トークンは、設定ファイルに入らない', async () => {
    const dir = await tmp()
    await writeConfig(dir, { apiUrl: 'https://x' })
    const raw = await Bun.file(join(dir, 'config.json')).text()
    expect(raw).not.toMatch(/token/i)
  })
  test('無い・壊れている・形が違うときは、null', async () => {
    const dir = await tmp()
    expect(await readConfig(dir)).toBeNull()
    await Bun.write(join(dir, 'config.json'), '{ broken')
    expect(await readConfig(dir)).toBeNull()
    await Bun.write(join(dir, 'config.json'), JSON.stringify({ nope: 1 }))
    expect(await readConfig(dir)).toBeNull()
  })
  test('消せる(無くても失敗しない)', async () => {
    const dir = await tmp()
    await writeConfig(dir, { apiUrl: 'https://x' })
    await clearConfig(dir)
    expect(await readConfig(dir)).toBeNull()
    await clearConfig(dir)
  })
})
