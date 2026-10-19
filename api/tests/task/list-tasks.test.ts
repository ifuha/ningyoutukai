import { afterAll, describe, expect, test } from "bun:test";
import {
  cleanup,
  createOutsider,
  insertTask,
  request,
  setupProduct,
} from "./helpers";

afterAll(cleanup);

type TaskRow = {
  taskId: string;
  taskName: string;
  isVisible: boolean;
  completedAt: string | null;
  timeLimit: string | null;
  productMemberId: string;
};

async function list(productId: string, cookie?: string, query = "") {
  const res = await request("GET", `/api/product/${productId}/task${query}`, { cookie });
  return res;
}

async function listOk(productId: string, cookie: string, query = "") {
  const res = await list(productId, cookie, query);
  expect(res.status).toBe(200);
  return (await res.json()) as TaskRow[];
}

describe("GET /api/product/:productId/task 認証・所属", () => {
  test("cookie なしは 401", async () => {
    const { productId } = await setupProduct();
    expect((await list(productId)).status).toBe(401);
  });

  test("所属していないユーザーは 404", async () => {
    const { productId } = await setupProduct();
    const outsider = await createOutsider();
    const res = await list(productId, outsider.cookie);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: "プロダクトが見つかりません" });
  });

  test("存在しないプロダクトは 404", async () => {
    const { leader } = await setupProduct();
    const res = await list(crypto.randomUUID(), leader.cookie);
    expect(res.status).toBe(404);
  });

  test("productId が uuid でなければ 422", async () => {
    const { leader } = await setupProduct();
    expect((await list("not-a-uuid", leader.cookie)).status).toBe(422);
  });

  test("タスクが無ければ空配列", async () => {
    const { productId, leader } = await setupProduct();
    expect(await listOk(productId, leader.cookie)).toEqual([]);
  });
});
