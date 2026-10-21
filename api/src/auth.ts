import "dotenv/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/auth-schema";

export const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

type GithubProfileLite = {
  login: string;
};

/**
 * GitHub のプロフィールから、better-auth の `user` に保存する追加項目を作る。
 * ログインのたびに呼ばれるので、GitHub のユーザー名(login)の変更にも追従する。
 * キーは、`user.additionalFields` で宣言している `githubId` と同じにする
 * (違うキーを返すと、保存されずに捨てられる)。
 * 要件の「GitHub の username でメンバーを招待する」ために、ユーザー名(login)を入れる。
 */
export function mapGithubProfile(profile: GithubProfileLite) {
  return { githubId: profile.login };
}

// GitHub / Google は環境変数が揃っているものだけ有効にする
const socialProviders = {
  ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? {
        github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        // 追加: メール非公開の人でも email を取れるようにする
        scope: ["read:user", "user:email"],
        // 追加: ログインのたびに呼ばれる。username の変更にも追従する
        mapProfileToUser: mapGithubProfile,
      },
      }
    : {}),
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
};

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [webOrigin],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // パスワード認証は提供しない(要件定義: DB にパスワードを持たない)
  emailAndPassword: { enabled: false },
  user: {
  // 追加: app-user.ts が users へコピーするために、better-auth の user に保存する
  additionalFields: {
    githubId: { type: "string", required: false, input: false },
  },
},
  socialProviders,
});
