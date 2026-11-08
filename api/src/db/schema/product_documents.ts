import { sql } from "drizzle-orm";
import { boolean, check, index, integer, primaryKey, snakeCase, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { documentPermissionEnum } from "./enums";
import { productMembers } from "./product_members";
import { products } from "./products";
import { tasks } from "./tasks";
import { users } from "./users";

// 文書(Markdown)の表。仕様は `docs/v4.0/overview.md`。
// 本文は R2(文書用の非公開バケット)に置き、ここには、名前・置き場所・版・R2 のキーなどを持つ。

/** ディレクトリ(プロダクトの中のフォルダ)。階層は 1 段だけなので、親は持たない */
export const productDirectories = snakeCase.table(
  "product_directories",
  {
    directoryId: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.productId, { onDelete: "cascade" }),
    name: text().notNull(),
    // 作った人。退会しても残し、作成者だけ NULL に戻す(メモ・コメントと同じ)
    createdBy: uuid().references(() => users.userId, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // 同じプロダクトの中で、名前は重ならない
    unique("product_directories_product_name_unique").on(table.productId, table.name),
    check("product_directories_name_length_check", sql`char_length(${table.name}) BETWEEN 1 AND 100`),
  ],
);

/** 文書。**必ずどれかのディレクトリに入る**。中に文書があるディレクトリは消せない(`ON DELETE RESTRICT`) */
export const productDocuments = snakeCase.table(
  "product_documents",
  {
    documentId: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.productId, { onDelete: "cascade" }),
    directoryId: uuid()
      .notNull()
      .references(() => productDirectories.directoryId, { onDelete: "restrict" }),
    name: text().notNull(),
    // いまの版(1 から)。保存のたびに増える。前の版は `product_document_versions` に残る
    currentVersion: integer().notNull().default(1),
    // true の文書は、自動削除しない(リーダーだけが変えられる)
    keepForever: boolean().notNull().default(false),
    // 最後に呼び出された日時(CLI / API で取ったとき、人が画面で開いたとき)。NULL = 一度も呼び出されていない(作成日時から数える)
    lastFetchedAt: timestamp({ withTimezone: true }),
    createdBy: uuid().references(() => users.userId, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // 同じディレクトリの中で、名前は重ならない
    unique("product_documents_directory_name_unique").on(table.directoryId, table.name),
    // プロダクトごとの一覧と、自動削除の対象の検索
    index("product_documents_product_id_idx").on(table.productId),
    check("product_documents_name_length_check", sql`char_length(${table.name}) BETWEEN 1 AND 100`),
    check("product_documents_version_check", sql`${table.currentVersion} >= 1`),
  ],
);

/** 文書の版。保存のたびに 1 行ふえる(前の版は残す)。本文は R2 の `r2Key` にある */
export const productDocumentVersions = snakeCase.table(
  "product_document_versions",
  {
    documentId: uuid()
      .notNull()
      .references(() => productDocuments.documentId, { onDelete: "cascade" }),
    version: integer().notNull(),
    // R2 のキー(例: <productId>/<documentId>/v<版>.md)。ファイル名を変えても、キーは変えない
    r2Key: text().notNull(),
    sizeBytes: integer().notNull(),
    // この版を保存した人
    createdBy: uuid().references(() => users.userId, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.version] }),
    check("product_document_versions_version_check", sql`${table.version} >= 1`),
    check("product_document_versions_size_check", sql`${table.sizeBytes} >= 0`),
  ],
);

/** ディレクトリごとの権限(メンバーごと)。リーダーは全権限なので、行を持たない。行がなければ、読み取りのみ */
export const directoryPermissions = snakeCase.table(
  "directory_permissions",
  {
    directoryId: uuid()
      .notNull()
      .references(() => productDirectories.directoryId, { onDelete: "cascade" }),
    productMemberId: uuid()
      .notNull()
      .references(() => productMembers.productMemberId, { onDelete: "cascade" }),
    level: documentPermissionEnum().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.directoryId, table.productMemberId] }),
    // メンバーを消したときの連鎖削除を、全件走査にしない
    index("directory_permissions_member_idx").on(table.productMemberId),
  ],
);

/** 編集ロック。文書ごとに 1 行(編集中の人)。外れる条件: 最後の編集から 30 分、または最後の知らせ(ハートビート)から 90 秒 */
export const documentLocks = snakeCase.table(
  "document_locks",
  {
    documentId: uuid()
      .primaryKey()
      .references(() => productDocuments.documentId, { onDelete: "cascade" }),
    productMemberId: uuid()
      .notNull()
      .references(() => productMembers.productMemberId, { onDelete: "cascade" }),
    lockedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // 最後に内容を編集した日時(入力・削除など。スクロールやカーソルの移動は入れない)
    lastEditedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // 最後に画面から「まだ開いている」と知らせが来た日時
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("document_locks_member_idx").on(table.productMemberId)],
);

/** タスクに渡す文書(個別)。タスクの作成のときに結びつける */
export const taskDocuments = snakeCase.table(
  "task_documents",
  {
    taskId: uuid()
      .notNull()
      .references(() => tasks.taskId, { onDelete: "cascade" }),
    documentId: uuid()
      .notNull()
      .references(() => productDocuments.documentId, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.documentId] }),
    index("task_documents_document_idx").on(table.documentId),
  ],
);

/** タスクに渡すディレクトリ(中の文書すべてが渡る。後から文書を足したときも渡る) */
export const taskDirectories = snakeCase.table(
  "task_directories",
  {
    taskId: uuid()
      .notNull()
      .references(() => tasks.taskId, { onDelete: "cascade" }),
    directoryId: uuid()
      .notNull()
      .references(() => productDirectories.directoryId, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.directoryId] }),
    index("task_directories_directory_idx").on(table.directoryId),
  ],
);
