import { describe, expect, test } from 'bun:test'
import { aiBox, aiConnectorTargets, aiDefaultOrigin, currentOffset, ownerBox, type AiLike } from './ai-connector'
import { connectorPath } from './tree-layout'

// ツリーの AI のカードの、置き場所と線の入力の計算(plugin)

const ai = (over: Partial<AiLike> = {}): AiLike => ({ tokenId: 'k1', offsetX: null, offsetY: null, ...over })

describe('置き場所', () => {
  test('下は持ち主の下(16px 空ける・左 16px)、右は持ち主の右(24px 空ける)。2 枚目は 56px 下', () => {
    expect(aiDefaultOrigin('bottom', 0, 100)).toEqual({ left: 16, top: 116 })
    expect(aiDefaultOrigin('bottom', 1, 100)).toEqual({ left: 16, top: 172 })
    expect(aiDefaultOrigin('right', 0, 100)).toEqual({ left: 264, top: 12 })
  })
  test('動かしたずれは、矩形の位置に足される。大きさは変わらない', () => {
    expect(aiBox('bottom', 0, 100, 30, -10)).toEqual({ left: 46, top: 106, width: 200, height: 48 })
  })
  test('持ち主の矩形は、左上が原点・幅 240・高さは測った値', () => {
    expect(ownerBox(120)).toEqual({ left: 0, top: 0, width: 240, height: 120 })
  })
})

describe('currentOffset', () => {
  test('保存された位置。なければ 0。つかんでいる間の位置があれば、そちらが優先', () => {
    expect(currentOffset(ai(), {})).toEqual({ x: 0, y: 0 })
    expect(currentOffset(ai({ offsetX: 5, offsetY: 6 }), {})).toEqual({ x: 5, y: 6 })
    expect(currentOffset(ai({ offsetX: 5, offsetY: 6 }), { k1: { x: 9, y: 9 } })).toEqual({ x: 9, y: 9 })
  })
})

describe('aiConnectorTargets', () => {
  test('AI ごとに 1 本。id はトークン ID。つかんでいる間の位置が反映される', () => {
    const targets = aiConnectorTargets([ai({ tokenId: 'a' }), ai({ tokenId: 'b' })], 'bottom', 100, { b: { x: 80, y: 40 } })
    expect(targets.map((t) => t.id)).toEqual(['a', 'b'])
    expect(targets[0]!.box).toEqual(aiBox('bottom', 0, 100, 0, 0))
    expect(targets[1]!.box).toEqual(aiBox('bottom', 1, 100, 80, 40))
  })
  test('線の親側の端は、動かしても変わらない(持ち主の下の中央)。子の端だけが動く', () => {
    const parent = ownerBox(100)
    const still = connectorPath(parent, aiConnectorTargets([ai()], 'bottom', 100)[0]!.box)
    const moved = connectorPath(parent, aiConnectorTargets([ai()], 'bottom', 100, { k1: { x: 80, y: 40 } })[0]!.box)
    expect(still.d.startsWith('M 120 100')).toBe(true)
    expect(moved.d.startsWith('M 120 100')).toBe(true)
    expect(moved.d).not.toBe(still.d)
  })
})
