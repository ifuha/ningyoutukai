import type { TreeMember } from '#/lib/api'

const MAX_TASKS = 3
const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const
const dateFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
})

/** ISO の日時を、日本時間の `M/D` にする */
function formatLimit(iso: string): string {
  return dateFormat.format(new Date(iso)).replace('月', '/').replace('日', '')
}

// ツリーの 1 人分のカード(見出し部: アバター・名前・役割 / 本体: タスク 3 件まで / フッター: 件数)
export function MemberCard({ member }: { member: TreeMember }) {
  const isLeader = member.role === 'leader'
  const shown = member.tasks.slice(0, MAX_TASKS)
  const rest = member.tasks.length - shown.length
  const pending = member.tasks.filter((t) => t.reportedAt).length

  return (
    <article className="w-[240px] shrink-0 border-2 border-ink bg-surface text-left">
      <header
        className={`flex items-center gap-2 border-b-2 border-ink p-2 ${isLeader ? 'bg-ink text-surface' : ''}`}
      >
        {member.avatarUrl ? (
          <img
            src={member.avatarUrl}
            alt=""
            className="size-8 shrink-0 border-2 border-current object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center border-2 border-current font-bold"
          >
            {[...member.userName][0] ?? '?'}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-bold">{member.userName}</p>
          <p className="text-xs opacity-70">{roleLabel[member.role]}</p>
        </div>
      </header>
      <div className="p-2">
        {shown.length === 0 ? (
          <p className="text-sm opacity-60"># タスクなし</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((t) => (
              <li key={t.taskId} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate">{t.taskName}</span>
                  {t.timeLimit && (
                    <span className="shrink-0 text-xs">
                      {formatLimit(t.timeLimit)}
                    </span>
                  )}
                </div>
                {(t.reportedAt || t.taskType) && (
                  <div className="mt-0.5 flex items-center gap-2 text-xs">
                    {t.reportedAt && (
                      <span className="shrink-0 border border-ink px-1">
                        確認待ち
                      </span>
                    )}
                    {t.taskType && (
                      <span className="min-w-0 truncate opacity-60">
                        {t.taskType.taskTypeName}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="flex flex-wrap justify-between gap-x-2 border-t-2 border-ink px-2 py-1 text-xs opacity-80">
        <span>
          {rest > 0 ? `他 ${rest} 件` : `タスク ${member.tasks.length} 件`}
        </span>
        {pending > 0 && <span>確認待ち {pending} 件</span>}
      </footer>
    </article>
  )
}
