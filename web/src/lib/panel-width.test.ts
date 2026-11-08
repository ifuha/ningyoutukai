import { afterEach, describe, expect, test } from 'bun:test'
import {
  PANEL_DEFAULT_PX,
  PANEL_KEY_STEP_PX,
  PANEL_MAX_PX,
  PANEL_MIN_PX,
  clampPanelWidth,
  loadPanelWidth,
  savePanelWidth,
  widthFromKey,
  widthFromPointer,
} from './panel-width'

describe('clampPanelWidth', () => {
  test('最小 280px 未満にはならない。範囲の中はそのまま', () => {
    expect(clampPanelWidth(100, 1400)).toBe(PANEL_MIN_PX)
    expect(clampPanelWidth(PANEL_MIN_PX, 1400)).toBe(PANEL_MIN_PX)
    expect(clampPanelWidth(500, 1400)).toBe(500)
  })
  test('最大は、置き場所の幅の 70%(900px まで)', () => {
    expect(clampPanelWidth(2000, 1000)).toBe(700)
    expect(clampPanelWidth(2000, 1400)).toBe(900)
    expect(clampPanelWidth(2000, 4000)).toBe(PANEL_MAX_PX)
  })
  test('置き場所が狭いときは、最小を優先する(70% が 280 を下回っても、280)', () => {
    expect(clampPanelWidth(500, 300)).toBe(PANEL_MIN_PX)
  })
  test('小数は丸める。数でない値は、既定の幅', () => {
    expect(clampPanelWidth(400.6, 1400)).toBe(401)
    expect(clampPanelWidth(Number.NaN, 1400)).toBe(PANEL_DEFAULT_PX)
    expect(clampPanelWidth(Number.POSITIVE_INFINITY, 1400)).toBe(PANEL_DEFAULT_PX)
  })
})

describe('widthFromPointer(ドラッグ)', () => {
  test('幅 = 置き場所の右端 − マウスの位置。左へ動かすと広がり、右へ動かすと狭まる', () => {
    expect(widthFromPointer(1400, 1000, 1400)).toBe(400)
    expect(widthFromPointer(1400, 900, 1400)).toBe(500)
    expect(widthFromPointer(1400, 1200, 1400)).toBe(PANEL_MIN_PX)
  })
  test('行きすぎても、範囲に収まる', () => {
    expect(widthFromPointer(1400, -500, 1400)).toBe(900)
    expect(widthFromPointer(1400, 1600, 1400)).toBe(PANEL_MIN_PX)
  })
})

describe('widthFromKey(キーボード)', () => {
  test('← で広げ、→ で狭める(16px ずつ)。範囲を超えない', () => {
    expect(widthFromKey(400, 'ArrowLeft', 1400)).toBe(400 + PANEL_KEY_STEP_PX)
    expect(widthFromKey(400, 'ArrowRight', 1400)).toBe(400 - PANEL_KEY_STEP_PX)
    expect(widthFromKey(PANEL_MIN_PX, 'ArrowRight', 1400)).toBe(PANEL_MIN_PX)
    expect(widthFromKey(900, 'ArrowLeft', 1400)).toBe(900)
  })
  test('Home で最小、End で最大(置き場所に収まる範囲で)', () => {
    expect(widthFromKey(500, 'Home', 1400)).toBe(PANEL_MIN_PX)
    expect(widthFromKey(500, 'End', 1400)).toBe(900)
    expect(widthFromKey(500, 'End', 1000)).toBe(700)
  })
  test('ほかのキーは null(何もしない)', () => {
    for (const key of ['Enter', 'a', 'ArrowUp', 'Tab']) expect(widthFromKey(400, key, 1400)).toBeNull()
  })
})

describe('幅の保存', () => {
  const store = new Map<string, string>()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const install = (failing = false) => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (k: string) => {
            if (failing) throw new Error('blocked')
            return store.get(k) ?? null
          },
          setItem: (k: string, v: string) => {
            if (failing) throw new Error('blocked')
            store.set(k, v)
          },
        },
      },
    })
  }
  afterEach(() => {
    store.clear()
    if (original) Object.defineProperty(globalThis, 'window', original)
    else delete (globalThis as { window?: unknown }).window
  })

  test('保存した幅を、次に読める。保存がなければ既定の幅', () => {
    install()
    expect(loadPanelWidth()).toBe(PANEL_DEFAULT_PX)
    savePanelWidth(487.4)
    expect(loadPanelWidth()).toBe(487)
  })
  test('壊れた値・範囲外の値は、範囲に収める(または既定)', () => {
    install()
    store.set('ningyoutukai.documentsPanelWidth', 'abc')
    expect(loadPanelWidth()).toBe(PANEL_DEFAULT_PX)
    store.set('ningyoutukai.documentsPanelWidth', '50')
    expect(loadPanelWidth()).toBe(PANEL_MIN_PX)
    store.set('ningyoutukai.documentsPanelWidth', '99999')
    expect(loadPanelWidth()).toBe(PANEL_MAX_PX)
  })
  test('ブラウザの保存先が使えなくても、例外にならず、既定の幅', () => {
    install(true)
    expect(loadPanelWidth()).toBe(PANEL_DEFAULT_PX)
    expect(() => savePanelWidth(400)).not.toThrow()
  })
})
