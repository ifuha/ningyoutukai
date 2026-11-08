import { describe, expect, test } from 'bun:test'
import {
  DOC_MAX_BYTES,
  canEditDocument,
  canSave,
  contentTooLarge,
  directoryNameError,
  documentNameError,
  editingCount,
  editingLabel,
  ensureMdName,
  lockNotice,
  textareaEditable,
} from './document-tree'
import { heldState, LOCK_IDLE_MS, type LockState } from './edit-lock'

const NOW = 1_000_000_000_000
const held = (idleMsLeft: number): LockState => heldState({ idleMsLeft, warnBeforeMs: 60_000 }, NOW)

describe('名前', () => {
  test('ensureMdName: 前後の空白を除き、.md がなければ足す。空はそのまま', () => {
    expect(ensureMdName(' spec ')).toBe('spec.md')
    expect(ensureMdName('spec.md')).toBe('spec.md')
    expect(ensureMdName('Spec.MD')).toBe('Spec.MD.md')
    expect(ensureMdName('  ')).toBe('')
  })
  test('documentNameError: 空・長すぎ・/ や \\・前後の空白・.md でない、は誤り(api の検査と同じ)', () => {
    expect(documentNameError('spec.md')).toBeNull()
    expect(documentNameError('日本語の文書.md')).toBeNull()
    expect(documentNameError('')).not.toBeNull()
    expect(documentNameError('a'.repeat(98) + '.md')).not.toBeNull()
    expect(documentNameError('a'.repeat(97) + '.md')).toBeNull()
    for (const bad of ['a/b.md', 'a\\b.md', ' a.md', 'a.md ', 'a.txt', '.md', 'a\u0000.md']) expect(documentNameError(bad)).not.toBeNull()
  })
  test('directoryNameError: 空・長すぎ・/ や \\・前後の空白は誤り', () => {
    expect(directoryNameError('仕様')).toBeNull()
    for (const bad of ['', '  ', 'a/b', 'a\\b', ' x', 'x ', 'あ'.repeat(101)]) expect(directoryNameError(bad)).not.toBeNull()
  })
})

describe('本文の大きさ', () => {
  test('UTF-8 のバイト数で 1MB まで(日本語は 1 文字 3 バイト)', () => {
    expect(contentTooLarge('a'.repeat(DOC_MAX_BYTES))).toBe(false)
    expect(contentTooLarge('a'.repeat(DOC_MAX_BYTES + 1))).toBe(true)
    expect(contentTooLarge('あ'.repeat(349_526))).toBe(true)
    expect(contentTooLarge('あ'.repeat(349_525))).toBe(false)
  })
})

describe('編集中の表示(緑の点と名前)', () => {
  test('だれも編集していなければ null。自分なら「自分が編集中」、他の人なら名前つき', () => {
    expect(editingLabel({ editingBy: null }, 'me')).toBeNull()
    expect(editingLabel({ editingBy: { memberId: 'me', userName: '私' } }, 'me')).toBe('自分が編集中')
    expect(editingLabel({ editingBy: { memberId: 'm2', userName: '田中' } }, 'me')).toBe('田中 さんが編集中')
  })
  test('ディレクトリの中の編集中の数', () => {
    const doc = (editing: boolean) => ({ editingBy: editing ? { memberId: 'm', userName: 'x' } : null }) as never
    expect(editingCount({ documents: [doc(true), doc(false), doc(true)] })).toBe(2)
    expect(editingCount({ documents: [] })).toBe(0)
  })
  test('編集の入口: write があり、他の人が編集中でなければ出す', () => {
    expect(canEditDocument('write', null, 'me')).toBe(true)
    expect(canEditDocument('write', { memberId: 'me', userName: '私' }, 'me')).toBe(true)
    expect(canEditDocument('write', { memberId: 'm2', userName: '田中' }, 'me')).toBe(false)
    expect(canEditDocument('read', null, 'me')).toBe(false)
  })
})

describe('編集ロックの案内', () => {
  test('持っていて、予告の時間でなければ、案内なし', () => {
    expect(lockNotice(held(LOCK_IDLE_MS), NOW)).toBeNull()
    expect(lockNotice({ kind: 'off' }, NOW)).toBeNull()
    expect(lockNotice({ kind: 'acquiring' }, NOW)).toBeNull()
  })
  test('解除の 1 分前から、「あと N 秒」の予告(警告)。入力すると続けられる', () => {
    const n = lockNotice(held(45_000), NOW)!
    expect(n.tone).toBe('warn')
    expect(n.message).toContain('あと 45 秒で編集ロックが解除されます')
    expect(n.message).toContain('入力すると、続けられます')
    expect(lockNotice(held(45_000), NOW + 20_000)!.message).toContain('あと 25 秒')
  })
  test('他の人が編集中: 名前つき。取り直しの案内はない', () => {
    const n = lockNotice({ kind: 'taken', by: '田中' }, NOW)!
    expect(n.message).toContain('田中 さんが編集中です')
    expect(n.canReacquire).toBe(false)
    expect(lockNotice({ kind: 'taken', by: null }, NOW)!.message).toContain('他の人 さんが')
  })
  test('外れた: 「ロックが解除されました」。入力した内容は残ること、取り直せることを伝える', () => {
    const n = lockNotice({ kind: 'released' }, NOW)!
    expect(n.tone).toBe('error')
    expect(n.message).toContain('編集ロックが解除されました')
    expect(n.message).toContain('入力した内容は残っています')
    expect(n.canReacquire).toBe(true)
  })
})

describe('保存と入力欄', () => {
  test('変更があり、1MB 以内で、他の人が編集中でなければ、保存できる。外れていても保存できる', () => {
    expect(canSave(held(LOCK_IDLE_MS), '新', '旧')).toBe(true)
    expect(canSave({ kind: 'released' }, '新', '旧')).toBe(true)
    expect(canSave(held(LOCK_IDLE_MS), '同じ', '同じ')).toBe(false)
    expect(canSave({ kind: 'taken', by: '田中' }, '新', '旧')).toBe(false)
    expect(canSave({ kind: 'acquiring' }, '新', '旧')).toBe(false)
    expect(canSave(held(LOCK_IDLE_MS), 'a'.repeat(DOC_MAX_BYTES + 1), '旧')).toBe(false)
  })
  test('入力欄は、他の人が編集中・取っている最中のあいだ、読み取り専用', () => {
    expect(textareaEditable({ kind: 'taken', by: null })).toBe(false)
    expect(textareaEditable({ kind: 'acquiring' })).toBe(false)
    expect(textareaEditable(held(LOCK_IDLE_MS))).toBe(true)
    expect(textareaEditable({ kind: 'released' })).toBe(true)
  })
})
