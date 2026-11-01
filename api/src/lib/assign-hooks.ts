/**
 * 担当の付け替えが確定したあとに呼ぶ処理の登録所(docs/v3.0/jev-assign.md の 3)。
 * 新しい担当者へのメール通知や Google Calendar への登録は、ここに `register` して足す
 * (割り振りの本体は変えない)。
 *
 * - 呼ばれるのは、DB への書き込み(トランザクション)が成功したあと。付け替えた分だけ、まとめて渡す
 * - 処理の失敗は握りつぶしてログに出す。通知やカレンダーは補助機能なので、付け替えは失敗させない
 *   (`create-task.ts` の通知・カレンダーと同じ扱い)
 * - テストでは `assignHooks.clear()` で空にできる
 */
export type AssignedChange = {
  taskId: string;
  taskName: string;
  timeLimit: Date | null;
  fromMemberId: string;
  toMemberId: string;
};

export type AssignHook = (event: {
  productId: string;
  /** 確定した人(リーダー)のメンバー ID */
  actorMemberId: string;
  changes: AssignedChange[];
}) => Promise<void> | void;

const hooks: AssignHook[] = [];

export const assignHooks = {
  register(hook: AssignHook) {
    hooks.push(hook);
  },
  clear() {
    hooks.length = 0;
  },
  async run(event: Parameters<AssignHook>[0]) {
    if (event.changes.length === 0) return;
    for (const hook of hooks) {
      try {
        await hook(event);
      } catch (e) {
        console.warn("[assign-hooks] 付け替え後の処理に失敗しました", e);
      }
    }
  },
};
