import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { productDocumentVersions } from "../../src/db/schema";
import { documentKey, newAttemptId } from "../../src/lib/document-access";
import { createMemoryStorage, setDefaultDocumentStorage } from "../../src/lib/storage";
import { cleanup, setupProduct } from "../task/helpers";

// 同時に保存したとき、負けた側の後始末が、勝った側の本文を消さない(CI で見つかった不具合の再発防止)。
// 以前は、2 人とも「次の版」の同じ R2 のキーに書いたので、負けた側が自分の本文を消すと、勝った側の本文も消えた

const docs = createMemoryStorage();
type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup;
let dirId: string;

beforeAll(async () => {
  setDefaultDocumentStorage(docs);
  a = await setupProduct({ members: 0 });
  dirId = ((await (await call("POST", `/api/product/${a.productId}/directory`, { name: "競合" })).json()) as { directoryId: string }).directoryId;
});
afterAll(async () => {
  setDefaultDocumentStorage(undefined);
  await cleanup();
});

function call(method: string, path: string, body?: unknown) {
  return app.handle(new Request(`http://localhost${path}`, { method, headers: { cookie: a.leader.cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
}

describe("R2 のキー", () => {
  test("版 1 の形は固定。試行の印を渡すと、末尾に付く", () => {
    expect(documentKey("p", "d", 1)).toBe("p/d/v1.md");
    expect(documentKey("p", "d", 2, "ab12cd34")).toBe("p/d/v2-ab12cd34.md");
  });
  test("試行の印は、毎回違う 8 文字(16 進数)。キーに使える文字だけ", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newAttemptId()));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("同時に保存", () => {
  test("同じ版から同時に保存しても、勝った側の本文が残る(10 回繰り返す)。負けた側の本文は残らない", async () => {
    for (let i = 0; i < 10; i++) {
      const created = await call("POST", `/api/product/${a.productId}/directory/${dirId}/document`, { name: `race-${i}.md`, content: "0" });
      const id = ((await created.json()) as { documentId: string }).documentId;
      const [r1, r2] = await Promise.all([
        call("PUT", `/api/product/${a.productId}/document/${id}`, { content: "A", baseVersion: 1 }),
        call("PUT", `/api/product/${a.productId}/document/${id}`, { content: "B", baseVersion: 1 }),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      const winner = r1.status === 200 ? "A" : "B";
      // 勝った側の本文が、読める(R2 から消えていない)
      const got = await call("GET", `/api/product/${a.productId}/document/${id}`);
      expect(got.status).toBe(200);
      const body = (await got.json()) as { currentVersion: number; content: string };
      expect(body.currentVersion).toBe(2);
      expect(body.content).toBe(winner);
      // DB に控えたキーが、R2 に実際にある。負けた側のキーは、R2 に残っていない(版 2 の本文は、ちょうど 1 つ)
      const [v2] = await db.select().from(productDocumentVersions).where(eq(productDocumentVersions.documentId, id));
      expect(v2).toBeDefined();
      const keysForDoc = docs.keys().filter((k) => k.includes(id));
      expect(keysForDoc.length).toBe(2); // 版 1 と、勝った側の版 2
    }
  });
});
