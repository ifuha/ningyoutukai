import { afterAll, expect, test } from "bun:test";
import { cleanup, setupProduct } from "../task/helpers";
import { get, patch } from "./helpers";

afterAll(cleanup);

// 不具合の再現。いまは「失敗することを期待」して緑。実装が直ると赤になるので、
// 直したときに test.failing を test に変える。

// PATCH の名前に NUL 文字(\u0000)を含むと、PostgreSQL が
// `invalid byte sequence for encoding "UTF8": 0x00` (22021) で拒否し、500 になる。
// 期待: 400 か 422 で { message }(入力の誤りなので 4xx)。
test.failing("PATCH: 名前に NUL 文字を含むと 500 ではなく 4xx を返す", async () => {
  const { productId, leader } = await setupProduct();
  const before = (await (await get(productId, leader.cookie)).json()).productName;
  const res = await patch(productId, leader.cookie, { productName: "a\u0000b" });
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(res.status).toBeLessThan(500);
  expect((await get(productId, leader.cookie).then((r) => r.json())).productName).toBe(before);
});
