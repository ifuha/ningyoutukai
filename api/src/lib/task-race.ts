import { eq } from "drizzle-orm";
import { db } from "../db";
import { tasks } from "../db/schema";

/**
 * 条件付き update が 0 件だったときの「タスクがまだ存在するか」の再確認。
 * 取得から更新までの間に削除されていた場合は存在しない(404 を返す)。
 */
export async function taskStillExists(taskId: string) {
  const [row] = await db
    .select({ taskId: tasks.taskId })
    .from(tasks)
    .where(eq(tasks.taskId, taskId));
  return Boolean(row);
}

/**
 * 同じ操作が同時に二重に走って、条件付き update が 0 件だったときの合図。
 * ルートはこれを捕捉して 409(「すでに報告済みです」など)にする。
 * 捕捉しないと 500 になるので、`task-message-log.ts` や報告の下書きの採用で投げる
 */
export class Conflict extends Error {}
