import { describe, expect, test } from 'bun:test'
import { revisionAction } from './revision-sync'
import { engagedDragCount, isDragEngaged, startDragSession } from './drag-session'
import { FakeScheduler, FakeTarget, fakeBody, pointerEvent } from './drag-test-support'

describe('revisionAction', () => {
  test('最初の版は、基準として覚えるだけ(ドラッグ中でも)', () => {
    expect(revisionAction(null, 'a', false)).toBe('baseline')
    expect(revisionAction(null, 'a', true)).toBe('baseline')
  })

  test('変わっていなければ、何もしない(ドラッグ中でも)', () => {
    expect(revisionAction('a', 'a', false)).toBe('none')
    expect(revisionAction('a', 'a', true)).toBe('none')
  })

  test('変わったら、取り直す', () => {
    expect(revisionAction('a', 'b', false)).toBe('refresh')
  })

  test('変わっても、ドラッグの最中は待つ', () => {
    expect(revisionAction('a', 'b', true)).toBe('defer')
  })
})

describe('ドラッグが確定している操作の数(isDragEngaged)', () => {
  // 全体のテストで、ほかのファイルが確定したまま終えない操作を残すことがある。数の差で確かめる
  function start(pointerId = 1, withLock = true) {
    const target = new FakeTarget()
    const session = startDragSession({
      target,
      pointerId,
      scheduler: new FakeScheduler(),
      lock: withLock ? { body: fakeBody(), cursor: 'grabbing' } : undefined,
      onMove: () => true,
      onUp: () => {},
      onCancel: () => {},
    })
    return { target, session }
  }

  test('押しただけ(確定前)では増えない。確定(engage)で 1 増え、終わったら戻る', () => {
    const base = engagedDragCount()
    const { target, session } = start()
    expect(engagedDragCount()).toBe(base)
    session.engage()
    expect(engagedDragCount()).toBe(base + 1)
    expect(isDragEngaged()).toBe(true)
    target.dispatch('pointerup', pointerEvent(1, 0, 0))
    expect(engagedDragCount()).toBe(base)
  })

  test('engage を何度呼んでも 1 つとして数える。end を何度呼んでも、戻しすぎない', () => {
    const base = engagedDragCount()
    const a = start(1)
    const b = start(2)
    a.session.engage()
    a.session.engage()
    expect(engagedDragCount()).toBe(base + 1)
    a.session.end()
    a.session.end()
    expect(engagedDragCount()).toBe(base)
    b.session.engage()
    expect(engagedDragCount()).toBe(base + 1)
    b.session.end()
    expect(engagedDragCount()).toBe(base)
  })

  test('取り消し(Esc)でも戻る。確定していないまま終わっても、数が狂わない', () => {
    const base = engagedDragCount()
    const a = start()
    a.session.engage()
    a.target.dispatch('keydown', { key: 'Escape' })
    expect(engagedDragCount()).toBe(base)
    const b = start()
    b.session.end() // 確定せずに終わる
    expect(engagedDragCount()).toBe(base)
  })

  test('lock が無い操作でも、確定を数える', () => {
    const base = engagedDragCount()
    const { session } = start(1, false)
    session.engage()
    expect(engagedDragCount()).toBe(base + 1)
    session.end()
    expect(engagedDragCount()).toBe(base)
  })
})
