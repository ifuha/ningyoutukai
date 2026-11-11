import { describe, expect, test } from 'bun:test'
import { decideDragAction, type DragTarget } from './canvas-gesture'

const base = {
  pointerType: 'mouse',
  button: 0,
  spaceHeld: false,
  tool: 'select' as const,
  target: 'background' as DragTarget,
  movable: true,
}

describe('decideDragAction: マウス・トラックパッド(1 本指)', () => {
  test('背景のドラッグは、範囲選択', () => {
    expect(decideDragAction(base)).toBe('marquee')
  })

  test('動かせるもの(カード・メモ)の上のドラッグは、動かす', () => {
    expect(decideDragAction({ ...base, target: 'item' })).toBe('move')
  })

  test('セクションの内側の空いた所のドラッグは、そのセクションを動かす(いまの動きを残す)', () => {
    expect(decideDragAction({ ...base, target: 'section-interior' })).toBe('move')
  })

  test('動かせないもの(権限がない)の上は、背景と同じで、範囲選択', () => {
    expect(decideDragAction({ ...base, target: 'item', movable: false })).toBe('marquee')
    expect(decideDragAction({ ...base, target: 'section-interior', movable: false })).toBe('marquee')
  })

  test('ペンも、マウスと同じ', () => {
    expect(decideDragAction({ ...base, pointerType: 'pen' })).toBe('marquee')
    expect(decideDragAction({ ...base, pointerType: 'pen', target: 'item' })).toBe('move')
  })
})

describe('decideDragAction: パン', () => {
  test('Space を押しながらのドラッグは、背景でも、ものの上でも、パン', () => {
    for (const target of ['background', 'item', 'section-interior'] as const) {
      expect(decideDragAction({ ...base, spaceHeld: true, target })).toBe('pan')
    }
  })

  test('中ボタンのドラッグは、どこでも、パン', () => {
    for (const target of ['background', 'item', 'section-interior'] as const) {
      expect(decideDragAction({ ...base, button: 1, target })).toBe('pan')
    }
  })

  test('動かせないものの上でも、Space と中ボタンは、パン', () => {
    expect(decideDragAction({ ...base, target: 'item', movable: false, spaceHeld: true })).toBe('pan')
    expect(decideDragAction({ ...base, target: 'item', movable: false, button: 1 })).toBe('pan')
  })
})

describe('decideDragAction: 何もしない', () => {
  test('右ボタンは、何もしない', () => {
    expect(decideDragAction({ ...base, button: 2 })).toBe('none')
    expect(decideDragAction({ ...base, button: 2, target: 'item' })).toBe('none')
  })

  test('「セクション」の道具で描いている間は、何もしない(描く層が受ける)。Space や中ボタンでも', () => {
    for (const target of ['background', 'item', 'section-interior'] as const) {
      expect(decideDragAction({ ...base, tool: 'section', target })).toBe('none')
    }
    expect(decideDragAction({ ...base, tool: 'section', spaceHeld: true })).toBe('none')
    expect(decideDragAction({ ...base, tool: 'section', button: 1 })).toBe('none')
  })
})

describe('decideDragAction: タッチ画面(これまでどおり)', () => {
  const touch = { ...base, pointerType: 'touch' }

  test('背景のドラッグは、パン(範囲選択はしない)', () => {
    expect(decideDragAction(touch)).toBe('pan')
  })

  test('動かせるものの上は、動かす。動かせないものの上は、パン', () => {
    expect(decideDragAction({ ...touch, target: 'item' })).toBe('move')
    expect(decideDragAction({ ...touch, target: 'section-interior' })).toBe('move')
    expect(decideDragAction({ ...touch, target: 'item', movable: false })).toBe('pan')
  })

  test('Space は、タッチには関係しない', () => {
    expect(decideDragAction({ ...touch, spaceHeld: true })).toBe('pan')
    expect(decideDragAction({ ...touch, spaceHeld: true, target: 'item' })).toBe('move')
  })

  test('「セクション」の道具で描いている間は、何もしない', () => {
    expect(decideDragAction({ ...touch, tool: 'section' })).toBe('none')
  })
})
describe('decideDragAction: 選べるが、動かせないもの(他の人のメモ)', () => {
  test('マウス・ペンでは、選ぶ(押した時点で選択する)', () => {
    expect(decideDragAction({ ...base, target: 'item', movable: true, draggable: false })).toBe('move')
    expect(
      decideDragAction({ ...base, pointerType: 'pen', target: 'item', movable: true, draggable: false }),
    ).toBe('move')
  })

  test('タッチでは、パンに譲る', () => {
    expect(
      decideDragAction({
        ...base,
        pointerType: 'touch',
        target: 'item',
        movable: true,
        draggable: false,
      }),
    ).toBe('pan')
  })

  test('選べないものは、draggable に関係なく、マウスは範囲選択・タッチはパン', () => {
    expect(decideDragAction({ ...base, target: 'item', movable: false, draggable: true })).toBe('marquee')
    expect(
      decideDragAction({
        ...base,
        pointerType: 'touch',
        target: 'item',
        movable: false,
        draggable: true,
      }),
    ).toBe('pan')
  })
})
