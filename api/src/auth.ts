import "dotenv/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/auth-schema";

export const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [webOrigin],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
});
