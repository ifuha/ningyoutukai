import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { productMembers } from "../db/schema";

export type Membership = {
  productMemberId: string;
  role: "leader" | "member";
};

/**
 * ユーザーがプロダクトに所属していれば、そのメンバー情報を返す。所属していなければ undefined。
 * 所属していないプロダクトは存在を漏らさないよう、呼び出し側で 404 にする。
 */
export async function getMembership(
  productId: string,
  userId: string
): Promise<Membership | undefined> {
  const [row] = await db
    .select({
      productMemberId: productMembers.productMemberId,
      role: productMembers.role,
    })
    .from(productMembers)
    .where(
      and(
        eq(productMembers.productId, productId),
        eq(productMembers.userId, userId)
      )
    );
  return row;
}

/** 指定した memberId が、そのプロダクトのメンバーなら true */
export async function isMemberOfProduct(productId: string, memberId: string) {
  const [row] = await db
    .select({ productMemberId: productMembers.productMemberId })
    .from(productMembers)
    .where(
      and(
        eq(productMembers.productId, productId),
        eq(productMembers.productMemberId, memberId)
      )
    );
  return Boolean(row);
}
