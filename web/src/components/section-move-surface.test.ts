import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SectionMoveSurface, type SectionMoveSurfaceProps } from './section-move-surface'

// 画面部品の、最小のスモークテスト(DOM なし。サーバーでのマークアップを検査する)
// ポインタ・キーボードでの実際の動き(押す・しきい値・確定・Esc)は、ブラウザが要るので、ここでは確かめない。
//   その判定は `section-editor-state.test.ts`(押してから動き出すまでの遷移)で、守っている
//   ここで確かめるのは: 出すもの・出さないもの(canEdit)、置く位置と大きさ、つかむカーソル、選択を外さない目印

const base: SectionMoveSurfaceProps = {
  section: {
    sectionId: 's1',
    sectionName: '設計チーム',
    color: 'red',
    x: 100,
    y: 200,
    width: 300,
    height: 400,
  },
  canEdit: true,
  scale: 1,
  onSelect: () => {},
  onChange: () => {},
}

const render = (over: Partial<SectionMoveSurfaceProps> = {}) =>
  renderToStaticMarkup(createElement(SectionMoveSurface, { ...base, ...over }))

describe('SectionMoveSurface: 出すもの・出さないもの', () => {
  test('リーダー(canEdit)なら、面を出す', () => {
    expect(render()).toContain('data-section-move-surface="s1"')
  })
  test('リーダーでなければ、何も出さない', () => {
    expect(render({ canEdit: false })).toBe('')
  })
  test('動かしていないときは、プレビューの四角を出さない', () => {
    expect(render()).not.toContain('data-section-move-preview')
  })
})

describe('SectionMoveSurface: 位置と見た目', () => {
  test('セクションと同じ座標と大きさ(キャンバスの座標)で、絶対配置する', () => {
    const html = render()
    expect(html).toContain('left:100px')
    expect(html).toContain('top:200px')
    expect(html).toContain('width:300px')
    expect(html).toContain('height:400px')
    expect(html).toContain('absolute')
  })
  test('負の座標のときの全体のずらし量(offsetX / offsetY)を、位置にだけ足す', () => {
    const html = render({ offsetX: 50, offsetY: -20 })
    expect(html).toContain('left:150px')
    expect(html).toContain('top:180px')
    expect(html).toContain('width:300px') // 大きさには足さない
    expect(html).toContain('height:400px')
  })
  test('拡大率は、面の大きさを変えない(キャンバスの座標のまま)', () => {
    const html = render({ scale: 2 })
    expect(html).toContain('width:300px')
    expect(html).toContain('height:400px')
  })
  test('つかむカーソル(grab)と、タッチで、ブラウザのスクロールに奪われない設定(touch-action: none)', () => {
    const html = render()
    expect(html).toContain('cursor:grab')
    expect(html).toContain('touch-action:none')
  })
  test('ポインタを受ける(pointer-events-auto)。親の層が通していても、面は受ける', () => {
    expect(render()).toContain('pointer-events-auto')
  })
  test('「背景のクリック」として、選択を外さないための目印(data-no-deselect)が付く', () => {
    expect(render()).toContain('data-no-deselect')
  })
})
