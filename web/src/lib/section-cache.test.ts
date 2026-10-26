import { describe, expect, test } from 'bun:test'
import {
  applyMemberMove,
  applySectionCreate,
  applySectionDelete,
  applySectionUpdate,
  nextSectionColor,
  nextSectionName,
} from './section-cache'
import type { CachedMember, CachedSection } from './section-cache'

const section = (over: Partial<CachedSection> = {}): CachedSection => ({
  sectionId: 's1',
  sectionName: '設計',
  color: 'red',
  x: 100,
  y: 100,
  width: 300,
  height: 400,
  memberIds: [],
  ...over,
})
const member = (id: string, sectionId: string | null, pos: [number, number] | null): CachedMember => ({
  productMemberId: id,
  sectionId,
  positionX: pos ? pos[0] : null,
  positionY: pos ? pos[1] : null,
})
const tree = (leader: CachedMember, members: CachedMember[]) => ({ product: { productId: 'p' }, leader, members })

describe('applySectionUpdate(セクションの更新)', () => {
  test('名前・色・大きさの変更: セクションだけが変わり、メンバーは動かない', () => {
    const t = tree(member('L', null, null), [member('M1', 's1', [150, 150])])
    const r = applySectionUpdate([section()], t, 's1', { sectionName: '開発', color: 'blue', width: 500 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.sections[0]).toMatchObject({ sectionName: '開発', color: 'blue', width: 500, x: 100, height: 400 })
    expect(r.tree?.members[0]).toEqual(t.members[0])
  })
  test('位置(x, y)を変えると、所属メンバーのうち位置を持つものが、同じ差分だけ動く(api と同じ)', () => {
    const t = tree(member('L', null, [10, 10]), [member('M1', 's1', [150, 150]), member('M2', 's1', [200, 120])])
    const r = applySectionUpdate([section()], t, 's1', { x: 130, y: 90 }) // 差分 (+30, -10)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.sections[0]).toMatchObject({ x: 130, y: 90 })
    expect(r.tree?.members[0]).toMatchObject({ positionX: 180, positionY: 140 })
    expect(r.tree?.members[1]).toMatchObject({ positionX: 230, positionY: 110 })
    // 所属していないリーダーは動かない
    expect(r.tree?.leader).toMatchObject({ positionX: 10, positionY: 10 })
  })
  test('位置が NULL の所属メンバーは、NULL のまま(自動配置のまま)', () => {
    const t = tree(member('L', null, null), [member('M1', 's1', null), member('M2', 's1', [150, 150])])
    const r = applySectionUpdate([section()], t, 's1', { x: 200 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree?.members[0]).toMatchObject({ positionX: null, positionY: null })
    expect(r.tree?.members[1]).toMatchObject({ positionX: 250, positionY: 150 })
  })
  test('別のセクションに所属するメンバーは、動かない', () => {
    const t = tree(member('L', null, null), [member('M1', 's2', [150, 150])])
    const r = applySectionUpdate([section(), section({ sectionId: 's2', sectionName: '開発' })], t, 's1', { x: 300 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree?.members[0]).toMatchObject({ positionX: 150, positionY: 150 })
  })
  test('リーダーのカードも、所属していれば動く', () => {
    const t = tree(member('L', 's1', [120, 130]), [])
    const r = applySectionUpdate([section()], t, 's1', { y: 150 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree?.leader).toMatchObject({ positionX: 120, positionY: 180 })
  })
  test('動かした先が、座標の上限(±1,000,000)を超えるメンバーが 1 人でもいたら、何も変えずに失敗する', () => {
    const t = tree(member('L', null, null), [member('M1', 's1', [999_990, 150]), member('M2', 's1', [150, 150])])
    const r = applySectionUpdate([section()], t, 's1', { x: 100 + 20 })
    expect(r).toEqual({ ok: false, reason: 'out-of-range' })
  })
  test('上限ちょうどは通る', () => {
    const t = tree(member('L', null, null), [member('M1', 's1', [999_990, 150])])
    const r = applySectionUpdate([section()], t, 's1', { x: 110 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree?.members[0]).toMatchObject({ positionX: 1_000_000 })
  })
  test('位置が変わらない(差分が 0)更新では、メンバーを調べない', () => {
    const t = tree(member('L', null, null), [member('M1', 's1', [999_999, 150])])
    const r = applySectionUpdate([section()], t, 's1', { x: 100, sectionName: '名前だけ' })
    expect(r.ok).toBe(true)
  })
  test('存在しないセクションは、失敗(not-found)', () => {
    expect(applySectionUpdate([section()], undefined, 'zz', { x: 1 })).toEqual({ ok: false, reason: 'not-found' })
  })
  test('ツリーが読み込まれていなくても(undefined)、セクションは更新できる', () => {
    const r = applySectionUpdate([section()], undefined, 's1', { x: 0 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree).toBeUndefined()
    expect(r.sections[0].x).toBe(0)
  })
  test('値が undefined の項目は、変えない(キーがあっても)', () => {
    const r = applySectionUpdate([section()], undefined, 's1', { sectionName: undefined, x: 5 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.sections[0]).toMatchObject({ sectionName: '設計', x: 5 })
  })
  test('元のデータは書き換えない(新しい値を返す)', () => {
    const s = section()
    const t = tree(member('L', null, null), [member('M1', 's1', [150, 150])])
    applySectionUpdate([s], t, 's1', { x: 500 })
    expect(s.x).toBe(100)
    expect(t.members[0].positionX).toBe(150)
  })
})

describe('applySectionDelete(セクションの削除)', () => {
  test('セクションが消え、所属していたメンバーは無所属に戻る。メンバーと位置は残る', () => {
    const t = tree(member('L', null, null), [member('M1', 's1', [150, 150]), member('M2', 's2', [10, 10])])
    const r = applySectionDelete([section(), section({ sectionId: 's2' })], t, 's1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.sections.map((s) => s.sectionId)).toEqual(['s2'])
    expect(r.tree?.members[0]).toEqual({ productMemberId: 'M1', sectionId: null, positionX: 150, positionY: 150 })
    expect(r.tree?.members[1].sectionId).toBe('s2')
  })
  test('存在しないセクションは、失敗(not-found)', () => {
    expect(applySectionDelete([section()], undefined, 'zz')).toEqual({ ok: false, reason: 'not-found' })
  })
})

describe('applyMemberMove(カードの移動)', () => {
  const s1 = section({ memberIds: ['M1'] })
  const s2 = section({ sectionId: 's2', memberIds: [] })
  const t = tree(member('L', null, null), [member('M1', 's1', [150, 150])])

  test('位置を更新し、別のセクションへ入れると、元の memberIds から外れ、先に足される', () => {
    const r = applyMemberMove([s1, s2], t, 'M1', { x: 700, y: 50 }, 's2')
    expect(r.tree?.members[0]).toEqual({ productMemberId: 'M1', sectionId: 's2', positionX: 700, positionY: 50 })
    expect(r.sections[0].memberIds).toEqual([])
    expect(r.sections[1].memberIds).toEqual(['M1'])
  })
  test('null は、無所属にする(memberIds から外れる)', () => {
    const r = applyMemberMove([s1, s2], t, 'M1', { x: 5, y: 5 }, null)
    expect(r.tree?.members[0].sectionId).toBeNull()
    expect(r.sections[0].memberIds).toEqual([])
    expect(r.sections[1].memberIds).toEqual([])
  })
  test('sectionId を省略(undefined)すると、所属を変えない(位置だけ変わる)', () => {
    const r = applyMemberMove([s1, s2], t, 'M1', { x: 5, y: 5 }, undefined)
    expect(r.tree?.members[0]).toEqual({ productMemberId: 'M1', sectionId: 's1', positionX: 5, positionY: 5 })
    expect(r.sections[0].memberIds).toEqual(['M1'])
  })
  test('同じセクションの中での移動は、memberIds に 1 回だけ入る', () => {
    const r = applyMemberMove([s1, s2], t, 'M1', { x: 5, y: 5 }, 's1')
    expect(r.sections[0].memberIds).toEqual(['M1'])
  })
  test('位置を持たなかったカードが、初めて位置を持つ', () => {
    const t2 = tree(member('L', null, null), [member('M9', null, null)])
    const r = applyMemberMove([s1], t2, 'M9', { x: 1, y: 2 }, undefined)
    expect(r.tree?.members[0]).toMatchObject({ positionX: 1, positionY: 2 })
  })
  test('リーダーのカードも動かせる', () => {
    const r = applyMemberMove([s1], t, 'L', { x: 9, y: 9 }, undefined)
    expect(r.tree?.leader).toMatchObject({ positionX: 9, positionY: 9 })
  })
  test('元のデータは書き換えない', () => {
    applyMemberMove([s1, s2], t, 'M1', { x: 700, y: 50 }, 's2')
    expect(t.members[0].positionX).toBe(150)
    expect(s1.memberIds).toEqual(['M1'])
  })
})

describe('applySectionCreate / 既定の名前と色', () => {
  test('作成の応答を足す。同じ ID があれば置き換える', () => {
    const a = section({ sectionId: 'a' })
    const b = section({ sectionId: 'b' })
    expect(applySectionCreate([a], b).map((s) => s.sectionId)).toEqual(['a', 'b'])
    expect(applySectionCreate([a, b], { ...b, sectionName: '新' }).find((s) => s.sectionId === 'b')?.sectionName).toBe('新')
  })
  test('既定の名前は、まだ使われていない最小の「セクション N」(重複で 409 にならないように)', () => {
    expect(nextSectionName([])).toBe('セクション 1')
    expect(nextSectionName(['セクション 1'])).toBe('セクション 2')
    expect(nextSectionName(['セクション 1', 'セクション 3'])).toBe('セクション 2')
    expect(nextSectionName(['設計', 'セクション 1 '])).toBe('セクション 2') // 前後の空白は無視
  })
  test('既定の色は、6 色を作った数に応じて順に使う', () => {
    const colors = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => nextSectionColor(new Array(n).fill(0)))
    expect(colors).toEqual(['red', 'yellow', 'green', 'purple', 'lightblue', 'blue', 'red', 'yellow'])
  })
})
