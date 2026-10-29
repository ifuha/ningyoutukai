import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '#/lib/api'
import { runOptimistic } from '#/lib/optimistic'
import type { Store } from '#/lib/optimistic'
import {
  applyMemberMove,
  applySectionCreate,
  applySectionDelete,
  applySectionUpdate,
  nextSectionColor,
  nextSectionName,
} from '#/lib/section-cache'
import type { SectionPatch } from '#/lib/section-cache'
import {
  createSection as apiCreateSection,
  deleteSection as apiDeleteSection,
  moveMember as apiMoveMember,
  updateSection as apiUpdateSection,
} from '#/lib/section-api'
import { clampCardPosition } from '#/lib/section-edit-geometry'
import type { Point, Rect } from '#/lib/section-edit-geometry'
import { OUT_OF_RANGE_MESSAGE, sectionErrorMessage } from '#/lib/section-messages'
import type { Section } from '#/lib/section'
import { handleApiError } from '#/lib/session-expired'
import type { ProductTree } from '#/lib/tree'
import { sectionsQueryKey, treeQueryKey } from '#/lib/use-sections'

// セクションの操作(作成・更新・削除・カードの移動)。api を呼び、画面の値(セクションの一覧と、ツリーのメンバーの位置・所属)を
// **先に更新**(楽観更新)して、失敗したら元に戻す。成功・失敗のあとは、サーバーの値で取り直して整合を取る。
// 失敗は、種類(403 / 404 / 409 / 422 …)ごとの短い日本語のメッセージにして、`notice` に出す(画面が表示する)。
// 作成だけは、先に更新しない(サーバーが決める ID が要るため)。成功したら、一覧に足す。
// 戻り値: 操作が成功したか(作成は、作ったセクション。失敗は null)。失敗の通知は、ここで済んでいる(呼び出し側は、何もしなくてよい)。

export type SectionNotice = { id: number; message: string }

export type SectionActions = {
  /** 直近の失敗の通知(なければ null)。画面が `role="alert"` で出し、`dismissNotice` で閉じる */
  notice: SectionNotice | null
  dismissNotice: () => void
  /** 四角(キャンバス座標)から、セクションを作る。名前と色は、既定(「セクション N」、色は順に) */
  createSection: (rect: Rect) => Promise<Section | null>
  /** セクションの更新。位置(x / y)を変えると、所属メンバーのカードも同じ差分だけ動く(api と同じ) */
  updateSection: (sectionId: string, patch: SectionPatch<Section>) => Promise<boolean>
  deleteSection: (sectionId: string) => Promise<boolean>
  /** カードの移動。`position` は、カードの左上(キャンバス座標)。`sectionId`: 省略=所属を変えない、null=無所属、文字列=そのセクションへ */
  moveMember: (
    memberId: string,
    position: Point,
    sectionId?: string | null,
  ) => Promise<boolean>
}

/** 編集の操作を持たない画面(読み取りだけ・テスト)で使う、何もしない操作 */
export const NO_SECTION_ACTIONS: SectionActions = {
  notice: null,
  dismissNotice: () => {},
  createSection: async () => null,
  updateSection: async () => false,
  deleteSection: async () => false,
  moveMember: async () => false,
}

type Snapshot = { sections: Section[] | undefined; tree: ProductTree | undefined }

/**
 * 確定(api の呼び出し)が終わったあとの取り直し。**成功したら、取り直さない。**
 * 位置などの計算は画面で済ませてあり(楽観更新)、api は、マウスを離したときの確定だけを受ける。
 * 画面の予測とサーバーの結果が食い違っても、数秒ごとの版の確認(`useProductRevision`)が、あとから合わせる。
 * 失敗したときだけ、すぐ取り直す(ロールバックした値を、サーバーの値に合わせる)。
 */
export function resyncOnFailure(
  client: { invalidateQueries(filters: { queryKey: readonly unknown[] }): unknown },
  keys: readonly (readonly unknown[])[],
): (ok: boolean) => void {
  return (ok) => {
    if (ok) return
    for (const queryKey of keys) void client.invalidateQueries({ queryKey })
  }
}

export function useSectionActions(productId: string): SectionActions {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<SectionNotice | null>(null)
  const seq = useRef(0)
  const notify = useCallback((message: string) => {
    seq.current += 1
    setNotice({ id: seq.current, message })
  }, [])
  const dismissNotice = useCallback(() => setNotice(null), [])

  const sectionsKey = sectionsQueryKey(productId)
  const treeKey = treeQueryKey(productId)
  // 画面の値(react-query のキャッシュ)の読み書き。値が無い(まだ取れていない)ものは、書かない
  const store: Store<Snapshot> = {
    read: () => ({
      sections: queryClient.getQueryData<Section[]>(sectionsKey),
      tree: queryClient.getQueryData<ProductTree>(treeKey),
    }),
    write: (s) => {
      if (s.sections) queryClient.setQueryData(sectionsKey, s.sections)
      if (s.tree) queryClient.setQueryData(treeKey, s.tree)
    },
  }
  const shared = {
    store,
    // 進行中の取得が、先に更新した値を古い値で上書きしないよう、取り消す
    before: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: sectionsKey }),
        queryClient.cancelQueries({ queryKey: treeKey }),
      ])
    },
    onError: (error: unknown) => {
      handleApiError(error) // 401(セッション切れ)の共通処理
      notify(sectionErrorMessage(error))
    },
    settle: resyncOnFailure(queryClient, [sectionsKey, treeKey]),
  }

  const updateSection: SectionActions['updateSection'] = async (sectionId, patch) => {
    const current = store.read()
    if (current.sections) {
      // api に送る前に、画面で分かる失敗(存在しない・座標の上限)は止める
      const check = applySectionUpdate(current.sections, current.tree, sectionId, patch)
      if (!check.ok) {
        notify(
          check.reason === 'out-of-range'
            ? OUT_OF_RANGE_MESSAGE
            : sectionErrorMessage(new ApiError(404, '')),
        )
        return false
      }
    }
    const result = await runOptimistic({
      ...shared,
      apply: (s) => {
        if (!s.sections) return null
        const next = applySectionUpdate(s.sections, s.tree, sectionId, patch)
        return next.ok ? { sections: next.sections, tree: next.tree } : null
      },
      call: () => apiUpdateSection(productId, sectionId, patch),
    })
    return result.ok
  }

  const deleteSection: SectionActions['deleteSection'] = async (sectionId) => {
    const current = store.read()
    if (current.sections && !applySectionDelete(current.sections, current.tree, sectionId).ok) {
      notify(sectionErrorMessage(new ApiError(404, '')))
      return false
    }
    const result = await runOptimistic({
      ...shared,
      apply: (s) => {
        if (!s.sections) return null
        const next = applySectionDelete(s.sections, s.tree, sectionId)
        return next.ok ? { sections: next.sections, tree: next.tree } : null
      },
      call: () => apiDeleteSection(productId, sectionId),
    })
    return result.ok
  }

  const moveMember: SectionActions['moveMember'] = async (memberId, position, sectionId) => {
    const p = clampCardPosition(position)
    const result = await runOptimistic({
      ...shared,
      apply: (s) => {
        if (!s.tree) return null
        const next = applyMemberMove(s.sections ?? [], s.tree, memberId, p, sectionId)
        return { sections: s.sections ? next.sections : undefined, tree: next.tree }
      },
      call: () =>
        apiMoveMember(productId, memberId, {
          positionX: p.x,
          positionY: p.y,
          ...(sectionId === undefined ? {} : { sectionId }),
        }),
    })
    return result.ok
  }

  const createSection: SectionActions['createSection'] = async (rect) => {
    const existing = store.read().sections ?? []
    const result = await runOptimistic({
      ...shared,
      apply: () => null, // 先に更新しない(サーバーが ID を決める)
      call: () =>
        apiCreateSection(productId, {
          sectionName: nextSectionName(existing.map((s) => s.sectionName)),
          color: nextSectionColor(existing),
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        }),
    })
    if (!result.ok) return null
    const created = result.value as Section
    // 取り直しが終わるまでの間も出るよう、一覧に足す
    const current = store.read()
    if (current.sections) {
      store.write({ ...current, sections: applySectionCreate(current.sections, created) })
    }
    return created
  }

  return { notice, dismissNotice, createSection, updateSection, deleteSection, moveMember }
}
