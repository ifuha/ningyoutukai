import { describe, expect, test } from 'bun:test'
import {
  BAND_PX,
  HANDLE_PX,
  IDLE,
  NUDGE_STEP,
  NUDGE_STEP_SHIFT,
  SECTION_COLOR_LABELS,
  SECTION_COLOR_ORDER,
  SECTION_NAME_MAX,
  TAG_RECT,
  bandBoxes,
  cancelDrag,
  cancelRename,
  changeDraft,
  commitRename,
  confirmDelete,
  dragPreview,
  endDrag,
  handleBoxes,
  handleCursor,
  inverseScaleStyle,
  isClick,
  keyAction,
  limitDraft,
  menuReduce,
  moveDrag,
  nameKeyAction,
  nudgeRect,
  pickColor,
  pressDrag,
  safeScale,
  screenSize,
  settleNudge,
  startDrag,
  startRename,
  type DragState,
  type KeyInfo,
} from './section-editor-state'
import { MIN_SECTION_SIZE, type Point, type Rect, type ResizeHandle } from './section-edit-geometry'

const R: Rect = { x: 100, y: 200, width: 300, height: 400 }
const P = 1 // 既定のポインタ ID
const right = (r: Rect) => r.x + r.width
const bottom = (r: Rect) => r.y + r.height

const drag = (kind: Parameters<typeof startDrag>[0], delta: Point, scale = 1, origin: Rect = R): DragState =>
  moveDrag(startDrag(kind, origin, { x: 1000, y: 1000 }, P), { x: 1000 + delta.x, y: 1000 + delta.y }, scale, P)

describe('拡大率と、画面の大きさの換算', () => {
  test('safeScale: 0 以下・NaN・Infinity は 1 として扱う', () => {
    expect(safeScale(2)).toBe(2)
    expect(safeScale(0.25)).toBe(0.25)
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(safeScale(bad)).toBe(1)
  })
  test('screenSize: 画面の px を、拡大率で割ったキャンバスでの大きさにする(拡大率に関わらず一定の見た目)', () => {
    expect(screenSize(12, 1)).toBe(12)
    expect(screenSize(12, 2)).toBe(6)
    expect(screenSize(12, 0.5)).toBe(24)
  })
  test('inverseScaleStyle: 拡大率を打ち消す(左上を基準に 1 / scale)', () => {
    expect(inverseScaleStyle(2)).toEqual({ transform: 'scale(0.5)', transformOrigin: 'top left' })
    expect(inverseScaleStyle(0).transform).toBe('scale(1)')
  })
})

describe('ハンドルと、つかめる帯の配置', () => {
  test('8 つのハンドルが、重ならずに、角と辺の中央にある', () => {
    const boxes = handleBoxes({ width: 300, height: 400 }, 1)
    expect(boxes.map((b) => b.handle).sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'])
    const at = (h: ResizeHandle) => boxes.find((b) => b.handle === h)!
    expect([at('nw').cx, at('nw').cy]).toEqual([0, 0])
    expect([at('n').cx, at('n').cy]).toEqual([150, 0])
    expect([at('ne').cx, at('ne').cy]).toEqual([300, 0])
    expect([at('e').cx, at('e').cy]).toEqual([300, 200])
    expect([at('se').cx, at('se').cy]).toEqual([300, 400])
    expect([at('s').cx, at('s').cy]).toEqual([150, 400])
    expect([at('sw').cx, at('sw').cy]).toEqual([0, 400])
    expect([at('w').cx, at('w').cy]).toEqual([0, 200])
    expect(new Set(boxes.map((b) => `${b.cx},${b.cy}`)).size).toBe(8)
  })
  test('ハンドルの大きさは、拡大率で割る(見た目が一定)', () => {
    expect(handleBoxes(R, 1)[0]!.size).toBe(HANDLE_PX)
    expect(handleBoxes(R, 2)[0]!.size).toBe(HANDLE_PX / 2)
    expect(handleBoxes(R, 0.5)[0]!.size).toBe(HANDLE_PX * 2)
  })
  test('カーソルの形が、ハンドルに合う', () => {
    expect(handleCursor('n')).toBe('ns-resize')
    expect(handleCursor('s')).toBe('ns-resize')
    expect(handleCursor('e')).toBe('ew-resize')
    expect(handleCursor('w')).toBe('ew-resize')
    expect(handleCursor('ne')).toBe('nesw-resize')
    expect(handleCursor('sw')).toBe('nesw-resize')
    expect(handleCursor('nw')).toBe('nwse-resize')
    expect(handleCursor('se')).toBe('nwse-resize')
  })
  test('帯: 4 辺の線をまたいで、内と外に半分ずつ。太さは拡大率で割る', () => {
    const bands = bandBoxes({ width: 300, height: 400 }, 2)
    const b = BAND_PX / 2
    expect(bands.map((x) => x.side).sort()).toEqual(['bottom', 'left', 'right', 'top'])
    const top = bands.find((x) => x.side === 'top')!
    expect(top).toEqual({ side: 'top', left: -b / 2, top: -b / 2, width: 300 + b, height: b })
    const rightBand = bands.find((x) => x.side === 'right')!
    expect(rightBand.left).toBe(300 - b / 2)
    expect(rightBand.height).toBe(400 + b)
  })
  test('札の位置は、SectionBox の札と同じ(外側の左端から右へ 18、上の辺から上へ 16、120 × 32)', () => {
    expect(TAG_RECT).toEqual({ left: 18, top: -16, width: 120, height: 32 })
  })
})

describe('クリックの判定', () => {
  test('近ければクリック、遠ければドラッグ', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(true)
    expect(isClick({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(true) // 距離 3.6
    expect(isClick({ x: 10, y: 10 }, { x: 13, y: 14 })).toBe(false) // 距離 5
  })
  test('しきい値の境界(4px)', () => {
    expect(isClick({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true)
    expect(isClick({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(false)
    expect(isClick({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false) // 距離 4.24
  })
})

describe('ドラッグ: 移動', () => {
  test('画面の差分を拡大率で割った、キャンバスの差分で動く', () => {
    const s = drag({ type: 'move' }, { x: 100, y: 40 }, 2)
    expect(dragPreview(s)).toEqual({ x: 150, y: 220, width: 300, height: 400 })
  })
  test('拡大率で割る(割らないと 4 倍の距離を動いてしまう)', () => {
    const s = drag({ type: 'move' }, { x: 40, y: 0 }, 4)
    expect(dragPreview(s)!.x).toBe(110)
  })
  test('拡大率が不正でも、壊れない(1 として扱う)', () => {
    expect(dragPreview(drag({ type: 'move' }, { x: 10, y: 0 }, 0))!.x).toBe(110)
    expect(dragPreview(drag({ type: 'move' }, { x: 10, y: 0 }, Number.NaN))!.x).toBe(110)
  })
  test('離したときに、1 回だけ確定する。状態は待機に戻る', () => {
    const s = drag({ type: 'move' }, { x: 30, y: 0 })
    const r = endDrag(s, P)
    expect(r.commit).toEqual({ x: 130, y: 200, width: 300, height: 400 })
    expect(r.state).toEqual(IDLE)
    // 待機に戻ったあとに、もう一度離しても、確定しない
    expect(endDrag(r.state, P).commit).toBeNull()
  })
  test('動かなかったときは、確定しない(クリックだけ)', () => {
    expect(endDrag(drag({ type: 'move' }, { x: 0, y: 0 }), P).commit).toBeNull()
  })
  test('0.5 以内の動きは、動かなかった扱い。往復して元に戻ったときも確定しない', () => {
    expect(endDrag(drag({ type: 'move' }, { x: 0.4, y: -0.3 }), P).commit).toBeNull()
    let s = drag({ type: 'move' }, { x: 80, y: 80 })
    s = moveDrag(s, { x: 1000, y: 1000 }, 1, P)
    expect(endDrag(s, P).commit).toBeNull()
  })
  test('座標の上限に収まる', () => {
    const s = drag({ type: 'move' }, { x: 5_000_000, y: -5_000_000 })
    expect(dragPreview(s)).toEqual({ x: 1_000_000, y: -1_000_000, width: 300, height: 400 })
  })
  test('途中の動きは、プレビューだけ。親には渡さない(確定は離したときだけ)', () => {
    let s = startDrag({ type: 'move' }, R, { x: 0, y: 0 }, P)
    for (const x of [5, 10, 15, 20]) s = moveDrag(s, { x, y: 0 }, 1, P)
    expect(dragPreview(s)!.x).toBe(120)
    expect(s.phase).toBe('dragging')
  })
})

describe('ドラッグ: 大きさの変更(8 つのハンドル)', () => {
  const D = { x: 20, y: 30 }
  test('東・南・南東: 反対側の辺(左・上)は動かない', () => {
    const e = dragPreview(drag({ type: 'resize', handle: 'e' }, D))!
    expect(e).toEqual({ x: 100, y: 200, width: 320, height: 400 })
    const s = dragPreview(drag({ type: 'resize', handle: 's' }, D))!
    expect(s).toEqual({ x: 100, y: 200, width: 300, height: 430 })
    const se = dragPreview(drag({ type: 'resize', handle: 'se' }, D))!
    expect(se).toEqual({ x: 100, y: 200, width: 320, height: 430 })
  })
  test('西・北・北西: 反対側の辺(右・下)は動かない', () => {
    const w = dragPreview(drag({ type: 'resize', handle: 'w' }, D))!
    expect(right(w)).toBe(right(R))
    expect([w.x, w.width]).toEqual([120, 280])
    const n = dragPreview(drag({ type: 'resize', handle: 'n' }, D))!
    expect(bottom(n)).toBe(bottom(R))
    expect([n.y, n.height]).toEqual([230, 370])
    const nw = dragPreview(drag({ type: 'resize', handle: 'nw' }, D))!
    expect([right(nw), bottom(nw)]).toEqual([right(R), bottom(R)])
    expect([nw.x, nw.y]).toEqual([120, 230])
  })
  test('北東・南西: 角は 2 辺を同時に動かし、残りの 2 辺は動かない', () => {
    const ne = dragPreview(drag({ type: 'resize', handle: 'ne' }, D))!
    expect([ne.x, bottom(ne)]).toEqual([100, bottom(R)])
    expect([right(ne), ne.y]).toEqual([right(R) + 20, 230])
    const sw = dragPreview(drag({ type: 'resize', handle: 'sw' }, D))!
    expect([right(sw), sw.y]).toEqual([right(R), 200])
    expect([sw.x, bottom(sw)]).toEqual([120, bottom(R) + 30])
  })
  test('辺のハンドルは、その軸だけ動かす(もう片方の軸の差分は無視)', () => {
    const e = dragPreview(drag({ type: 'resize', handle: 'e' }, { x: 20, y: 999 }))!
    expect([e.y, e.height]).toEqual([200, 400])
    const n = dragPreview(drag({ type: 'resize', handle: 'n' }, { x: 999, y: 30 }))!
    expect([n.x, n.width]).toEqual([100, 300])
  })
  test('最小の大きさで止まる(反転しない)', () => {
    const e = dragPreview(drag({ type: 'resize', handle: 'e' }, { x: -10_000, y: 0 }))!
    expect(e.width).toBe(MIN_SECTION_SIZE)
    expect(e.x).toBe(100)
    const nw = dragPreview(drag({ type: 'resize', handle: 'nw' }, { x: 10_000, y: 10_000 }))!
    expect([nw.width, nw.height]).toEqual([MIN_SECTION_SIZE, MIN_SECTION_SIZE])
    expect([right(nw), bottom(nw)]).toEqual([right(R), bottom(R)])
  })
  test('差分は、拡大率で割った、キャンバスの差分(画面で 40px、拡大率 2 なら 20)', () => {
    const e = dragPreview(drag({ type: 'resize', handle: 'e' }, { x: 40, y: 0 }, 2))!
    expect(e.width).toBe(320)
  })
  test('離したときに、1 回だけ確定する。動かなかったときは確定しない', () => {
    const s = drag({ type: 'resize', handle: 'se' }, D)
    const r = endDrag(s, P)
    expect(r.commit).toEqual({ x: 100, y: 200, width: 320, height: 430 })
    expect(endDrag(drag({ type: 'resize', handle: 'se' }, { x: 0, y: 0 }), P).commit).toBeNull()
  })
})

describe('ドラッグ: 押してから動き出すまで(クリックとドラッグの区別)', () => {
  const press = (pointerId = P) => pressDrag({ type: 'move' }, R, { x: 1000, y: 1000 }, pointerId)
  const at = (s: DragState, x: number, y: number, scale = 1, pointerId = P) =>
    moveDrag(s, { x: 1000 + x, y: 1000 + y }, scale, pointerId)

  test('押した直後は待機でも、ドラッグ中でもない。プレビューは出ない', () => {
    const s = press()
    expect(s.phase).toBe('pressed')
    expect(dragPreview(s)).toBeNull()
  })
  test('しきい値(4px)以内の動きは、動かさない(クリックのまま)', () => {
    const s = press()
    expect(at(s, 4, 0)).toBe(s)
    expect(at(s, 2, 2)).toBe(s)
    expect(dragPreview(at(s, 3, 0))).toBeNull()
  })
  test('しきい値を超えたら、ドラッグになる。押した点を起点にするので、飛ばない', () => {
    const s = at(press(), 5, 0)
    expect(s.phase).toBe('dragging')
    // 5px 動いた分だけ(しきい値の分を落とさない・上乗せしない)
    expect(dragPreview(s)).toEqual({ x: 105, y: 200, width: 300, height: 400 })
  })
  test('ドラッグになったあとは、しきい値の内側に戻っても、そのまま動かせる(往復で元に戻せる)', () => {
    let s = at(press(), 40, 30)
    expect(dragPreview(s)).toEqual({ x: 140, y: 230, width: 300, height: 400 })
    s = at(s, 1, 1)
    expect(s.phase).toBe('dragging')
    expect(dragPreview(s)).toEqual({ x: 101, y: 201, width: 300, height: 400 })
  })
  test('拡大率で割る(しきい値は画面の px、動かす量はキャンバスの座標)', () => {
    const s = at(press(), 40, 0, 4)
    expect(dragPreview(s)!.x).toBe(110)
  })
  test('クリックだけで離したときは、確定せず、待機に戻る', () => {
    const r = endDrag(at(press(), 3, 0), P)
    expect(r.commit).toBeNull()
    expect(r.state).toEqual(IDLE)
  })
  test('ドラッグして離したときは、1 回だけ確定する', () => {
    const r = endDrag(at(press(), 60, 0), P)
    expect(r.commit).toEqual({ x: 160, y: 200, width: 300, height: 400 })
    expect(r.state).toEqual(IDLE)
    expect(endDrag(r.state, P).commit).toBeNull()
  })
  test('ドラッグになっても、元の位置に戻して離したら、確定しない', () => {
    let s = at(press(), 60, 0)
    s = at(s, 0, 0)
    expect(endDrag(s, P).commit).toBeNull()
  })
  test('Esc(cancelDrag)で、押した直後でもドラッグ中でも、待機に戻る。確定しない', () => {
    expect(endDrag(cancelDrag(), P).commit).toBeNull()
    expect(cancelDrag()).toEqual(IDLE)
  })
  test('別のポインタ(2 本目の指)の動き・離しは、押した直後でも無視する', () => {
    const s = press(7)
    expect(at(s, 500, 500, 1, 8)).toBe(s)
    const r = endDrag(s, 8)
    expect(r.state).toBe(s)
    expect(r.commit).toBeNull()
  })
  test('大きさの変更(ハンドル)は、これまでどおり、押してすぐ始まる(しきい値なし)', () => {
    const s = startDrag({ type: 'resize', handle: 'e' }, R, { x: 1000, y: 1000 }, P)
    expect(dragPreview(moveDrag(s, { x: 1001, y: 1000 }, 1, P))!.width).toBe(301)
  })
})

describe('ドラッグ: 取り消しと、ほかのポインタ', () => {
  test('Esc(cancelDrag)で待機に戻り、プレビューも消える。親には何も渡さない', () => {
    const s = drag({ type: 'move' }, { x: 50, y: 50 })
    expect(dragPreview(s)).not.toBeNull()
    const after = cancelDrag()
    expect(after).toEqual(IDLE)
    expect(dragPreview(after)).toBeNull()
    // 取り消したあとに離しても、確定しない
    expect(endDrag(after, P).commit).toBeNull()
  })
  test('2 本目の指(別のポインタ ID)の動き・離しは、無視する', () => {
    let s = startDrag({ type: 'move' }, R, { x: 0, y: 0 }, 7)
    const before = s
    s = moveDrag(s, { x: 500, y: 500 }, 1, 8)
    expect(s).toBe(before)
    const r = endDrag(s, 8)
    expect(r.commit).toBeNull()
    expect(r.state).toBe(before) // ドラッグは続いている
    expect(endDrag(s, 7).commit).toBeNull() // 7 は動いていないので、確定しない
  })
  test('待機中の move は、何もしない', () => {
    expect(moveDrag(IDLE, { x: 10, y: 10 }, 1, P)).toBe(IDLE)
    expect(dragPreview(IDLE)).toBeNull()
  })
})

describe('矢印キーの移動を、1 回にまとめる', () => {
  test('nudgeRect は、差分だけ動かす(上限に収める)', () => {
    expect(nudgeRect(R, { x: 1, y: 0 })).toEqual({ ...R, x: 101 })
    expect(nudgeRect({ ...R, x: 999_999 }, { x: 10, y: 0 }).x).toBe(1_000_000)
  })
  test('連打した結果は、まとめて 1 つの四角になり、待ち時間のあとに確定する', () => {
    let p = R
    for (let i = 0; i < 5; i++) p = nudgeRect(p, { x: NUDGE_STEP, y: 0 })
    p = nudgeRect(p, { x: 0, y: NUDGE_STEP_SHIFT })
    expect(settleNudge(R, p)).toEqual({ ...R, x: 105, y: 210 })
  })
  test('往復して元に戻ったときは、確定しない', () => {
    const p = nudgeRect(nudgeRect(R, { x: 1, y: 0 }), { x: -1, y: 0 })
    expect(settleNudge(R, p)).toBeNull()
  })
})

describe('名前の編集', () => {
  test('始めると、いまの名前が入る', () => {
    expect(startRename('設計')).toEqual({ editing: true, original: '設計', draft: '設計' })
  })
  test('確定: 前後の空白を取り除いた名前を、1 回だけ渡す。編集は終わる', () => {
    const s = changeDraft(startRename('設計'), '  開発チーム  ')
    const r = commitRename(s)
    expect(r.rename).toBe('開発チーム')
    expect(r.state).toEqual({ editing: false })
    expect(commitRename(r.state).rename).toBeNull() // 2 回目は渡さない
  })
  test('空・空白だけは確定しない(元の表示に戻る)', () => {
    for (const draft of ['', '   ', '\t\n', '　　']) {
      const r = commitRename(changeDraft(startRename('設計'), draft))
      expect(r.rename).toBeNull()
      expect(r.state).toEqual({ editing: false })
    }
  })
  test('変更がなければ渡さない(前後の空白だけの違いも、変更なし)', () => {
    expect(commitRename(startRename('設計')).rename).toBeNull()
    expect(commitRename(changeDraft(startRename('設計'), ' 設計 ')).rename).toBeNull()
  })
  test('Esc(cancelRename)で、何も渡さずに戻る', () => {
    expect(cancelRename()).toEqual({ editing: false })
  })
  test('50 文字まで: 51 文字目以降は入らない。ちょうど 50 文字は通る', () => {
    const fifty = 'あ'.repeat(SECTION_NAME_MAX)
    expect(limitDraft(fifty)).toBe(fifty)
    expect(limitDraft(fifty + 'い')).toBe(fifty)
    const r = commitRename(changeDraft(startRename('設計'), fifty + 'い'))
    expect(r.rename).toBe(fifty)
  })
  test('文字数はコードポイントで数える(api と同じ。サロゲートペアの文字を、2 文字に数えない)', () => {
    const fifty = '𠮷'.repeat(SECTION_NAME_MAX)
    expect([...limitDraft(fifty + '𠮷')].length).toBe(SECTION_NAME_MAX)
    expect(limitDraft(fifty)).toBe(fifty)
  })
  test('NUL 文字は取り除く(api が受け付けない)', () => {
    expect(limitDraft('a\u0000b')).toBe('ab')
  })
  test('編集中でないときの入力・確定は、何もしない', () => {
    const idle = { editing: false } as const
    expect(changeDraft(idle, 'x')).toBe(idle)
    expect(commitRename(idle)).toEqual({ state: idle, rename: null })
  })
  test('キー: Enter で確定、Esc で取り消し。日本語の変換中の Enter は無視する', () => {
    expect(nameKeyAction({ key: 'Enter', isComposing: false })).toBe('commit')
    expect(nameKeyAction({ key: 'Escape', isComposing: false })).toBe('cancel')
    expect(nameKeyAction({ key: 'Enter', isComposing: true })).toBeNull()
    expect(nameKeyAction({ key: 'Enter', isComposing: false, keyCode: 229 })).toBeNull()
    expect(nameKeyAction({ key: 'a', isComposing: false })).toBeNull()
  })
})

describe('色と削除のメニュー', () => {
  test('色の並びと名前が、6 色そろっている', () => {
    expect([...SECTION_COLOR_ORDER].sort()).toEqual(['blue', 'green', 'lightblue', 'purple', 'red', 'yellow'])
    for (const c of SECTION_COLOR_ORDER) expect(SECTION_COLOR_LABELS[c].length).toBeGreaterThan(0)
    expect(new Set(Object.values(SECTION_COLOR_LABELS)).size).toBe(6)
  })
  test('開閉: toggle で開き、もう一度で閉じる。close はいつでも閉じる', () => {
    expect(menuReduce('closed', { type: 'toggle' })).toBe('menu')
    expect(menuReduce('menu', { type: 'toggle' })).toBe('closed')
    expect(menuReduce('confirm-delete', { type: 'toggle' })).toBe('closed')
    for (const s of ['closed', 'menu', 'confirm-delete'] as const) expect(menuReduce(s, { type: 'close' })).toBe('closed')
  })
  test('削除は、確認を挟む(menu → confirm-delete → 削除する)。やめるとメニューに戻る', () => {
    const asked = menuReduce('menu', { type: 'ask-delete' })
    expect(asked).toBe('confirm-delete')
    expect(menuReduce(asked, { type: 'cancel-delete' })).toBe('menu')
    expect(menuReduce('menu', { type: 'cancel-delete' })).toBe('menu')
    expect(confirmDelete(asked)).toEqual({ menu: 'closed', remove: true })
  })
  test('確認の表示でない状態からは、削除しない(1 回で消えない)', () => {
    expect(confirmDelete('menu')).toEqual({ menu: 'menu', remove: false })
    expect(confirmDelete('closed')).toEqual({ menu: 'closed', remove: false })
  })
  test('キーボードの Delete からも、確認の表示になる(メニューが閉じていても)', () => {
    expect(menuReduce('closed', { type: 'ask-delete' })).toBe('confirm-delete')
  })
  test('色を選ぶと、メニューは閉じる。いまと同じ色なら、渡さない', () => {
    expect(pickColor('red', 'blue')).toEqual({ menu: 'closed', color: 'blue' })
    expect(pickColor('red', 'red')).toEqual({ menu: 'closed', color: null })
  })
})

describe('選択中のキー操作', () => {
  const key = (over: Partial<KeyInfo> & { key: string }): KeyInfo => ({
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    inEditable: false,
    ...over,
  })
  test('Delete / Backspace は、削除の確認', () => {
    expect(keyAction(key({ key: 'Delete' }))).toEqual({ type: 'ask-delete' })
    expect(keyAction(key({ key: 'Backspace' }))).toEqual({ type: 'ask-delete' })
  })
  test('矢印キーは 1px、Shift を押しながらなら 10px', () => {
    expect(keyAction(key({ key: 'ArrowLeft' }))).toEqual({ type: 'nudge', delta: { x: -1, y: 0 } })
    expect(keyAction(key({ key: 'ArrowRight' }))).toEqual({ type: 'nudge', delta: { x: 1, y: 0 } })
    expect(keyAction(key({ key: 'ArrowUp' }))).toEqual({ type: 'nudge', delta: { x: 0, y: -1 } })
    expect(keyAction(key({ key: 'ArrowDown' }))).toEqual({ type: 'nudge', delta: { x: 0, y: 1 } })
    expect(keyAction(key({ key: 'ArrowRight', shiftKey: true }))).toEqual({ type: 'nudge', delta: { x: 10, y: 0 } })
    expect(keyAction(key({ key: 'ArrowUp', shiftKey: true }))).toEqual({ type: 'nudge', delta: { x: 0, y: -10 } })
  })
  test('Esc は取り消し', () => {
    expect(keyAction(key({ key: 'Escape' }))).toEqual({ type: 'escape' })
  })
  test('名前を入力しているとき(入力欄の中)は、削除にも移動にもしない', () => {
    for (const k of ['Delete', 'Backspace', 'ArrowLeft', 'Escape']) {
      expect(keyAction(key({ key: k, inEditable: true }))).toBeNull()
    }
  })
  test('Ctrl / Cmd / Alt つきは、ブラウザの操作なので、取らない', () => {
    expect(keyAction(key({ key: 'Backspace', metaKey: true }))).toBeNull()
    expect(keyAction(key({ key: 'ArrowLeft', ctrlKey: true }))).toBeNull()
    expect(keyAction(key({ key: 'ArrowLeft', altKey: true }))).toBeNull()
  })
  test('ほかのキーは、何もしない', () => {
    for (const k of ['a', 'Enter', 'Tab', ' ', 'Shift']) expect(keyAction(key({ key: k }))).toBeNull()
  })
})
