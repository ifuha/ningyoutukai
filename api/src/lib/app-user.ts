import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";

type AuthUser = { email: string; name: string; image?: string | null };

/**
 * better-auth のユーザー(`user`)に対応するアプリ側のユーザー(`users`)を返す。なければ作る。
 *
 * TODO(v2): `users` と better-auth の `user` は二重管理になっている。
 * メールアドレスで対応づけているのは暫定対応で、v2 でテーブルを統一する。
 */
export async function getOrCreateAppUser(authUser: AuthUser) {
  const find = async () => {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, authUser.email));
    return row;
  };

  const existing = await find();
  if (existing) return existing;

  // 同時リクエストで二重に作られても、unique(email) で片方に収束させる
  await db
    .insert(users)
    .values({
      userName: authUser.name,
      email: authUser.email,
      avatarUrl: authUser.image ?? null,
    })
    .onConflictDoNothing({ target: users.email });

  return (await find())!;
}
