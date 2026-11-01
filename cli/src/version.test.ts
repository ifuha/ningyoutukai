import { describe, expect, test } from 'bun:test'
import { VERSION } from './cli'
import pkg from '../package.json'

// リリース(.github/workflows/cli-release.yml)は、タグ cli-vX.Y.Z と、この 2 か所が同じことを確かめる。
// 片方だけ上げ忘れると、タグを打ってから失敗するので、テストで先に気づけるようにする
describe('バージョン', () => {
  test('cli.ts の VERSION と、package.json の version が同じ', () => {
    expect(VERSION).toBe(pkg.version)
  })

  test('X.Y.Z の形(タグ cli-vX.Y.Z に使う)', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
