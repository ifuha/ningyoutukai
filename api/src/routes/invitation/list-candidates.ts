import { and, asc, eq, ne, notInArray, or, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, users } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { MessageSchema } from "../../lib/invitation";
import { getMembership } from "../../lib/product-access";
import { NO_NUL } from "../../lib/validation";

const LIMIT = 8;

// LIKE の特殊文字(% _ \)を、ただの文字として扱う
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// 招待の候補 GET /api/product/:productId/invitation/candidate?q=
// 登録済みのユーザーのうち、名前・GitHub の username・メールに q を含む人を返す。
// すでにメンバーの人と自分は除く。リーダーだけが呼べる。メールは GitHub の username を持たない人にだけ返す
export const listInvitationCandidates = new Elysia({ name: "invitation-list-candidates" })
  .use(authGuard)
  .get(
    "/api/product/:productId/invitation/candidate",
    async ({ params, query, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      const q = query.q.trim().replace(/^@/, "");
      if (q === "") return [];
      const pattern = `%${escapeLike(q.toLowerCase())}%`;

      const members = db
        .select({ userId: productMembers.userId })
        .from(productMembers)
        .where(eq(productMembers.productId, params.productId));

      const rows = await db
        .select({
          userId: users.userId,
          userName: users.userName,
          githubId: users.githubId,
          email: users.email,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(
          and(
            ne(users.userId, user.userId),
            notInArray(users.userId, members),
            or(
              sql`lower(${users.userName}) like ${pattern}`,
              sql`lower(${users.githubId}) like ${pattern}`,
              sql`lower(${users.email}) like ${pattern}`
            )
          )
        )
        .orderBy(asc(users.userName), asc(users.userId))
        .limit(LIMIT);

      return rows.map((r) => ({
        userId: r.userId,
        userName: r.userName,
        githubId: r.githubId,
        email: r.githubId ? null : r.email,
        avatarUrl: r.avatarUrl,
      }));
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      query: t.Object({ q: t.String({ maxLength: 100, pattern: NO_NUL }) }),
      response: {
        200: t.Array(
          t.Object({
            userId: t.String(),
            userName: t.String(),
            githubId: t.Nullable(t.String()),
            email: t.Nullable(t.String()),
            avatarUrl: t.Nullable(t.String()),
          })
        ),
        403: MessageSchema,
        404: MessageSchema,
      },
      detail: { summary: "メンバー招待の候補" },
    }
  );
