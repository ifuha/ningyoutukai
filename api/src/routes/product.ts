import { and, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { productMembers, products, tasks } from "../db/schema";
import { authGuard } from "../lib/auth-guard";
import { withAvatarUrl } from "../lib/avatar";
import { MessageSchema, ProductSchema } from "../lib/response-schema";
import { NO_NUL } from "../lib/validation";

const productColumns = {
  productId: products.productId,
  productName: products.productName,
  createdAt: products.createdAt,
  avatarKey: products.avatarKey,
  documentAutoDeleteDays: products.documentAutoDeleteDays,
  role: productMembers.role,
};

export const productRoutes = new Elysia({ prefix: "/api/product" })
  .use(authGuard)
  // プロダクト作成: 作成者は自動でプロダクトリーダーになる
  .post(
    "/",
    async ({ body, user, status }) => {
      const productName = body.productName.trim();
      if (!productName) return status(400, { message: "プロダクト名を入力してください" });

      const created = await db.transaction(async (tx) => {
        const [product] = await tx
          .insert(products)
          .values({ productName })
          .returning();
        await tx.insert(productMembers).values({
          productId: product.productId,
          userId: user.userId,
          role: "leader",
        });
        return product;
      });

      // avatarKey(R2 のキー)は応答に含めない。代わりに avatarUrl を返す
      return status(201, { ...withAvatarUrl(created), role: "leader" as const });
    },
    {
      requireUser: true,
      body: t.Object({ productName: t.String({ maxLength: 100, pattern: NO_NUL }) }),
      response: { 201: ProductSchema, 400: MessageSchema },
      detail: { summary: "プロダクト作成" },
    }
  )
  // プロダクト一覧: ログイン中のユーザーが所属するもの。
  // `pendingReviewCount` = 確認待ち(完了報告済みで、まだ完了になっていないタスク)の数。**リーダーのプロダクトだけ**(確認するのはリーダー)。メンバーのプロダクトは null。
  // サイドバーが、確認が要るプロダクトに赤い点を出すために使う
  .get(
    "/",
    async ({ user }) => {
      const rows = await db
        .select(productColumns)
        .from(productMembers)
        .innerJoin(products, eq(productMembers.productId, products.productId))
        .where(eq(productMembers.userId, user.userId));

      const leaderProductIds = rows.filter((r) => r.role === "leader").map((r) => r.productId);
      const counts = new Map<string, number>();
      if (leaderProductIds.length > 0) {
        const pending = await db
          .select({ productId: productMembers.productId, n: count() })
          .from(tasks)
          .innerJoin(productMembers, eq(tasks.productMemberId, productMembers.productMemberId))
          .where(and(inArray(productMembers.productId, leaderProductIds), isNotNull(tasks.reportedAt), isNull(tasks.completedAt)))
          .groupBy(productMembers.productId);
        for (const row of pending) counts.set(row.productId, row.n);
      }
      return rows.map((r) => ({
        ...withAvatarUrl(r),
        pendingReviewCount: r.role === "leader" ? (counts.get(r.productId) ?? 0) : null,
      }));
    },
    {
      requireUser: true,
      response: { 200: t.Array(t.Composite([ProductSchema, t.Object({ pendingReviewCount: t.Nullable(t.Number()) })])) },
      detail: { summary: "プロダクト一覧取得" },
    }
  )
  // プロダクト取得: 所属していないプロダクトは存在を漏らさないよう 404
  .get(
    "/:productId",
    async ({ params, user, status }) => {
      const [row] = await db
        .select(productColumns)
        .from(productMembers)
        .innerJoin(products, eq(productMembers.productId, products.productId))
        .where(
          and(
            eq(productMembers.productId, params.productId),
            eq(productMembers.userId, user.userId)
          )
        );
      return row ? withAvatarUrl(row) : status(404, { message: "プロダクトが見つかりません" });
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      response: { 200: ProductSchema, 404: MessageSchema },
      detail: { summary: "指定したプロダクトを取得" },
    }
  );
