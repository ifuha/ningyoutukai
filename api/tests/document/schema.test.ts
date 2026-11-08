import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/db";
import {
  directoryPermissions,
  documentLocks,
  productDirectories,
  productDocumentVersions,
  productDocuments,
  products,
  taskDirectories,
  taskDocuments,
  tasks,
} from "../../src/db/schema";
import { cleanup, insertTask, setupProduct } from "../task/helpers";

// 文書(Markdown)のスキーマの制約。仕様は docs/v4.0/overview.md

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup;

beforeAll(async () => {
  a = await setupProduct();
});
afterAll(cleanup);

async function insertDirectory(name: string, productId = a.productId) {
  const [row] = await db.insert(productDirectories).values({ productId, name, createdBy: a.leader.userId }).returning();
  return row!;
}
async function insertDocument(directoryId: string, name: string, productId = a.productId) {
  const [row] = await db.insert(productDocuments).values({ productId, directoryId, name, createdBy: a.leader.userId }).returning();
  return row!;
}
const rejects = async (p: Promise<unknown>) => {
  let failed = false;
  try {
    await p;
  } catch {
    failed = true;
  }
  return failed;
};

describe("ディレクトリ", () => {
  test("同じプロダクトの中で、名前は重ならない。別のプロダクトなら同じ名前でよい", async () => {
    await insertDirectory("仕様");
    expect(await rejects(insertDirectory("仕様"))).toBe(true);
    const other = await setupProduct({ members: 0 });
    expect(await rejects(insertDirectory("仕様", other.productId))).toBe(false);
  });
  test("名前は 1〜100 文字(空と、101 文字は入らない)", async () => {
    expect(await rejects(insertDirectory(""))).toBe(true);
    expect(await rejects(insertDirectory("あ".repeat(101)))).toBe(true);
    expect(await rejects(insertDirectory("あ".repeat(100)))).toBe(false);
  });
});

describe("文書", () => {
  test("必ずディレクトリに入る(ディレクトリなしでは入らない)", async () => {
    const rows = db.insert(productDocuments).values({ productId: a.productId, name: "no-dir" } as never);
    expect(await rejects(Promise.resolve(rows))).toBe(true);
  });
  test("既定: 版は 1、自動削除する(keepForever = false)、まだ呼び出されていない(lastFetchedAt = NULL)", async () => {
    const dir = await insertDirectory("既定の確認");
    const doc = await insertDocument(dir.directoryId, "spec.md");
    expect(doc.currentVersion).toBe(1);
    expect(doc.keepForever).toBe(false);
    expect(doc.lastFetchedAt).toBeNull();
  });
  test("同じディレクトリの中で、名前は重ならない。別のディレクトリなら同じ名前でよい", async () => {
    const d1 = await insertDirectory("重複の確認 1");
    const d2 = await insertDirectory("重複の確認 2");
    await insertDocument(d1.directoryId, "same.md");
    expect(await rejects(insertDocument(d1.directoryId, "same.md"))).toBe(true);
    expect(await rejects(insertDocument(d2.directoryId, "same.md"))).toBe(false);
  });
  test("中に文書があるディレクトリは消せない(先に文書を消す必要がある)", async () => {
    const dir = await insertDirectory("消せない確認");
    const doc = await insertDocument(dir.directoryId, "x.md");
    expect(await rejects(db.delete(productDirectories).where(eq(productDirectories.directoryId, dir.directoryId)))).toBe(true);
    await db.delete(productDocuments).where(eq(productDocuments.documentId, doc.documentId));
    expect(await rejects(db.delete(productDirectories).where(eq(productDirectories.directoryId, dir.directoryId)))).toBe(false);
  });
  test("版は 1 以上", async () => {
    const dir = await insertDirectory("版の確認");
    const doc = await insertDocument(dir.directoryId, "v.md");
    expect(await rejects(db.update(productDocuments).set({ currentVersion: 0 }).where(eq(productDocuments.documentId, doc.documentId)))).toBe(true);
  });
});

describe("版・権限・ロック・タスクとの結びつけ", () => {
  test("版は文書ごとに 1 から。同じ版は二重に入らない。文書を消すと、版も消える", async () => {
    const dir = await insertDirectory("版の履歴");
    const doc = await insertDocument(dir.directoryId, "history.md");
    const version = (n: number) => ({ documentId: doc.documentId, version: n, r2Key: `${a.productId}/${doc.documentId}/v${n}.md`, sizeBytes: 10 });
    await db.insert(productDocumentVersions).values(version(1));
    await db.insert(productDocumentVersions).values(version(2));
    expect(await rejects(db.insert(productDocumentVersions).values(version(2)))).toBe(true);
    expect(await rejects(db.insert(productDocumentVersions).values({ ...version(3), version: 0 }))).toBe(true);
    await db.delete(productDocuments).where(eq(productDocuments.documentId, doc.documentId));
    expect(await db.select().from(productDocumentVersions).where(eq(productDocumentVersions.documentId, doc.documentId))).toEqual([]);
  });

  test("権限は、ディレクトリ × メンバーで 1 行(read / write)。同じ組は二重に入らない。ディレクトリを消すと消える", async () => {
    const dir = await insertDirectory("権限の確認");
    const member = a.members[0]!;
    await db.insert(directoryPermissions).values({ directoryId: dir.directoryId, productMemberId: member.memberId, level: "read" });
    expect(await rejects(db.insert(directoryPermissions).values({ directoryId: dir.directoryId, productMemberId: member.memberId, level: "write" }))).toBe(true);
    expect(await rejects(db.insert(directoryPermissions).values({ directoryId: dir.directoryId, productMemberId: a.members[1]!.memberId, level: "admin" as never }))).toBe(true);
    await db.delete(productDirectories).where(eq(productDirectories.directoryId, dir.directoryId));
    expect(await db.select().from(directoryPermissions).where(eq(directoryPermissions.directoryId, dir.directoryId))).toEqual([]);
  });

  test("編集ロックは、文書ごとに 1 行(同時に 2 人は取れない)", async () => {
    const dir = await insertDirectory("ロックの確認");
    const doc = await insertDocument(dir.directoryId, "lock.md");
    await db.insert(documentLocks).values({ documentId: doc.documentId, productMemberId: a.members[0]!.memberId });
    expect(await rejects(db.insert(documentLocks).values({ documentId: doc.documentId, productMemberId: a.members[1]!.memberId }))).toBe(true);
  });

  test("タスクとの結びつけ(文書の個別・ディレクトリ)。同じ組は二重に入らない。タスクを消すと消える", async () => {
    const dir = await insertDirectory("結びつけの確認");
    const doc = await insertDocument(dir.directoryId, "link.md");
    const task = await insertTask(a.members[0]!.memberId);
    await db.insert(taskDocuments).values({ taskId: task.taskId, documentId: doc.documentId });
    await db.insert(taskDirectories).values({ taskId: task.taskId, directoryId: dir.directoryId });
    expect(await rejects(db.insert(taskDocuments).values({ taskId: task.taskId, documentId: doc.documentId }))).toBe(true);
    expect(await rejects(db.insert(taskDirectories).values({ taskId: task.taskId, directoryId: dir.directoryId }))).toBe(true);
    await db.delete(tasks).where(eq(tasks.taskId, task.taskId));
    expect(await db.select().from(taskDocuments).where(eq(taskDocuments.taskId, task.taskId))).toEqual([]);
    expect(await db.select().from(taskDirectories).where(eq(taskDirectories.taskId, task.taskId))).toEqual([]);
    // 文書とディレクトリは残る
    expect((await db.select().from(productDocuments).where(eq(productDocuments.documentId, doc.documentId))).length).toBe(1);
  });
});

describe("プロダクト", () => {
  test("文書の自動削除までの日数は、初期 7 日。1〜3650 の範囲だけ入る", async () => {
    const p = await setupProduct({ members: 0 });
    const [row] = await db.select().from(products).where(eq(products.productId, p.productId));
    expect(row!.documentAutoDeleteDays).toBe(7);
    for (const bad of [0, -1, 3651]) {
      expect(await rejects(db.update(products).set({ documentAutoDeleteDays: bad }).where(eq(products.productId, p.productId)))).toBe(true);
    }
    expect(await rejects(db.update(products).set({ documentAutoDeleteDays: 30 }).where(eq(products.productId, p.productId)))).toBe(false);
  });

  test("プロダクトを消すと、ディレクトリ・文書(・版・権限)も一緒に消える", async () => {
    const p = await setupProduct({ members: 0 });
    const dir = await insertDirectory("連鎖", p.productId);
    const doc = await insertDocument(dir.directoryId, "cascade.md", p.productId);
    await db.insert(productDocumentVersions).values({ documentId: doc.documentId, version: 1, r2Key: `${p.productId}/${doc.documentId}/v1.md`, sizeBytes: 1 });
    await db.delete(products).where(eq(products.productId, p.productId));
    expect(await db.select().from(productDirectories).where(eq(productDirectories.productId, p.productId))).toEqual([]);
    expect(await db.select().from(productDocuments).where(and(eq(productDocuments.productId, p.productId)))).toEqual([]);
    expect(await db.select().from(productDocumentVersions).where(eq(productDocumentVersions.documentId, doc.documentId))).toEqual([]);
  });
});
