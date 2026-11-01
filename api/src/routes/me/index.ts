import { Elysia } from "elysia";
import { listMyTasks } from "./list-my-tasks";

/** ログイン中のユーザー自身についての API(`/api/me/...`)。CLI が使う(docs/v3.0/cli.md) */
export const meRoutes = new Elysia({ name: "me-routes" }).use(listMyTasks);
