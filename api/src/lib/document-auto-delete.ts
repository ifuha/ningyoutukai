import { and, eq, sql } from "drizzle-orm";
import { webOrigin } from "../auth";
import { db } from "../db";
import { productDirectories, productDocumentVersions, productDocuments, productMembers, products, users } from "../db/schema";
import { LOCK_HEARTBEAT_MS, LOCK_IDLE_MS } from "./document-lock";
import { mailer } from "./mailer";
import type { ObjectStorage } from "./storage";

// 文書の自動削除。仕様は docs/v4.0/overview.md
// - **長い間呼び出されない文書**(AI も取らず、誰も画面で見ていない文書)を、自動で削除する。古いままで、混同のもとになるため
// - 「長い間」= プロダクトの設定 `documentAutoDeleteDays`(初期 7 日。リーダーが変える)。最後に呼び出された日時 `lastFetchedAt` から数える。
//   一度も呼び出されていない文書は、作成した日時から数える
// - 消さない文書: 「自動削除しない」(`keepForever`)の文書 / **未完了のタスクに結びついている文書**(直接もディレクトリ経由も)/ 編集中の文書
// - 消したら、そのプロダクトの**参加者全員**に、メールで知らせる(1 回の実行で、プロダクトごとに 1 通。消した文書の一覧つき)
// - ごみ箱はない(消したら戻せない)。消す前のメールも、ない
// - 定期実行は別(Cloudflare の Cron Trigger。`worker.ts`)。ここは、1 回ぶんの処理

const DAY_MS = 24 * 60 * 60 * 1000;

export type DeletedDocument = {
  documentId: string;
  name: string;
  directoryName: string;
  /** 最後に呼び出された日時(一度もなければ null) */
  lastFetchedAt: Date | null;
  createdAt: Date;
};
export type AutoDeleteResult = { productId: string; productName: string; days: number; deleted: DeletedDocument[] };

/** 「長い間呼び出されていない」の条件(プロダクトの日数を使う。日数は副問い合わせで引くので、選ぶときにも、削除のときにも使える) */
const staleCondition = (now: Date) =>
  sql`coalesce(${productDocuments.lastFetchedAt}, ${productDocuments.createdAt}) < ${now}::timestamptz - make_interval(days => (
    select p.document_auto_delete_days from products p where p.product_id = ${productDocuments.productId}
  ))`;

/** 編集中(有効なロックがある)ではない */
const notEditing = (nowMs: number) =>
  sql`not exists (
    select 1 from document_locks l
    where l.document_id = ${productDocuments.documentId}
      and l.last_edited_at > ${new Date(nowMs - LOCK_IDLE_MS)}
      and l.last_seen_at > ${new Date(nowMs - LOCK_HEARTBEAT_MS)}
  )`;

/** 未完了のタスクに結びついていない(文書を個別に渡したタスクも、ディレクトリで渡したタスクも) */
const noOpenTasks = sql`
  not exists (
    select 1 from task_documents td join tasks t on t.task_id = td.task_id
    where td.document_id = ${productDocuments.documentId} and t.status <> 'completed'
  )
  and not exists (
    select 1 from task_directories tdr join tasks t on t.task_id = tdr.task_id
    where tdr.directory_id = ${productDocuments.directoryId} and t.status <> 'completed'
  )`;

const deletable = (now: Date) => and(eq(productDocuments.keepForever, false), staleCondition(now), notEditing(now.getTime()), noOpenTasks);

async function deleteQuietly(storage: ObjectStorage, key: string) {
  try {
    await storage.delete(key);
  } catch (e) {
    console.warn(`[document-auto-delete] 文書の本文を消せませんでした: ${key}`, e);
  }
}

/** 日数を、読みやすい文にする */
const sinceText = (d: DeletedDocument, now: Date) => {
  if (!d.lastFetchedAt) return "一度も呼び出されていません";
  const days = Math.floor((now.getTime() - d.lastFetchedAt.getTime()) / DAY_MS);
  return `最後に呼び出されたのは ${days} 日前`;
};

/** プロダクトの参加者全員(リーダーを含む)の連絡先 */
async function allMemberEmails(productId: string) {
  const rows = await db
    .select({ email: users.email })
    .from(productMembers)
    .innerJoin(users, eq(productMembers.userId, users.userId))
    .where(eq(productMembers.productId, productId));
  return rows.map((r) => r.email);
}

async function notifyDeleted(result: AutoDeleteResult, now: Date) {
  const to = await allMemberEmails(result.productId);
  if (to.length === 0) return;
  const lines = [
    `プロダクト「${result.productName}」で、長い間使われていない文書を、自動で削除しました(最後に呼び出されてから ${result.days} 日)。`,
    "",
    ...result.deleted.map((d) => `- ${d.directoryName}/${d.name}(${sinceText(d, now)})`),
    "",
    "削除した文書は、戻せません。残しておきたい文書は、リーダーに「自動削除しない」の設定を頼んでください。",
    "",
    "プロダクトを開く:",
    `${webOrigin}/products/${result.productId}`,
  ];
  // 全員に 1 通ずつ(宛先を見せ合わない)。mailer.send は失敗しても例外を投げないので、削除は成功させる
  for (const email of to) await mailer.send({ to: email, subject: `文書を自動で削除しました: ${result.productName}`, text: lines.join("\n") });
}

/**
 * 自動削除を 1 回行う。条件に合う文書を消し(DB の行 → R2 の本文の順。R2 の失敗は warn のみ)、プロダクトごとに、参加者全員へメールで知らせる。
 * 定期実行(`worker.ts` の `scheduled`)と、手元の実行(`scripts/document-auto-delete.ts`)から呼ぶ。`now` はテスト用
 */
export async function runDocumentAutoDelete(documentStorage: ObjectStorage, now = new Date()): Promise<AutoDeleteResult[]> {
  const candidates = await db
    .select({
      documentId: productDocuments.documentId,
      productId: productDocuments.productId,
      productName: products.productName,
      days: products.documentAutoDeleteDays,
      name: productDocuments.name,
      directoryName: productDirectories.name,
      lastFetchedAt: productDocuments.lastFetchedAt,
      createdAt: productDocuments.createdAt,
    })
    .from(productDocuments)
    .innerJoin(products, eq(productDocuments.productId, products.productId))
    .innerJoin(productDirectories, eq(productDocuments.directoryId, productDirectories.directoryId))
    .where(deletable(now))
    .orderBy(products.productName, productDirectories.name, productDocuments.name);

  const results = new Map<string, AutoDeleteResult>();
  for (const c of candidates) {
    // 行が消えるとキーが読めなくなるので、削除の前に読む
    const versions = await db.select({ r2Key: productDocumentVersions.r2Key }).from(productDocumentVersions).where(eq(productDocumentVersions.documentId, c.documentId));
    // 消す直前にも条件を確かめる(候補を選んでから消すまでの間に、呼び出された・編集が始まった文書を消さないため)
    const removed = await db
      .delete(productDocuments)
      .where(and(eq(productDocuments.documentId, c.documentId), deletable(now)))
      .returning({ documentId: productDocuments.documentId });
    if (removed.length === 0) continue;
    for (const v of versions) await deleteQuietly(documentStorage, v.r2Key);
    const entry = results.get(c.productId) ?? { productId: c.productId, productName: c.productName, days: c.days, deleted: [] };
    entry.deleted.push({ documentId: c.documentId, name: c.name, directoryName: c.directoryName, lastFetchedAt: c.lastFetchedAt, createdAt: c.createdAt });
    results.set(c.productId, entry);
  }

  const list = [...results.values()];
  for (const result of list) await notifyDeleted(result, now);
  return list;
}
