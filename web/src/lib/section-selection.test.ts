import { describe, expect, test } from 'bun:test'
import { canEditSections } from './section-permissions'
import {
  isInteractiveTarget,
  reconcileSelection,
  resolveBackgroundClick,
} from './section-selection'

const sec = (sectionId: string, x: number, y: number, width: number, height: number, createdAt?: string) => ({
  sectionId,
  x,
  y,
  width,
  height,
  createdAt,
})

describe('リーダーの判定', () => {
  test('リーダーだけが、セクションを編集できる', () => {
    expect(canEditSections('leader')).toBe(true)
    expect(canEditSections('member')).toBe(false)
    expect(canEditSections(undefined)).toBe(false)
    expect(canEditSections(null)).toBe(false)
    expect(canEditSections('')).toBe(false)
  })
})

describe('reconcileSelection(選択を、いまの状態に合わせる)', () => {
  const sections = [{ sectionId: 'a' }, { sectionId: 'b' }]
  test('リーダーで、セクションがあれば、選択は保たれる', () => {
    expect(reconcileSelection('a', sections, true)).toBe('a')
  })
  test('リーダーでなければ、いつも選択なし', () => {
    expect(reconcileSelection('a', sections, false)).toBeNull()
  })
  test('選択中のセクションが消えたら、選択は外れる', () => {
    expect(reconcileSelection('z', sections, true)).toBeNull()
    expect(reconcileSelection('a', [], true)).toBeNull()
  })
  test('選択がなければ、なしのまま', () => {
    expect(reconcileSelection(null, sections, true)).toBeNull()
  })
})

describe('isInteractiveTarget(ボタンやカードのクリックか)', () => {
  const target = (matches: boolean) => ({ closest: () => (matches ? {} : null) })
  test('ボタン・入力欄・カードなどの内側のクリックは、背景ではない', () => {
    expect(isInteractiveTarget(target(true))).toBe(true)
  })
  test('それ以外は、背景', () => {
    expect(isInteractiveTarget(target(false))).toBe(false)
    expect(isInteractiveTarget(null)).toBe(false)
    expect(isInteractiveTarget({})).toBe(false)
  })
  test('対象の選択子に、カード(data-card-id)とボタンが含まれる', () => {
    let seen = ''
    isInteractiveTarget({
      closest: (selector: string) => {
        seen = selector
        return null
      },
    })
    expect(seen).toContain('[data-card-id]')
    expect(seen).toContain('button')
    expect(seen).toContain('input')
  })
})

describe('resolveBackgroundClick(キャンバスのクリック)', () => {
  const sections = [sec('big', 0, 0, 500, 500), sec('small', 100, 100, 100, 100)]
  const base = { tool: 'select' as const, canEdit: true, interactive: false, sections }

  test('クリックした点にあるセクションを選ぶ。重なるときは、面積が小さい方(内側)', () => {
    expect(resolveBackgroundClick({ ...base, point: { x: 150, y: 150 } })).toEqual({ type: 'select', sectionId: 'small' })
    expect(resolveBackgroundClick({ ...base, point: { x: 300, y: 300 } })).toEqual({ type: 'select', sectionId: 'big' })
  })
  test('どのセクションにもない点のクリックは、選択を外す', () => {
    expect(resolveBackgroundClick({ ...base, point: { x: 900, y: 900 } })).toEqual({ type: 'clear' })
    expect(resolveBackgroundClick({ ...base, point: { x: -10, y: 10 } })).toEqual({ type: 'clear' })
  })
  test('「移動」の道具でも、同じ(選択できる)', () => {
    expect(resolveBackgroundClick({ ...base, tool: 'pan', point: { x: 150, y: 150 } })).toEqual({
      type: 'select',
      sectionId: 'small',
    })
  })
  test('「セクション」の道具(描くとき)は、何もしない', () => {
    expect(resolveBackgroundClick({ ...base, tool: 'section', point: { x: 150, y: 150 } })).toEqual({ type: 'none' })
    expect(resolveBackgroundClick({ ...base, tool: 'section', point: { x: 900, y: 900 } })).toEqual({ type: 'none' })
  })
  test('リーダーでなければ、何もしない(選択できない)', () => {
    expect(resolveBackgroundClick({ ...base, canEdit: false, point: { x: 150, y: 150 } })).toEqual({ type: 'none' })
  })
  test('ボタン・入力欄・カードのクリックは、選択を変えない', () => {
    expect(resolveBackgroundClick({ ...base, interactive: true, point: { x: 150, y: 150 } })).toEqual({ type: 'none' })
    expect(resolveBackgroundClick({ ...base, interactive: true, point: { x: 900, y: 900 } })).toEqual({ type: 'none' })
  })
  test('セクションが 1 つもなければ、背景のクリックは選択を外す', () => {
    expect(resolveBackgroundClick({ ...base, sections: [], point: { x: 10, y: 10 } })).toEqual({ type: 'clear' })
  })
})
