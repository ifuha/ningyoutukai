import { and, eq, inArray, ne } from "drizzle-orm";
import { webOrigin } from "../auth";
import { db } from "../db";
import { productDirectories, productMembers, products, tasks, users } from "../db/schema";
import { mailer } from "./mailer";
import { taskIdsForDocument } from "./task-documents";

// 文書を直した(保存した)とき、**その文書が割り振られたメンバー**にメールで知らせる(要件が変わったことに気づけるように)。
// - 宛先: その文書が渡っているタスク(文書を個別に渡したもの + ディレクトリで渡したもの)の担当者。完了したタスクは除く。直した本人は除く
// - 1 人に 1 通。その人が担当の、この文書が渡っているタスクの名前を載せる
// - ほかの通知と同じ: `mailer.send` は失敗しても例外を投げない(失敗は mailer が console.error に出す)ので、保存は成功させる
// 仕様は docs/v4.0/overview.md

type Args = {
  productId: string;
  documentId: string;
  directoryId: string;
  documentName: string;
  version: number;
  editorName: string;
  editorMemberId: string;
};

/** 知らせる相手と、その人のタスク(重なりなし) */
export async function documentChangeRecipients(args: Pick<Args, "documentId" | "directoryId" | "editorMemberId">) {
  const taskIds = await taskIdsForDocument(args.documentId, args.directoryId);
  if (taskIds.length === 0) return [];
  const rows = await db
    .select({ memberId: tasks.productMemberId, email: users.email, userName: users.userName, taskName: tasks.taskName })
    .from(tasks)
    .innerJoin(productMembers, eq(tasks.productMemberId, productMembers.productMemberId))
    .innerJoin(users, eq(productMembers.userId, users.userId))
    .where(and(inArray(tasks.taskId, taskIds), ne(tasks.status, "completed"), ne(tasks.productMemberId, args.editorMemberId)))
    .orderBy(tasks.taskName);
  const byMember = new Map<string, { email: string; userName: string; taskNames: string[] }>();
  for (const r of rows) {
    const entry = byMember.get(r.memberId) ?? { email: r.email, userName: r.userName, taskNames: [] };
    if (!entry.taskNames.includes(r.taskName)) entry.taskNames.push(r.taskName);
    byMember.set(r.memberId, entry);
  }
  return [...byMember.entries()].map(([memberId, v]) => ({ memberId, ...v }));
}

export async function notifyDocumentChanged(args: Args) {
  const recipients = await documentChangeRecipients(args);
  if (recipients.length === 0) return;
  const [product] = await db.select({ productName: products.productName }).from(products).where(eq(products.productId, args.productId));
  const [directory] = await db.select({ name: productDirectories.name }).from(productDirectories).where(eq(productDirectories.directoryId, args.directoryId));
  const productName = product?.productName ?? "プロダクト";
  const path = `${directory?.name ?? ""}/${args.documentName}`;
  for (const r of recipients) {
    const lines = [
      `${args.editorName} さんが、プロダクト「${productName}」の文書「${path}」を更新しました(版 ${args.version})。`,
      "",
      "この文書が渡されている、あなたのタスク:",
      ...r.taskNames.map((name) => `- ${name}`),
      "",
      "要件が変わっていないか、確かめてください。",
      "",
      "プロダクトを開く:",
      `${webOrigin}/products/${args.productId}`,
    ];
    await mailer.send({ to: r.email, subject: `文書が更新されました: ${path}`, text: lines.join("\n") });
  }
}
