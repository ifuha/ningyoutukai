import { Elysia } from "elysia";
import { aiTokenEndpoints } from "./ai-tokens";
import { listMyTasks } from "./list-my-tasks";

/** ログイン中のユーザー自身についての API(`/api/me/...`)。CLI が使う(docs/v3.0/cli.md)。AI 用のトークンの発行・取り消しは、人のログインだけ(v4.0) */
export const meRoutes = new Elysia({ name: "me-routes" }).use(listMyTasks).use(aiTokenEndpoints);
