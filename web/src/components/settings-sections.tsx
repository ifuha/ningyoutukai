import type { ReactNode } from 'react'
import { KeyRound, Palette, type LucideIcon } from 'lucide-react'
import { AiTokenSettings } from '#/components/ai-token-settings'
import { AppearanceSettings } from '#/components/settings-appearance'

export type SettingsSection = {
  /** 項目を区別する名前(重複させない) */
  id: string
  /** 左の一覧と、右の見出しに出す名前 */
  label: string
  icon: LucideIcon
  /** 右に出す中身 */
  render: () => ReactNode
}

// 設定のカテゴリの一覧(左の並び順)。カテゴリを足すときは、ここに 1 行足す。
// 設定の項目を足すときは、そのカテゴリのコンポーネント(外観なら `settings-appearance.tsx`)に、ブロックを足す
export const settingsSections: readonly SettingsSection[] = [
  { id: 'appearance', label: '外観', icon: Palette, render: () => <AppearanceSettings /> },
  // AI 用のトークン(v4.0): AI に、自分のタスクと渡された文書を読ませ、報告の下書きを保存させる鍵
  { id: 'ai-token', label: 'AI のトークン', icon: KeyRound, render: () => <AiTokenSettings /> },
]