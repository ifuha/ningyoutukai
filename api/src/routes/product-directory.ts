import { and, asc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { directoryPermissions, productDirectories, productDocuments, productMembers, users } from "../db/schema";
import { authGuard } from "../lib/auth-guard";
import { directoryNameSchema, findDirectory } from "../lib/document-access";
import { documentAuthorizer } from "../lib/document-authorize";
import { documentSummarySchema, levelSchema, selectDocumentSummaries } from "../lib/document-view";
import { getMembership } from "../lib/product-access";
import { MessageSchema } from "../lib/response-schema";
import { isUniqueViolation } from "../lib/task-kind";

// ディレクトリ(プロダクトの中のフォルダ。1 段だけ)と、ディレクトリごとの権限。仕様は docs/v4.0/overview.md
// - 一覧は、プロダクトの参加者全員が見られる。ディレクトリの作成・名前の変更・削除、権限の設定は、リーダーだけ
// - 文書が入っているディレクトリは消せない(先に文書を消すか、別のディレクトリへ移す)

const params = t.Object({ productId: t.String({ format: "uuid" }) });
const directoryParams = t.Object({ productId: t.String({ format: "uuid" }), directoryId: t.String({ format: "uuid" }) });
const permissionParams = t.Object({
  productId: t.String({ format: "uuid" }),
  directoryId: t.String({ format: "uuid" }),
  memberId: t.String({ format: "uuid" }),
});

const directorySchema = () =>
  t.Object({
    directoryId: t.String(),
    name: t.String(),
    // 見ている人の、このディレクトリでの権限(リーダーは常に write)
    myLevel: levelSchema(),
    createdAt: t.Date(),
    documents: t.Array(documentSummarySchema()),
  });

const notFoundProduct = { message: "プロダクトが見つかりません" };
const notFoundDirectory = { message: "ディレクトリが見つかりません" };
const leaderOnly = { message: "プロダクトリーダーのみ実行できます" };
const duplicateName = { message: "同じ名前のディレクトリがあります" };

export const productDirectoryRoutes = new Elysia({ name: "product-directory" })
  .use(authGuard)
  .use(documentAuthorizer)
  // 一覧: ディレクトリと、中の文書の概要(本文は含まない)
  .get(
    "/api/product/:productId/directory",
    async ({ params, user, documentAuthorize, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      const can = documentAuthorize({ role: membership.role });

      const directories = await db
        .select()
        .from(productDirectories)
        .where(eq(productDirectories.productId, params.productId))
        .orderBy(asc(productDirectories.name));
      const documents = await selectDocumentSummaries(eq(productDocuments.productId, params.productId));
      const mine = await db
        .select({ directoryId: directoryPermissions.directoryId, level: directoryPermissions.level })
        .from(directoryPermissions)
        .where(eq(directoryPermissions.productMemberId, membership.productMemberId));
      const levelByDirectory = new Map(mine.map((p) => [p.directoryId, p.level]));

      return directories.map((d) => ({
        directoryId: d.directoryId,
        name: d.name,
        myLevel: can.levelOf(levelByDirectory.get(d.directoryId)),
        createdAt: d.createdAt,
        documents: documents.filter((doc) => doc.directoryId === d.directoryId),
      }));
    },
    {
      requireUser: true,
      params,
      response: { 200: t.Array(directorySchema()), 404: MessageSchema },
      detail: { summary: "ディレクトリと文書の一覧(参加者全員)" },
    },
  )
  .post(
    "/api/product/:productId/directory",
    async ({ params, body, user, documentAuthorize, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      if (!documentAuthorize({ role: membership.role }).canManage()) return status(403, leaderOnly);
      try {
        const [created] = await db
          .insert(productDirectories)
          .values({ productId: params.productId, name: body.name, createdBy: user.userId })
          .returning();
        return status(201, { directoryId: created.directoryId, name: created.name, myLevel: "write" as const, createdAt: created.createdAt, documents: [] });
      } catch (e) {
        if (isUniqueViolation(e)) return status(409, duplicateName);
        throw e;
      }
    },
    {
      requireUser: true,
      params,
      body: t.Object({ name: directoryNameSchema() }),
      response: { 201: directorySchema(), 403: MessageSchema, 404: MessageSchema, 409: MessageSchema },
      detail: { summary: "ディレクトリ作成(リーダー)" },
    },
  )
  .patch(
    "/api/product/:productId/directory/:directoryId",
    async ({ params, body, user, documentAuthorize, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      if (!documentAuthorize({ role: membership.role }).canManage()) return status(403, leaderOnly);
      const directory = await findDirectory(params.productId, params.directoryId);
      if (!directory) return status(404, notFoundDirectory);
      try {
        const [updated] = await db
          .update(productDirectories)
          .set({ name: body.name, updatedAt: new Date() })
          .where(eq(productDirectories.directoryId, params.directoryId))
          .returning();
        const documents = await selectDocumentSummaries(eq(productDocuments.directoryId, params.directoryId));
        return { directoryId: updated.directoryId, name: updated.name, myLevel: "write" as const, createdAt: updated.createdAt, documents };
      } catch (e) {
        if (isUniqueViolation(e)) return status(409, duplicateName);
        throw e;
      }
    },
    {
      requireUser: true,
      params: directoryParams,
      body: t.Object({ name: directoryNameSchema() }),
      response: { 200: directorySchema(), 403: MessageSchema, 404: MessageSchema, 409: MessageSchema },
      detail: { summary: "ディレクトリの名前変更(リーダー)" },
    },
  )
  .delete(
    "/api/product/:productId/directory/:directoryId",
    async ({ params, user, documentAuthorize, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      if (!documentAuthorize({ role: membership.role }).canManage()) return status(403, leaderOnly);
      const directory = await findDirectory(params.productId, params.directoryId);
      if (!directory) return status(404, notFoundDirectory);
      // 文書が入っているディレクトリは消せない(外部キーの RESTRICT でも守られる)
      const [inside] = await db
        .select({ documentId: productDocuments.documentId })
        .from(productDocuments)
        .where(eq(productDocuments.directoryId, params.directoryId))
        .limit(1);
      if (inside) return status(409, { message: "文書が入っているディレクトリは消せません。先に文書を消すか、別のディレクトリへ移してください" });
      await db.delete(productDirectories).where(eq(productDirectories.directoryId, params.directoryId));
      return status(204, undefined);
    },
    {
      requireUser: true,
      params: directoryParams,
      response: { 204: t.Undefined(), 403: MessageSchema, 404: MessageSchema, 409: MessageSchema },
      detail: { summary: "ディレクトリ削除(リーダー。中に文書があると消せない)" },
    },
  )
  // 権限の一覧(リーダーだけ): リーダー以外の全メンバーと、このディレクトリでの権限(設定がなければ read)
  .get(
    "/api/product/:productId/directory/:directoryId/permission",
    async ({ params, user, documentAuthorize, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      if (!documentAuthorize({ role: membership.role }).canManage()) return status(403, leaderOnly);
      const directory = await findDirectory(params.productId, params.directoryId);
      if (!directory) return status(404, notFoundDirectory);
      const rows = await db
        .select({ memberId: productMembers.productMemberId, userName: users.userName, level: directoryPermissions.level })
        .from(productMembers)
        .innerJoin(users, eq(productMembers.userId, users.userId))
        .leftJoin(
          directoryPermissions,
          and(eq(directoryPermissions.productMemberId, productMembers.productMemberId), eq(directoryPermissions.directoryId, params.directoryId)),
        )
        .where(and(eq(productMembers.productId, params.productId), eq(productMembers.role, "member")))
        .orderBy(asc(users.userName));
      return rows.map((r) => ({ memberId: r.memberId, userName: r.userName, level: r.level ?? ("read" as const) }));
    },
    {
      requireUser: true,
      params: directoryParams,
      response: {
        200: t.Array(t.Object({ memberId: t.String(), userName: t.String(), level: levelSchema() })),
        403: MessageSchema,
        404: MessageSchema,
      },
      detail: { summary: "ディレクトリの権限の一覧(リーダー)" },
    },
  )
  // 権限の設定(リーダーだけ)。read = 設定の行を持たない(既定)、write = 行を持つ。リーダー自身は全権限なので、設定できない
  .put(
    "/api/product/:productId/directory/:directoryId/permission/:memberId",
    async ({ params, body, user, documentAuthorize, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      if (!documentAuthorize({ role: membership.role }).canManage()) return status(403, leaderOnly);
      const directory = await findDirectory(params.productId, params.directoryId);
      if (!directory) return status(404, notFoundDirectory);
      const [target] = await db
        .select({ role: productMembers.role })
        .from(productMembers)
        .where(and(eq(productMembers.productId, params.productId), eq(productMembers.productMemberId, params.memberId)));
      if (!target) return status(404, { message: "メンバーが見つかりません" });
      if (target.role === "leader") return status(422, { message: "リーダーは全権限なので、設定できません" });

      if (body.level === "write") {
        await db
          .insert(directoryPermissions)
          .values({ directoryId: params.directoryId, productMemberId: params.memberId, level: "write" })
          .onConflictDoUpdate({ target: [directoryPermissions.directoryId, directoryPermissions.productMemberId], set: { level: "write" } });
      } else {
        await db
          .delete(directoryPermissions)
          .where(and(eq(directoryPermissions.directoryId, params.directoryId), eq(directoryPermissions.productMemberId, params.memberId)));
      }
      return { memberId: params.memberId, level: body.level };
    },
    {
      requireUser: true,
      params: permissionParams,
      body: t.Object({ level: levelSchema() }),
      response: { 200: t.Object({ memberId: t.String(), level: levelSchema() }), 403: MessageSchema, 404: MessageSchema, 422: MessageSchema },
      detail: { summary: "ディレクトリの権限の設定(リーダー)" },
    },
  );
