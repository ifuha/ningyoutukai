import { and, eq, or, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productInvitations, products, users } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { InvitationSchema, MessageSchema, toInvitationView } from "../../lib/invitation";
import { mailer } from "../../lib/mailer";
import { getMembership } from "../../lib/product-access";

const EMAIL_PATTERN = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";

// メンバー招待 POST /api/product/:productId/invitation
// githubId(GitHub の username)か email のどちらか一方を指定する。
// 未登録の相手も招待できる(user_id は空のまま、招待先を保存し、登録後に自分宛てとして届く)。
export const createInvitation = new Elysia({ name: "invitation-create-invitation" })
  .use(authGuard)
  .post(
    "/api/product/:productId/invitation",
    async ({ params, body, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      const githubId = body.githubId?.trim() || undefined;
      const email = body.email?.trim() || undefined;
      if ((githubId && email) || (!githubId && !email)) {
        return status(400, {
          message: "GitHub のユーザー名かメールアドレスのどちらか一方を指定してください",
        });
      }
      const inviteeType = githubId ? ("github" as const) : ("gmail" as const);
      const identifier = (githubId ?? email)!;
      if (email && !new RegExp(EMAIL_PATTERN).test(email)) {
        return status(400, { message: "メールアドレスの形式が正しくありません" });
      }

      // 招待相手が登録済みか調べる(大文字小文字は区別しない)
      const [invitee] = await db
        .select({ userId: users.userId, email: users.email })
        .from(users)
        .where(
          githubId
            ? sql`lower(${users.githubId}) = ${githubId.toLowerCase()}`
            : sql`lower(${users.email}) = ${email!.toLowerCase()}`
        );

      if (invitee?.userId === user.userId) {
        return status(400, { message: "自分自身は招待できません" });
      }
      if (invitee && (await getMembership(params.productId, invitee.userId))) {
        return status(409, { message: "すでにプロダクトのメンバーです" });
      }

      // 保留中の招待が重複しないようにする(登録済みなら user_id で、未登録なら招待先で判定)
      const sameIdentifier = and(
        eq(productInvitations.inviteeType, inviteeType),
        sql`lower(${productInvitations.inviteeIdentifier}) = ${identifier.toLowerCase()}`
      );
      const [duplicated] = await db
        .select({ invitationId: productInvitations.invitationId })
        .from(productInvitations)
        .where(
          and(
            eq(productInvitations.productId, params.productId),
            eq(productInvitations.status, "pending"),
            invitee
              ? or(eq(productInvitations.userId, invitee.userId), sameIdentifier)
              : sameIdentifier
          )
        );
      if (duplicated) return status(409, { message: "すでに招待しています" });

      const [created] = await db
        .insert(productInvitations)
        .values({
          productId: params.productId,
          userId: invitee?.userId ?? null,
          inviteeIdentifier: identifier,
          inviteeType,
        })
        .returning();

      // 招待された人へ通知(失敗しても招待は成功させる。mailer は例外を投げない)。
      // 宛先は、登録済みならそのメール、未登録でもメールで招待したならそのメール。GitHub だけで未登録なら送れない
      const to = invitee?.email ?? email;
      if (to) {
        const [product] = await db
          .select({ productName: products.productName })
          .from(products)
          .where(eq(products.productId, params.productId));
        await mailer.send({
          to,
          subject: `プロダクトに招待されました: ${product?.productName ?? ""}`,
          text: `${user.userName} さんから、プロダクト「${product?.productName ?? ""}」に招待されました。\nアプリにログインして、招待を承認するとプロダクトに参加できます。`,
        });
      }

      return status(201, toInvitationView(created));
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      body: t.Object({
        githubId: t.Optional(t.String({ maxLength: 100 })),
        email: t.Optional(t.String({ maxLength: 254 })),
      }),
      response: {
        201: InvitationSchema,
        400: MessageSchema,
        403: MessageSchema,
        404: MessageSchema,
        409: MessageSchema,
      },
      detail: { summary: "メンバー招待" },
    }
  );
