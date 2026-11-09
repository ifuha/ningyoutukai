import { and, eq, gt, or, sql } from "drizzle-orm";
import { t } from "elysia";
import { db } from "../db";
import { documentLocks, productMembers, users } from "../db/schema";

// 文書の編集ロック。仕様は docs/v4.0/overview.md の 4.11
// - 同時に編集はできない。誰かが編集している間は、ほかの人は編集できない(保存・名前の変更・移動・削除も)
// - ロックが外れる条件(どちらかを過ぎたら、無効とみなす。行は残っていてもよい):
//     1. **30 分間、編集がなければ外れる**(最後の編集 `lastEditedAt` から)。編集 = 文字の入力・削除など。スクロールやカーソルの移動は入れない
//     2. ブラウザを閉じた・通信が切れたとき: 画面が一定間隔(例: 30 秒)で「まだ開いている」と知らせる(ハートビート `lastSeenAt`)。**90 秒**途絶えたら外れる
// - 解除の 1 分前に、画面が予告を出す。そのため、ハートビートの返事に「あと何ミリ秒で外れるか」を返す

/** 編集がなくて、ロックが外れるまでの時間(30 分) */
export const LOCK_IDLE_MS = 30 * 60 * 1000;
/** ハートビートが途絶えて、ロックが外れるまでの時間(90 秒) */
export const LOCK_HEARTBEAT_MS = 90 * 1000;
/** 解除の何ミリ秒前に、画面が予告を出すか(1 分前) */
export const LOCK_WARN_BEFORE_MS = 60 * 1000;

export type LockRow = { lastEditedAt: Date; lastSeenAt: Date };

/** そのロックが、いま有効か(外れる条件のどちらにも当たっていない) */
export function isLockValid(row: LockRow, nowMs = Date.now()): boolean {
  return nowMs - row.lastEditedAt.getTime() < LOCK_IDLE_MS && nowMs - row.lastSeenAt.getTime() < LOCK_HEARTBEAT_MS;
}

/**
 * あと何ミリ秒で、ロックが外れるか(0 以下 = もう外れている)。
 * 編集がないことによる解除(30 分)と、ハートビートの途絶(90 秒)の、早い方
 */
export function lockMsLeft(row: LockRow, nowMs = Date.now()): number {
  return Math.min(LOCK_IDLE_MS - (nowMs - row.lastEditedAt.getTime()), LOCK_HEARTBEAT_MS - (nowMs - row.lastSeenAt.getTime()));
}

/**
 * 「30 分の編集なし」で外れるまで、あと何ミリ秒か(0 以下 = もう外れている)。ハートビートの途絶は含まない。
 * 画面は、これが `LOCK_WARN_BEFORE_MS`(1 分)以下になったら、「あと 1 分で編集ロックが解除されます」と予告する
 */
export function lockIdleMsLeft(row: Pick<LockRow, "lastEditedAt">, nowMs = Date.now()): number {
  return LOCK_IDLE_MS - (nowMs - row.lastEditedAt.getTime());
}

/** 有効なロックだけを選ぶ SQL の条件(一覧や、ロックの確認に使う) */
export function validLockCondition(nowMs = Date.now()) {
  return and(gt(documentLocks.lastEditedAt, new Date(nowMs - LOCK_IDLE_MS)), gt(documentLocks.lastSeenAt, new Date(nowMs - LOCK_HEARTBEAT_MS)));
}

/** 「編集中の人」の応答の形(ツリーの緑の点と、名前) */
export const editingBySchema = () => t.Nullable(t.Object({ memberId: t.String(), userName: t.String() }));

/** 文書の、いま有効なロック(なければ undefined)。持ち主の名前つき */
export async function findValidLock(documentId: string, nowMs = Date.now()) {
  const [row] = await db
    .select({
      memberId: documentLocks.productMemberId,
      userName: users.userName,
      lockedAt: documentLocks.lockedAt,
      lastEditedAt: documentLocks.lastEditedAt,
      lastSeenAt: documentLocks.lastSeenAt,
    })
    .from(documentLocks)
    .innerJoin(productMembers, eq(documentLocks.productMemberId, productMembers.productMemberId))
    .innerJoin(users, eq(productMembers.userId, users.userId))
    .where(and(eq(documentLocks.documentId, documentId), validLockCondition(nowMs)));
  return row;
}

/**
 * ロックを取る(または、自分のロックを取り直す)。1 つの SQL で行う(同時に 2 人が取ろうとしても、片方だけが取れる)。
 * 取れる条件: だれも持っていない / 前のロックが無効(30 分の編集なし、または 90 秒の途絶) / 自分のロック。
 * 取れなければ undefined
 */
export async function acquireLock(documentId: string, memberId: string, nowMs = Date.now()) {
  const now = new Date(nowMs);
  const [row] = await db
    .insert(documentLocks)
    .values({ documentId, productMemberId: memberId, lockedAt: now, lastEditedAt: now, lastSeenAt: now })
    .onConflictDoUpdate({
      target: documentLocks.documentId,
      set: { productMemberId: memberId, lockedAt: now, lastEditedAt: now, lastSeenAt: now },
      setWhere: or(
        eq(documentLocks.productMemberId, memberId),
        sql`${documentLocks.lastEditedAt} <= ${new Date(nowMs - LOCK_IDLE_MS)}`,
        sql`${documentLocks.lastSeenAt} <= ${new Date(nowMs - LOCK_HEARTBEAT_MS)}`,
      ),
    })
    .returning();
  return row;
}

/** 自分が持っている、有効なロックを更新する(ハートビート)。編集があったときは、最後の編集の日時も更新する。なければ undefined */
export async function heartbeatLock(documentId: string, memberId: string, edited: boolean, nowMs = Date.now()) {
  const now = new Date(nowMs);
  const [row] = await db
    .update(documentLocks)
    .set(edited ? { lastSeenAt: now, lastEditedAt: now } : { lastSeenAt: now })
    .where(and(eq(documentLocks.documentId, documentId), eq(documentLocks.productMemberId, memberId), validLockCondition(nowMs)))
    .returning();
  return row;
}

/** 自分のロックを外す(なければ何もしない)。他の人のロックは外さない */
export async function releaseLock(documentId: string, memberId: string) {
  await db.delete(documentLocks).where(and(eq(documentLocks.documentId, documentId), eq(documentLocks.productMemberId, memberId)));
}
