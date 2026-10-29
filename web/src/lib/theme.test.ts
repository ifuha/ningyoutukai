import { describe, expect, test } from 'bun:test'
import { THEME_KEY, applyTheme, parseTheme, themeInitScript, themes } from './theme'

function fakeRoot() {
  const attrs = new Map<string, string>()
  return {
    attrs,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  }
}

describe('parseTheme', () => {
  test('light / dark だけを、そのまま返す。ほかは自動', () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme('system')).toBe('system')
    expect(parseTheme('blue')).toBe('system')
    expect(parseTheme('')).toBe('system')
    expect(parseTheme(null)).toBe('system')
    expect(parseTheme(undefined)).toBe('system')
  })
})

describe('applyTheme', () => {
  test('light / dark は data-theme を付ける。自動は外す', () => {
    const root = fakeRoot()
    applyTheme('dark', root)
    expect(root.attrs.get('data-theme')).toBe('dark')
    applyTheme('light', root)
    expect(root.attrs.get('data-theme')).toBe('light')
    applyTheme('system', root)
    expect(root.attrs.has('data-theme')).toBe(false)
  })
})

describe('themes', () => {
  test('自動・ライト・ダークの 3 つが、この順で並ぶ', () => {
    expect(themes.map((t) => t.value)).toEqual(['system', 'light', 'dark'])
  })
})

describe('themeInitScript', () => {
  // 実際にスクリプトを動かして、保存された値が <html> に付くことを確かめる
  function run(stored: string | null, throws = false) {
    const root = fakeRoot()
    const localStorage = {
      getItem: (k: string) => {
        if (throws) throw new Error('blocked')
        return k === THEME_KEY ? stored : null
      },
    }
    new Function('localStorage', 'document', themeInitScript)(localStorage, {
      documentElement: root,
    })
    return root.attrs.get('data-theme')
  }

  test('保存された light / dark を、data-theme に付ける', () => {
    expect(run('dark')).toBe('dark')
    expect(run('light')).toBe('light')
  })
  test('保存がない・知らない値なら、何も付けない', () => {
    expect(run(null)).toBeUndefined()
    expect(run('system')).toBeUndefined()
    expect(run('x')).toBeUndefined()
  })
  test('localStorage が使えなくても、例外を出さない', () => {
    expect(run('dark', true)).toBeUndefined()
  })
})
