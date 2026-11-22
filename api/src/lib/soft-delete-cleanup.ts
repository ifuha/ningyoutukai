import { lt } from "drizzle-orm";
import { db } from "../db";
import { productNotes, sections } from "../db/schema";

/** 論理削除(`deletedAt` が入ったセクション・メモ)の保持期間(この期間が過ぎたら、定期ジョブで物理削除する) */
export const SOFT_DELETE_TTL_MS = 10 * 60 * 1000;

/**
 * 期限切れの論理削除(`deletedAt` が過ぎたセクション・メモ)を、物理削除する(行を消す)。
 * `deletedAt` が NULL の行(残っているもの)は、そのまま残す
 */
export async function cleanupExpiredDeletions(): Promise<void> {
  const cutoff = new Date(Date.now() - SOFT_DELETE_TTL_MS);
  await db.delete(sections).where(lt(sections.deletedAt, cutoff));
  await db.delete(productNotes).where(lt(productNotes.deletedAt, cutoff));
}

let running = false;
/**
 * 期限切れの論理削除が、確実に物理削除されるよう、API 実行中は定期的に掃除する
 * (起動時にも 1 度、あとは 60 秒ごとに実行)
 */
export function startSoftDeleteCleanup(): void {
  if (running) return;
  running = true;
  const run = () => {
    void cleanupExpiredDeletions().catch((e) => console.error("[soft-delete] 論理削除の掃除に失敗しました", e));
  };
  run();
  const timer = setInterval(run, 60_000);
  timer.unref?.();
}
