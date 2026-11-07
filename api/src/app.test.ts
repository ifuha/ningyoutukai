import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Elysia } from "elysia";
import { app } from "./app";
import { devStorageRoutes } from "./routes/dev-storage";

// 登録の追加・消失が意図的でないと失敗させるための、期待するルート一覧(メソッド + パス)
const EXPECTED_ROUTES = [
  "ALL /api/auth/*",
  "DELETE /api/product/:productId",
  "DELETE /api/product/:productId/avatar",
  "DELETE /api/product/:productId/member/:memberId",
  "DELETE /api/product/:productId/note/:noteId",
  "DELETE /api/product/:productId/section/:sectionId",
  "DELETE /api/product/:productId/task/:taskId",
  "DELETE /api/product/:productId/task_kinds/:kindId",
  "DELETE /api/product/:productId/task/:taskId/message/:messageId",
  "GET /",
  "GET /api/calendar/status",
  "GET /api/_dev-storage/*",
  "GET /api/invitation",
  "GET /api/me/task",
  "GET /api/product/",
  "GET /api/product/:productId",
  "GET /api/product/:productId/invitation/candidate",
  "GET /api/product/:productId/member",
  "GET /api/product/:productId/member/:memberId",
  "GET /api/product/:productId/member/:memberId/task",
  "GET /api/product/:productId/note",
  "GET /api/product/:productId/revision",
  "GET /api/product/:productId/section",
  "GET /api/product/:productId/task",
  "GET /api/product/:productId/task/:taskId",
  "GET /api/product/:productId/task/:taskId/message", 
  "GET /api/product/:productId/task_kinds",
  "GET /api/product/:productId/tree",
  "GET /swagger",
  "GET /swagger/json",
  "OPTIONS /",
  "OPTIONS /*",
  "PUT /api/product/:productId/avatar",
  "PATCH /api/product/:productId",
  "PATCH /api/product/:productId/member/:memberId/position",
  "PATCH /api/product/:productId/note/:noteId",
  "PATCH /api/product/:productId/section/:sectionId",
  "PATCH /api/product/:productId/task/:taskId",
  "PATCH /api/product/:productId/task/assignee",
  "PATCH /api/product/:productId/task/:taskId/complete",
  "PATCH /api/product/:productId/task/:taskId/task_kinds/:kindId",
  "PATCH /api/product/:productId/task_kinds/:kindId",
  "PATCH /api/product/:productId/task/:taskId/message/:messageId",
  "POST /api/invitation/:invitationId/accept",
  "POST /api/invitation/:invitationId/reject",
  "POST /api/product/",
  "POST /api/product/:productId/invitation",
  "POST /api/product/:productId/note",
  "POST /api/product/:productId/section",
  "POST /api/product/:productId/task",
  "POST /api/product/:productId/task/:taskId/complete-report",
  "POST /api/product/:productId/task/suggest-assignee",
  "POST /api/product/:productId/task_kinds",
  "POST /api/product/:productId/task/:taskId/message",
];

const registered = app.routes.map((r) => `${r.method} ${r.path}`);

describe("app のルート登録", () => {
  test("登録済みルートが、期待する一覧と一致する", () => {
    expect([...registered].sort()).toEqual([...EXPECTED_ROUTES].sort());
  });

  test("同じメソッド + パスが、重複して登録されていない", () => {
    const duplicated = registered.filter((r, i) => registered.indexOf(r) !== i);
    expect(duplicated).toEqual([]);
  });

  test("開発用の配信ルートは、AVATAR_BASE_URL が未設定のときだけ登録される(設定されている本番では登録されない)", () => {
    const saved = process.env.AVATAR_BASE_URL;
    const routesOf = () => devStorageRoutes(new Elysia()).routes.map((r) => `${r.method} ${r.path}`);
    try {
      delete process.env.AVATAR_BASE_URL;
      expect(routesOf()).toEqual(["GET /api/_dev-storage/*"]);
      process.env.AVATAR_BASE_URL = "https://pub-example.r2.dev";
      expect(routesOf()).toEqual([]);
      process.env.AVATAR_BASE_URL = "";
      expect(routesOf()).toEqual(["GET /api/_dev-storage/*"]);
    } finally {
      if (saved === undefined) delete process.env.AVATAR_BASE_URL;
      else process.env.AVATAR_BASE_URL = saved;
    }
  });

  test("AVATAR_BASE_URL を設定して app.ts を読み込み直すと、開発用の配信ルートがない", async () => {
    const saved = process.env.AVATAR_BASE_URL;
    process.env.AVATAR_BASE_URL = "https://pub-example.r2.dev";
    try {
      const { app: prodApp } = await import(`./app?prod=${Date.now()}`);
      const paths = prodApp.routes.map((r: { method: string; path: string }) => `${r.method} ${r.path}`);
      expect(paths).not.toContain("GET /api/_dev-storage/*");
      expect(paths).toContain("PUT /api/product/:productId/avatar");
      expect(paths).toContain("DELETE /api/product/:productId/avatar");
    } finally {
      if (saved === undefined) delete process.env.AVATAR_BASE_URL;
      else process.env.AVATAR_BASE_URL = saved;
    }
  });

  test("routes/ の各プラグイン(xxxRoutes)が、app.ts で使われている", () => {
    const names: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
          const src = readFileSync(path, "utf8");
          for (const m of src.matchAll(/^export const (\w+Routes)\b/gm)) names.push(m[1]);
        }
      }
    };
    walk(join(import.meta.dir, "routes"));
    expect(names.length).toBeGreaterThan(0);

    const appSrc = readFileSync(join(import.meta.dir, "app.ts"), "utf8");
    const unused = names.filter((n) => !appSrc.includes(`.use(${n})`));
    expect(unused).toEqual([]);
  });
});
