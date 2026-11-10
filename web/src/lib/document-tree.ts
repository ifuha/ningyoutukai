import type { DocDirectory, DocSummary } from '#/lib/document-api'
import { isWarning, warningSeconds, type LockState } from '#/lib/edit-lock'

// 文書の画面(右側のツリー・文書のダイアログ)の、画面に依存しない部分。仕様は docs/v4.0/overview.md

/** 文書の名前の最大(文字)と、本文の最大(バイト)。api と同じ */
export const DOC_NAME_MAX = 100
export const DOC_MAX_BYTES = 1_048_576

/** 名前に使えない文字: `/` `\` NUL。前後に空白を付けない(api の検査と同じ) */
const BAD_NAME = /[/\\\u0000]/

/** 文書の名前を整える: 前後の空白を除き、`.md` で終わっていなければ足す(Markdown だけ) */
export function ensureMdName(raw: string): string {
  const name = raw.trim()
  return /\.md$/.test(name) || name === '' ? name : `${name}.md`
}

/** 文書の名前の誤り(なければ null)。送る前の検査(api も同じ検査をする) */
export function documentNameError(name: string): string | null {
  if (!name.trim()) return '名前を入力してください'
  if (name.length > DOC_NAME_MAX) return `名前は ${DOC_NAME_MAX} 文字までです`
  if (BAD_NAME.test(name)) return '名前に / や \\ は使えません'
  if (/^\s|\s$/.test(name)) return '名前の前後に空白は付けられません'
  if (!/\.md$/.test(name) || name === '.md') return '名前は .md で終わる必要があります'
  return null
}

/** ディレクトリの名前の誤り(なければ null) */
export function directoryNameError(name: string): string | null {
  if (!name.trim()) return '名前を入力してください'
  if (name.length > DOC_NAME_MAX) return `名前は ${DOC_NAME_MAX} 文字までです`
  if (BAD_NAME.test(name)) return '名前に / や \\ は使えません'
  if (/^\s|\s$/.test(name)) return '名前の前後に空白は付けられません'
  return null
}

/** 本文のバイト数(UTF-8)が上限を超えているか */
export function contentTooLarge(content: string): boolean {
  return new TextEncoder().encode(content).byteLength > DOC_MAX_BYTES
}

/** ツリーの文書の横に出す、編集中の表示(緑の点の説明)。だれも編集していなければ null */
export function editingLabel(doc: Pick<DocSummary, 'editingBy'>, myMemberId: string | undefined): string | null {
  if (!doc.editingBy) return null
  return doc.editingBy.memberId === myMemberId ? '自分が編集中' : `${doc.editingBy.userName} さんが編集中`
}

/** ディレクトリの中で、いま編集中の文書の数 */
export function editingCount(dir: Pick<DocDirectory, 'documents'>): number {
  return dir.documents.filter((d) => d.editingBy).length
}

/** メンバーごとの、いま編集中の文書の名前(ツリーのカードに、文書のパネルと同じ緑の点を出すため)。並びは、ディレクトリと文書の順 */
export function editingDocumentsByMember(directories: Pick<DocDirectory, 'documents'>[]): Map<string, string[]> {
  const byMember = new Map<string, string[]>()
  for (const dir of directories) {
    for (const doc of dir.documents) {
      if (!doc.editingBy) continue
      const names = byMember.get(doc.editingBy.memberId)
      if (names) names.push(doc.name)
      else byMember.set(doc.editingBy.memberId, [doc.name])
    }
  }
  return byMember
}

/** カードに出す、編集中の表示。1 件なら「a.md を編集中」、複数なら「a.md ほか 1 件を編集中」 */
export function memberEditingLabel(names: string[]): string | null {
  if (names.length === 0) return null
  return names.length === 1 ? `${names[0]} を編集中` : `${names[0]} ほか ${names.length - 1} 件を編集中`
}

/**
 * 作ったばかりの文書への、最初の書き込みか: 版 1 で、本文が空(名前だけで作った直後)。
 * このときは、「新しい版として残す / 上書き」を聞かず、版 1 を上書きする(空の版を、履歴に残さない)
 */
export function isFirstWrite(baseVersion: number, original: string): boolean {
  return baseVersion === 1 && original === ''
}

/** 文書を開いたとき、編集の入口(ボタン)を出してよいか: そのディレクトリの書き込み権限があり、他の人が編集中ではない */
export function canEditDocument(level: 'read' | 'write', editingBy: DocSummary['editingBy'], myMemberId: string | undefined): boolean {
  return level === 'write' && (!editingBy || editingBy.memberId === myMemberId)
}

export type LockNotice = { tone: 'info' | 'warn' | 'error'; message: string; canReacquire: boolean } | null

/**
 * 編集ロックの状態に応じた、画面の案内。
 * - 他の人が編集中: 「○○さんが編集中です」(編集できない。読むことはできる)
 * - 解除の 1 分前: 「あと N 秒で編集ロックが解除されます」(入力すると続けられる)
 * - 外れた: 「ロックが解除されました」(入力した内容は残る。続けるなら取り直す)
 */
export function lockNotice(state: LockState, nowMs: number): LockNotice {
  if (state.kind === 'taken') {
    return { tone: 'info', message: `${state.by ?? '他の人'} さんが編集中です。終わるまで、編集できません(読むことはできます)`, canReacquire: false }
  }
  if (state.kind === 'released') {
    return { tone: 'error', message: '編集ロックが解除されました(30 分間、編集がなかったためです)。入力した内容は残っています', canReacquire: true }
  }
  if (state.kind === 'held' && isWarning(state, nowMs)) {
    return { tone: 'warn', message: `あと ${warningSeconds(state, nowMs)} 秒で編集ロックが解除されます。入力すると、続けられます`, canReacquire: false }
  }
  return null
}

/** 保存できる状態か(他の人が編集中のときは保存できない。外れていても、だれも取っていなければ保存できる) */
export function canSave(state: LockState, draft: string, original: string): boolean {
  if (state.kind === 'taken' || state.kind === 'acquiring') return false
  return draft !== original && !contentTooLarge(draft)
}

/** 入力欄を編集できるか(他の人が編集中のあいだは、読み取り専用) */
export function textareaEditable(state: LockState): boolean {
  return state.kind !== 'taken' && state.kind !== 'acquiring'
}

/** 「最終更新」などに出す日時 */
export function formatDocDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
