import { Plus } from 'lucide-react'
import { AiCards } from '#/components/ai-card'
import type { TreeAi, TreeMember, TreeTask } from '#/lib/tree'

const MAX_TASKS = 3
const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const
const dateFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
})

const dateTimeFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** ISO の日時を、日本時間の `YYYY/M/D HH:mm` にする */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}

/** ISO の日時を、日本時間の `M/D` にする */
export function formatLimit(iso: string): string {
  return dateFormat.format(new Date(iso)).replace('月', '/').replace('日', '')
}

// ツリーの 1 人分のカード(見出し部: アバター・名前・役割 / 本体: タスク 3 件まで / フッター: 件数)
// `onEditTask` を渡すと、タスク名が押せる(リーダーにだけ渡す。ツリーに完了済みは出ないので、すべて編集できる)
// `onShowTasks` を渡すと、4 件目以降があるとき「他 N 件」が押せて、全タスクの一覧を開ける
// `onAddTask` を渡すと(リーダーにだけ渡す)、カードの一番下に、破線で区切った「+ タスクを追加」の行が出て、その人を渡す(その人を担当者にして、フォームを開く)
// `onOpenAi` を渡すと、カードにぶら下がる AI のカード(確認待ちがある持ち主のもの)が押せる。AI のカードは、リーダーは右、メンバーは下に、絶対配置で出す(カードの大きさ・位置の測定には影響しない)
// `cardId` を渡すと、カードに `data-card-id` を付ける(親子の線の端点を、カードの実際の位置・高さで描くために、測る目印)
export function MemberCard({
  member,
  cardId,
  onEditTask,
  onShowTasks,
  onAddTask,
  onOpenAi,
}: {
  member: TreeMember
  cardId?: string
  onEditTask?: (task: TreeTask) => void
  onShowTasks?: (member: TreeMember) => void
  onAddTask?: (member: TreeMember) => void
  onOpenAi?: (ai: TreeAi) => void
}) {
  const isLeader = member.role === 'leader'
  const shown = member.tasks.slice(0, MAX_TASKS)
  const rest = member.tasks.length - shown.length
  const pending = member.tasks.filter((t) => t.reportedAt).length

  return (
    <article
      data-card-id={cardId}
      className="relative w-[240px] shrink-0 shadow-box bg-panel text-left"
    >
      <header
        className={`flex items-center gap-2 border-b border-line p-2 ${isLeader ? 'bg-ink text-surface' : ''}`}
      >
        {member.avatarUrl ? (
          <img
            src={member.avatarUrl}
            alt=""
            className="size-8 shrink-0 border border-current object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center border border-current font-bold"
          >
            {[...member.userName][0] ?? '?'}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-bold">{member.userName}</p>
          <p className="text-s opacity-70">{roleLabel[member.role]}</p>
        </div>
      </header>
      <div className="p-2">
        {shown.length === 0 ? (
          <p className="text-m opacity-60"># タスクなし</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((t) => (
              <li key={t.taskId} className="text-m">
                <div className="flex items-baseline gap-2">
                  {onEditTask ? (
                    <button
                      type="button"
                      onClick={() => onEditTask(t)}
                      className="min-w-0 flex-1 cursor-pointer truncate text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      {t.taskName}
                    </button>
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{t.taskName}</span>
                  )}
                  {t.timeLimit && (
                    <span className="shrink-0 text-s">
                      {formatLimit(t.timeLimit)}
                    </span>
                  )}
                </div>
                {(t.reportedAt || t.taskType) && (
                  <div className="mt-0.5 flex items-center gap-2 text-s">
                    {t.reportedAt && (
                      <span className="shrink-0 shadow-box px-1">
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
      <footer className="flex flex-wrap justify-between gap-x-2 border-t border-line px-2 py-1 text-s opacity-80">
        {rest > 0 && onShowTasks ? (
          <button
            type="button"
            onClick={() => onShowTasks(member)}
            className="cursor-pointer underline underline-offset-2 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            他 {rest} 件
          </button>
        ) : (
          <span>
            {rest > 0 ? `他 ${rest} 件` : `タスク ${member.tasks.length} 件`}
          </span>
        )}
        {pending > 0 && <span>確認待ち {pending} 件</span>}
      </footer>
      {onAddTask && (
        <button
          type="button"
          onClick={() => onAddTask(member)}
          className="flex w-full cursor-pointer items-center gap-1 border-t border-dashed border-ink/50 px-2 py-2 text-left text-m focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
        >
          <Plus aria-hidden="true" size={14} className="shrink-0" />
          タスクを追加
        </button>
      )}
      {/* api が古いとき(デプロイの途中など)は ais がないので、空として扱う */}
      <AiCards ais={member.ais ?? []} side={isLeader ? 'right' : 'bottom'} onOpen={onOpenAi} />
    </article>
  )
}
