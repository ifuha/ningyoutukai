import { describe, expect, test } from 'bun:test'
import {
  cursorClass,
  escapeAction,
  isToolEnabled,
  isTypingTarget,
  normalizeTool,
  toolAfterCreate,
} from './canvas-tool'

describe('道具の有効・無効', () => {
  test('「セクション」はリーダーだけ。「選択」は誰でも', () => {
    expect(isToolEnabled('section', true)).toBe(true)
    expect(isToolEnabled('section', false)).toBe(false)
    expect(isToolEnabled('select', false)).toBe(true)
  })
  test('使えない道具は「選択」に戻す。使える道具は、そのまま', () => {
    expect(normalizeTool('section', false)).toBe('select')
    expect(normalizeTool('section', true)).toBe('section')
    expect(normalizeTool('select', true)).toBe('select')
  })
  test('セクションを置いたあとは「選択」に戻る', () => {
    expect(toolAfterCreate()).toBe('select')
  })
})

describe('Esc の動き', () => {
  test('「セクション」の道具のときは、「選択」に戻る(選択があっても、先に道具を戻す)', () => {
    expect(escapeAction({ tool: 'section', selectedSectionId: null, typing: false })).toBe('back-to-select')
    expect(escapeAction({ tool: 'section', selectedSectionId: 's1', typing: false })).toBe('back-to-select')
  })
  test('セクションを選択しているときは、選択を外す', () => {
    expect(escapeAction({ tool: 'select', selectedSectionId: 's1', typing: false })).toBe('clear-selection')
    expect(escapeAction({ tool: 'select', selectedSectionId: 's1', typing: false })).toBe('clear-selection')
  })
  test('何もないときは、何もしない', () => {
    expect(escapeAction({ tool: 'select', selectedSectionId: null, typing: false })).toBe('none')
    expect(escapeAction({ tool: 'select', selectedSectionId: null, typing: false })).toBe('none')
  })
  test('文字を打っているとき(名前の変更など)は、何もしない(その入力欄が受ける)', () => {
    expect(escapeAction({ tool: 'section', selectedSectionId: 's1', typing: true })).toBe('none')
    expect(escapeAction({ tool: 'select', selectedSectionId: 's1', typing: true })).toBe('none')
  })
})

describe('文字を打つ要素の判定', () => {
  test('input / textarea / select / 編集できる要素は、文字を打つ要素', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'textarea' })).toBe(true)
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })
  test('ボタン・div・要素なしは、そうではない', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget({})).toBe(false)
  })
})

describe('カーソル', () => {
  test('「セクション」は十字(ドラッグ中も)', () => {
    expect(cursorClass('section')).toBe('cursor-crosshair')
  })
  test('「選択」は通常の矢印', () => {
    expect(cursorClass('select')).toBe('cursor-default')
  })
})
