import { useQuery } from '@tanstack/react-query'
import { CalendarPlus, LogOut } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { authClient } from '#/lib/auth-client'
import { retryDelay, retryTransient } from '#/lib/query-retry'
import { useGoogleCalendar } from '#/lib/use-google-calendar'
import { useSignOut } from '#/lib/use-sign-out'

// 設定「一般」。自分のアカウント情報(名前・メール・アイコン・登録日・ログインに使っている連携)を出す。表示だけ(変更はしない)

const dateFormat = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' })

const providerNames: Record<string, string> = { github: 'GitHub', google: 'Google', credential: 'メールとパスワード' }

/** ログインに使っている連携の名前(知らないものは、そのまま出す) */
export function providerLabel(providerId: string): string {
  return providerNames[providerId] ?? providerId
}

/** 登録日(日本時間の「2026年11月10日」)。日時として読めなければ、空 */
export function formatJoined(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date)
}

/** Google カレンダーの連携の行。`state`: 取得中 / 連携済み / 未連携 */
export type CalendarState = 'checking' | 'connected' | 'disconnected'

export type AccountUser = { name: string; email: string; image?: string | null; createdAt?: string | number | Date | null }

// 項目の一覧(ラベルを左の列、値を右に揃える。狭い画面では、ラベルの下に値を置く。区切りの線は引かない)
const row = 'flex flex-col gap-1 py-3 sm:grid sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center sm:gap-4'
const label = 'text-s opacity-60'

/** 表示だけの部分(取得は `AccountSettings`)。`providers` が null のあいだ(取得中・失敗)は、連携の行を出さない */
export function AccountInfo({ user, providers, calendar, onSignOut }: { user: AccountUser; providers: string[] | null; calendar?: { state: CalendarState; onConnect: () => void; error?: boolean }; onSignOut?: () => void }) {
  const joined = formatJoined(user.createdAt)
  return (
    <div className="text-m">
      {/* アイコンは、ラベルなしで、一覧の上に置く */}
      <div className="py-3">
        {user.image ? (
          <img src={user.image} alt="" referrerPolicy="no-referrer" data-account-avatar className="size-24 rounded-full object-cover shadow-box" />
        ) : (
          <span aria-hidden="true" data-account-avatar-fallback className="flex size-24 items-center justify-center rounded-full text-[40px] leading-none font-medium shadow-box">
            {[...user.name][0] ?? '?'}
          </span>
        )}
      </div>
      <dl>
        <div className={row}>
          <dt className={label}>名前</dt>
          <dd className="text-l font-medium break-words">{user.name}</dd>
        </div>
        <div className={row}>
          <dt className={label}>メールアドレス</dt>
          <dd className="break-all">{user.email}</dd>
        </div>
        {providers && providers.length > 0 && (
          <div className={row}>
            <dt className={label}>ログインの連携</dt>
            <dd data-account-providers>{providers.map(providerLabel).join('、')}</dd>
          </div>
        )}
        {joined && (
          <div className={row}>
            <dt className={label}>登録日</dt>
            <dd>{joined}</dd>
          </div>
        )}
        {calendar && (
          <div className={row}>
            <dt className={label}>Google カレンダー</dt>
            <dd data-account-calendar={calendar.state}>
              {calendar.state === 'checking' ? (
                <span className="opacity-60">確認中…</span>
              ) : calendar.state === 'connected' ? (
                '連携済み'
              ) : (
                <IconButton icon={CalendarPlus} label="連携する" showLabel size="sm" variant="outline" onClick={calendar.onConnect} />
              )}
              {calendar.error && (
                <p role="alert" className="mt-1 text-s text-danger">
                  連携できませんでした。もう一度お試しください。
                </p>
              )}
            </dd>
          </div>
        )}
      </dl>
      {onSignOut && (
        <div className="pt-4">
          <IconButton icon={LogOut} label="ログアウト" showLabel variant="outline" onClick={onSignOut} />
        </div>
      )}
    </div>
  )
}

export function AccountSettings() {
  const { data: session } = authClient.useSession()
  const signOut = useSignOut()
  const { calendar, connect, linkError } = useGoogleCalendar()
  const accounts = useQuery({
    queryKey: ['auth-accounts'],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts()
      if (error) throw new Error(error.message ?? '連携を取得できませんでした')
      return data.map((a) => a.providerId)
    },
    retry: retryTransient,
    retryDelay,
  })
  const user = session?.user
  if (!user) return <p className="text-m opacity-60">読み込み中…</p>
  // 連携の取得に失敗しても、アカウント情報そのものは出す
  const calendarState: CalendarState = calendar.isPending ? 'checking' : calendar.data?.connected ? 'connected' : 'disconnected'
  return <AccountInfo user={user} providers={accounts.data ?? null} calendar={{ state: calendarState, onConnect: () => void connect(), error: linkError }} onSignOut={() => void signOut()} />
}
