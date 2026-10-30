import { useCallback, useEffect, useState } from 'react'
import {
  parseCollapsed,
  serializeCollapsed,
  SIDEBAR_COLLAPSED_KEY,
} from '#/lib/sidebar-collapsed'

// PC 幅のサイドバーをたたむか。最初の描画は「開いた」(サーバーの描画と合わせる)にして、
// マウント後に保存された値を読む。localStorage が使えなくても、動く(保存されないだけ)
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(parseCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)))
    } catch {
      // 読めなければ、開いたまま
    }
  }, [])

  const set = useCallback((next: boolean) => {
    setCollapsed(next)
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, serializeCollapsed(next))
    } catch {
      // 保存できなくても、この画面では効く
    }
  }, [])

  return { collapsed, set }
}
