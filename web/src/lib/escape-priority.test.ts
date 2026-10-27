import { describe, expect, test } from 'bun:test'
import { escapeOwner, isOwnedByFoundation } from './escape-priority'

const idle = {
  tool: 'select' as const,
  selectedSectionId: null as string | null,
  typing: false,
  cardDragging: false,
  editorDragging: false,
  menuOpen: false,
}

describe('escapeOwner(1 回の Esc で、受けるのは 1 つだけ)', () => {
  test('何もしていなければ、誰も受けない', () => {
    expect(escapeOwner(idle)).toBe('none')
  })
  test('セクションを選択中なら、選択の解除', () => {
    expect(escapeOwner({ ...idle, selectedSectionId: 's1' })).toBe('selection')
  })
  test('道具が「セクション」(描いている)なら、描く層。選択があっても、選択は外さない', () => {
    expect(escapeOwner({ ...idle, tool: 'section', selectedSectionId: 's1' })).toBe('draw')
  })
  test('カードのドラッグ中は、ドラッグの取り消し。選択は外さない', () => {
    expect(escapeOwner({ ...idle, cardDragging: true, selectedSectionId: 's1' })).toBe('card-drag')
  })
  test('編集枠のドラッグ・矢印キーの移動の途中は、その取り消し。選択は外さない', () => {
    expect(escapeOwner({ ...idle, editorDragging: true, selectedSectionId: 's1' })).toBe('editor-drag')
  })
  test('名前の入力中は、入力の取り消し(選択は外さない)', () => {
    expect(escapeOwner({ ...idle, typing: true, selectedSectionId: 's1' })).toBe('typing')
  })
  test('メニューが開いているときは、メニューを閉じる(選択は外さない)', () => {
    expect(escapeOwner({ ...idle, menuOpen: true, selectedSectionId: 's1' })).toBe('menu')
  })
  test('優先順位: 描く > カードのドラッグ > 編集枠のドラッグ > 名前の入力 > メニュー > 選択', () => {
    const all = { ...idle, selectedSectionId: 's1', typing: true, cardDragging: true, editorDragging: true, menuOpen: true }
    expect(escapeOwner({ ...all, tool: 'section' })).toBe('draw')
    expect(escapeOwner(all)).toBe('card-drag')
    expect(escapeOwner({ ...all, cardDragging: false })).toBe('editor-drag')
    expect(escapeOwner({ ...all, cardDragging: false, editorDragging: false })).toBe('typing')
    expect(escapeOwner({ ...all, cardDragging: false, editorDragging: false, typing: false })).toBe('menu')
    expect(escapeOwner({ ...all, cardDragging: false, editorDragging: false, typing: false, menuOpen: false })).toBe(
      'selection',
    )
  })
})

describe('isOwnedByFoundation(土台が自分で動くのは、描く・選択の解除だけ)', () => {
  test('描く・選択の解除は土台が受ける', () => {
    expect(isOwnedByFoundation('draw')).toBe(true)
    expect(isOwnedByFoundation('selection')).toBe(true)
  })
  test('ドラッグ・入力・メニュー・何もなしは、土台は動かない(それぞれの部品が受ける)', () => {
    for (const o of ['card-drag', 'editor-drag', 'typing', 'menu', 'none'] as const) {
      expect(isOwnedByFoundation(o)).toBe(false)
    }
  })
})
