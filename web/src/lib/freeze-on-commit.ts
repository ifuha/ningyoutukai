import type { SectionActions } from '#/lib/use-section-actions'

// 編集(作る・更新・削除・カードの移動)を確定する直前に、`freeze` を呼ぶ。
// 画面は、ユーザーが動かすまで、中身の大きさに合わせた全体表示(fit)を保つ。編集で中身の範囲が変わっても、
// 拡大率や位置が勝手に変わらないよう、編集の確定で、いまの見え方を固定する(`usePanZoom` の `freeze`)。
// 通知(`notice` / `dismissNotice`)は、そのまま渡す。
export function freezeBeforeCommit(actions: SectionActions, freeze: () => void): SectionActions {
  return {
    ...actions,
    createSection: (rect) => {
      freeze()
      return actions.createSection(rect)
    },
    updateSection: (sectionId, patch) => {
      freeze()
      return actions.updateSection(sectionId, patch)
    },
    deleteSection: (sectionId) => {
      freeze()
      return actions.deleteSection(sectionId)
    },
    moveMember: (memberId, position, sectionId) => {
      freeze()
      return actions.moveMember(memberId, position, sectionId)
    },
  }
}
