import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../src/db";
import { productMembers, sections } from "../../src/db/schema";
import { productTreeRoutes } from "../../src/routes/product-tree";
import { sectionRoutes } from "../../src/routes/section";
import { cleanup, createOutsider, setupProduct } from "../task/helpers";

// セクション機能(F1)の API。テーブルの制約そのものは schema.test.ts が見る。
// ここでは、権限、入力の検証、セクションを動かすとカードも動く仕様、同じプロダクトの検証を見る。

afterAll(cleanup);

const app = new Elysia().use(sectionRoutes).use(productTreeRoutes);

function req(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) {
  const headers = new Headers();
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
  );
}

const sectionUrl = (productId: string, sectionId?: string) =>
  `/api/product/${productId}/section${sectionId ? `/${sectionId}` : ""}`;
const positionUrl = (productId: string, memberId: string) =>
  `/api/product/${productId}/member/${memberId}/position`;

async function insertSection(productId: string, values: Partial<typeof sections.$inferInsert> = {}) {
  const [row] = await db
    .insert(sections)
    .values({
      productId,
      sectionName: `s-${crypto.randomUUID().slice(0, 8)}`,
      color: "red",
      ...values,
    })
    .returning();
  return row;
}

async function setMember(memberId: string, values: Partial<typeof productMembers.$inferInsert>) {
  await db.update(productMembers).set(values).where(eq(productMembers.productMemberId, memberId));
}

async function findMember(memberId: string) {
  const [row] = await db.select().from(productMembers).where(eq(productMembers.productMemberId, memberId));
  return row;
}

async function findSection(sectionId: string) {
  const [row] = await db.select().from(sections).where(eq(sections.sectionId, sectionId));
  return row;
}

const pos = (m: { positionX: number | null; positionY: number | null }) => [m.positionX, m.positionY];

describe("認証・所属・権限", () => {
  test("cookie なしは、すべてのルートで 401", async () => {
    const { productId, members } = await setupProduct();
    const s = await insertSection(productId);
    expect((await req("GET", sectionUrl(productId))).status).toBe(401);
    expect(
      (await req("POST", sectionUrl(productId), { body: { sectionName: "a", color: "red" } })).status,
    ).toBe(401);
    expect((await req("PATCH", sectionUrl(productId, s.sectionId), { body: { color: "blue" } })).status).toBe(401);
    expect((await req("DELETE", sectionUrl(productId, s.sectionId))).status).toBe(401);
    expect(
      (await req("PATCH", positionUrl(productId, members[0].memberId), { body: { positionX: 1, positionY: 2 } }))
        .status,
    ).toBe(401);
  });

  test("所属していないユーザーは、すべてのルートで 404(存在を漏らさない)", async () => {
    const { productId, members } = await setupProduct();
    const s = await insertSection(productId);
    const outsider = await createOutsider();
    const cookie = outsider.cookie;
    expect((await req("GET", sectionUrl(productId), { cookie })).status).toBe(404);
    expect(
      (await req("POST", sectionUrl(productId), { cookie, body: { sectionName: "a", color: "red" } })).status,
    ).toBe(404);
    expect((await req("PATCH", sectionUrl(productId, s.sectionId), { cookie, body: { color: "blue" } })).status).toBe(
      404,
    );
    expect((await req("DELETE", sectionUrl(productId, s.sectionId), { cookie })).status).toBe(404);
    expect(
      (await req("PATCH", positionUrl(productId, members[0].memberId), { cookie, body: { positionX: 1, positionY: 2 } }))
        .status,
    ).toBe(404);
    // 何も変わっていない
    expect((await findSection(s.sectionId)).color).toBe("red");
  });

  test("存在しないプロダクトは 404、uuid でない ID は 422", async () => {
    const { leader } = await setupProduct();
    const none = crypto.randomUUID();
    expect((await req("GET", sectionUrl(none), { cookie: leader.cookie })).status).toBe(404);
    expect((await req("GET", "/api/product/not-a-uuid/section", { cookie: leader.cookie })).status).toBe(422);
    expect((await req("PATCH", sectionUrl(none, crypto.randomUUID()), { cookie: leader.cookie, body: { color: "blue" } })).status).toBe(404);
    const { productId } = await setupProduct();
    expect((await req("DELETE", `/api/product/${productId}/section/not-a-uuid`, { cookie: leader.cookie })).status).toBe(422);
  });

  test("メンバー(リーダーでない)は、一覧は見られるが、作成・更新・削除・カードの移動は 403。何も変わらない", async () => {
    const { productId, leader, members } = await setupProduct();
    const s = await insertSection(productId, { sectionName: "既存", x: 10, y: 20 });
    await setMember(members[1].memberId, { sectionId: s.sectionId, positionX: 100, positionY: 200 });
    const cookie = members[0].cookie;

    const list = await req("GET", sectionUrl(productId), { cookie });
    expect(list.status).toBe(200);
    expect(((await list.json()) as unknown[]).length).toBe(1);

    expect(
      (await req("POST", sectionUrl(productId), { cookie, body: { sectionName: "新規", color: "green" } })).status,
    ).toBe(403);
    expect(
      (await req("PATCH", sectionUrl(productId, s.sectionId), { cookie, body: { sectionName: "改名", x: 999 } })).status,
    ).toBe(403);
    expect((await req("DELETE", sectionUrl(productId, s.sectionId), { cookie })).status).toBe(403);
    // 他のメンバーのカードも、自分のカードも、動かせない
    expect(
      (await req("PATCH", positionUrl(productId, members[1].memberId), { cookie, body: { positionX: 1, positionY: 1 } }))
        .status,
    ).toBe(403);
    expect(
      (await req("PATCH", positionUrl(productId, members[0].memberId), { cookie, body: { positionX: 1, positionY: 1 } }))
        .status,
    ).toBe(403);

    const after = await findSection(s.sectionId);
    expect([after.sectionName, after.x, after.y]).toEqual(["既存", 10, 20]);
    expect(pos(await findMember(members[1].memberId))).toEqual([100, 200]);
    expect(pos(await findMember(members[0].memberId))).toEqual([null, null]);
    expect((await db.select().from(sections).where(eq(sections.productId, productId))).length).toBe(1);
    void leader;
  });
});

describe("GET /section(一覧)", () => {
  test("セクションが無ければ空の配列", async () => {
    const { productId, leader } = await setupProduct();
    const res = await req("GET", sectionUrl(productId), { cookie: leader.cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("名前順で、所属メンバーの ID と、位置・大きさ・色が入る。別のプロダクトのセクションは出ない", async () => {
    const { productId, leader, members } = await setupProduct();
    const other = await setupProduct();
    await insertSection(other.productId, { sectionName: "他のプロダクト" });
    const b = await insertSection(productId, { sectionName: "b-設計", color: "blue", x: 5, y: 6, width: 70, height: 80 });
    const a = await insertSection(productId, { sectionName: "a-企画" });
    await setMember(members[0].memberId, { sectionId: b.sectionId });
    await setMember(members[1].memberId, { sectionId: b.sectionId });

    const res = await req("GET", sectionUrl(productId), { cookie: leader.cookie });
    const list = (await res.json()) as {
      sectionId: string;
      sectionName: string;
      color: string;
      x: number;
      y: number;
      width: number;
      height: number;
      createdAt: string;
      memberIds: string[];
    }[];
    expect(list.map((s) => s.sectionName)).toEqual(["a-企画", "b-設計"]);
    expect(list[0]).toMatchObject({ sectionId: a.sectionId, color: "red", x: 0, y: 0, width: 300, height: 400, memberIds: [] });
    expect(list[1]).toMatchObject({ sectionId: b.sectionId, color: "blue", x: 5, y: 6, width: 70, height: 80 });
    expect([...list[1].memberIds].sort()).toEqual([members[0].memberId, members[1].memberId].sort());
    expect(Number.isNaN(Date.parse(list[1].createdAt))).toBe(false);
  });
});

describe("POST /section(作成)", () => {
  test("既定の位置と大きさ(0, 0, 300×400)で作られ、DB にも入る。名前の前後の空白は取り除かれる", async () => {
    const { productId, leader } = await setupProduct();
    const res = await req("POST", sectionUrl(productId), {
      cookie: leader.cookie,
      body: { sectionName: "  企画  ", color: "purple" },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { sectionId: string };
    expect(body).toMatchObject({
      sectionName: "企画",
      color: "purple",
      x: 0,
      y: 0,
      width: 300,
      height: 400,
      memberIds: [],
    });
    const row = await findSection(body.sectionId);
    expect(row.productId).toBe(productId);
    expect(row.sectionName).toBe("企画");
  });

  test("位置と大きさを指定して作れる(小数と負の座標も)", async () => {
    const { productId, leader } = await setupProduct();
    const res = await req("POST", sectionUrl(productId), {
      cookie: leader.cookie,
      body: { sectionName: "広い", color: "lightblue", x: -120.5, y: 33.25, width: 640, height: 480.5 },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ x: -120.5, y: 33.25, width: 640, height: 480.5 });
  });

  test("名前は 50 文字までで、境界の値は通る(コードポイントで数える)", async () => {
    const { productId, leader } = await setupProduct();
    const ok = await req("POST", sectionUrl(productId), {
      cookie: leader.cookie,
      body: { sectionName: "あ".repeat(50), color: "red" },
    });
    expect(ok.status).toBe(201);
    const emoji = await req("POST", sectionUrl(productId), {
      cookie: leader.cookie,
      body: { sectionName: "😀".repeat(50), color: "red" },
    });
    expect(emoji.status).toBe(201);
    const ng = await req("POST", sectionUrl(productId), {
      cookie: leader.cookie,
      body: { sectionName: "あ".repeat(51), color: "red" },
    });
    expect(ng.status).toBe(422);
  });

  test("座標と大きさの境界: 座標は ±1,000,000、幅と高さは 0 より大きく 100,000 まで", async () => {
    const { productId, leader } = await setupProduct();
    const post = (name: string, extra: Record<string, unknown>) =>
      req("POST", sectionUrl(productId), { cookie: leader.cookie, body: { sectionName: name, color: "red", ...extra } });
    expect((await post("max", { x: 1_000_000, y: -1_000_000, width: 100_000, height: 100_000 })).status).toBe(201);
    expect((await post("x超過", { x: 1_000_001 })).status).toBe(422);
    expect((await post("y超過", { y: -1_000_001 })).status).toBe(422);
    expect((await post("幅0", { width: 0 })).status).toBe(422);
    expect((await post("幅負", { width: -1 })).status).toBe(422);
    expect((await post("高さ0", { height: 0 })).status).toBe(422);
    expect((await post("幅超過", { width: 100_001 })).status).toBe(422);
    expect((await post("高さ超過", { height: 100_001 })).status).toBe(422);
    expect((await post("微小", { width: 0.001, height: 0.001 })).status).toBe(201);
  });

  test("不正な入力は 422 で、何も作られない(空・空白だけ・NUL・色・型の誤り・必須の欠落)", async () => {
    const { productId, leader } = await setupProduct();
    const bodies: unknown[] = [
      { sectionName: "", color: "red" },
      { sectionName: "   ", color: "red" },
      { sectionName: "a\u0000b", color: "red" },
      { sectionName: "x".repeat(201), color: "red" },
      { sectionName: "a", color: "orange" },
      { sectionName: "a", color: "RED" },
      { sectionName: "a" },
      { color: "red" },
      { sectionName: 123, color: "red" },
      { sectionName: "a", color: "red", x: "10" },
      { sectionName: "a", color: "red", x: null },
      { sectionName: "a", color: "red", width: "300" },
      { sectionName: "a", color: "red", y: "Infinity" },
      { sectionName: "a", color: "red", height: "NaN" },
    ];
    for (const body of bodies) {
      const res = await req("POST", sectionUrl(productId), { cookie: leader.cookie, body });
      expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 422]);
    }
    expect((await db.select().from(sections).where(eq(sections.productId, productId))).length).toBe(0);
  });

  test("同じプロダクトで同じ名前は 409(前後の空白の違いも同じ名前)。別のプロダクトなら作れる", async () => {
    const { productId, leader } = await setupProduct();
    const other = await setupProduct();
    const post = (pid: string, cookie: string, name: string) =>
      req("POST", sectionUrl(pid), { cookie, body: { sectionName: name, color: "green" } });
    expect((await post(productId, leader.cookie, "企画")).status).toBe(201);
    expect((await post(productId, leader.cookie, "企画")).status).toBe(409);
    expect((await post(productId, leader.cookie, " 企画 ")).status).toBe(409);
    expect((await post(other.productId, other.leader.cookie, "企画")).status).toBe(201);
    expect((await db.select().from(sections).where(eq(sections.productId, productId))).length).toBe(1);
  });

  test("同じ名前を同時に 2 回作っても、成功は 1 回だけ(DB の一意制約の違反を 409 にする)", async () => {
    const { productId, leader } = await setupProduct();
    const res = await Promise.all(
      [0, 1, 2].map(() =>
        req("POST", sectionUrl(productId), { cookie: leader.cookie, body: { sectionName: "同時", color: "blue" } }),
      ),
    );
    expect(res.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect((await db.select().from(sections).where(eq(sections.productId, productId))).length).toBe(1);
  });
});

describe("PATCH /section/:sectionId(更新)", () => {
  test("名前と色を変える。位置は変わらないので、カードも動かない", async () => {
    const { productId, leader, members } = await setupProduct();
    const s = await insertSection(productId, { sectionName: "旧", x: 10, y: 20 });
    await setMember(members[0].memberId, { sectionId: s.sectionId, positionX: 100, positionY: 200 });
    const res = await req("PATCH", sectionUrl(productId, s.sectionId), {
      cookie: leader.cookie,
      body: { sectionName: "  新  ", color: "yellow" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      sectionId: s.sectionId,
      sectionName: "新",
      color: "yellow",
      x: 10,
      y: 20,
      memberIds: [members[0].memberId],
    });
    expect(pos(await findMember(members[0].memberId))).toEqual([100, 200]);
  });

  test("色を送らない更新で、色は変わらない(省略した値が red で補われない)", async () => {
    const { productId, leader } = await setupProduct();
    const s = await insertSection(productId, { sectionName: "青い", color: "blue" });
    for (const body of [{ sectionName: "名前だけ" }, { x: 5 }, { width: 50 }]) {
      const res = await req("PATCH", sectionUrl(productId, s.sectionId), { cookie: leader.cookie, body });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { color: string }).color).toBe("blue");
    }
    expect((await findSection(s.sectionId)).color).toBe("blue");
  });

  test("位置を変えると、所属メンバーのカードが同じ差分だけ動く。位置が NULL のカード・他のセクション・無所属は動かない", async () => {
    const { productId, leader, members } = await setupProduct({ members: 3 });
    const s = await insertSection(productId, { sectionName: "動く", x: 100, y: 100 });
    const other = await insertSection(productId, { sectionName: "動かない", x: 0, y: 0 });
    const [m0, m1, m2] = members;
    await setMember(m0.memberId, { sectionId: s.sectionId, positionX: 150, positionY: 160 });
    await setMember(m1.memberId, { sectionId: s.sectionId }); // 位置が NULL(自動配置)
    await setMember(m2.memberId, { sectionId: other.sectionId, positionX: 7, positionY: 8 });
    // リーダー自身のカードも、所属していれば動く。無所属のカードは動かない
    await setMember(leader.memberId, { sectionId: s.sectionId, positionX: 120, positionY: 130 });

    const res = await req("PATCH", sectionUrl(productId, s.sectionId), {
      cookie: leader.cookie,
      body: { x: 130, y: 70 }, // dx = +30, dy = -30
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ x: 130, y: 70 });
    expect(pos(await findMember(m0.memberId))).toEqual([180, 130]);
    expect(pos(await findMember(leader.memberId))).toEqual([150, 100]);
    expect(pos(await findMember(m1.memberId))).toEqual([null, null]);
    expect(pos(await findMember(m2.memberId))).toEqual([7, 8]);
    expect((await findMember(m2.memberId)).sectionId).toBe(other.sectionId);
  });

  test("x だけ・y だけの変更でも、その軸の差分だけ動く。同じ値への変更は動かさない", async () => {
    const { productId, leader, members } = await setupProduct();
    const s = await insertSection(productId, { x: 10, y: 10 });
    await setMember(members[0].memberId, { sectionId: s.sectionId, positionX: 50, positionY: 60 });
    await req("PATCH", sectionUrl(productId, s.sectionId), { cookie: leader.cookie, body: { x: 15 } });
    expect(pos(await findMember(members[0].memberId))).toEqual([55, 60]);
    await req("PATCH", sectionUrl(productId, s.sectionId), { cookie: leader.cookie, body: { y: 0 } });
    expect(pos(await findMember(members[0].memberId))).toEqual([55, 50]);
    await req("PATCH", sectionUrl(productId, s.sectionId), { cookie: leader.cookie, body: { x: 15, y: 0 } });
    expect(pos(await findMember(members[0].memberId))).toEqual([55, 50]);
  });

  test("大きさだけを変えても、カードは動かない", async () => {
    const { productId, leader, members } = await setupProduct();
    const s = await insertSection(productId, { x: 10, y: 10 });
    await setMember(members[0].memberId, { sectionId: s.sectionId, positionX: 50, positionY: 60 });
    const res = await req("PATCH", sectionUrl(productId, s.sectionId), {
      cookie: leader.cookie,
      body: { width: 800, height: 600 },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ x: 10, y: 10, width: 800, height: 600 });
    expect(pos(await findMember(members[0].memberId))).toEqual([50, 60]);
  });

  test("名前の重複で失敗したら、位置の変更もカードの移動も、まとめて取り消される(トランザクション)", async () => {
    const { productId, leader, members } = await setupProduct();
    await insertSection(productId, { sectionName: "先にある" });
    const s = await insertSection(productId, { sectionName: "動かす", x: 0, y: 0 });
    await setMember(members[0].memberId, { sectionId: s.sectionId, positionX: 10, positionY: 10 });
    const res = await req("PATCH", sectionUrl(productId, s.sectionId), {
      cookie: leader.cookie,
      body: { sectionName: "先にある", x: 500, y: 500 },
    });
    expect(res.status).toBe(409);
    const after = await findSection(s.sectionId);
    expect([after.sectionName, after.x, after.y]).toEqual(["動かす", 0, 0]);
    expect(pos(await findMember(members[0].memberId))).toEqual([10, 10]);
  });

  test("動かした先が座標の上限を超えるカードがあれば 422 で、何も変わらない", async () => {
    const { productId, leader, members } = await setupProduct();
    const s = await insertSection(productId, { x: 0, y: 0 });
    await setMember(members[0].memberId, { sectionId: s.sectionId, positionX: 900_000, positionY: 0 });
    const res = await req("PATCH", sectionUrl(productId, s.sectionId), {
      cookie: leader.cookie,
      body: { x: 200_000 },
    });
    expect(res.status).toBe(422);
    expect((await findSection(s.sectionId)).x).toBe(0);
    expect(pos(await findMember(members[0].memberId))).toEqual([900_000, 0]);
  });

  test("変える項目が 1 つも無ければ 422。不正な値も 422", async () => {
    const { productId, leader } = await setupProduct();
    const s = await insertSection(productId);
    const patch = (body: unknown) =>
      req("PATCH", sectionUrl(productId, s.sectionId), { cookie: leader.cookie, body });
    expect((await patch({})).status).toBe(422);
    expect((await patch({ sectionName: "   " })).status).toBe(422);
    expect((await patch({ sectionName: "あ".repeat(51) })).status).toBe(422);
    expect((await patch({ color: "orange" })).status).toBe(422);
    expect((await patch({ width: 0 })).status).toBe(422);
    expect((await patch({ height: -5 })).status).toBe(422);
    expect((await patch({ x: 1_000_001 })).status).toBe(422);
    expect((await patch({ x: "1" })).status).toBe(422);
    expect((await patch({ y: null })).status).toBe(422);
  });

  test("別のプロダクトのセクション・存在しないセクションは 404。何も変わらない", async () => {
    const { productId, leader } = await setupProduct();
    const other = await setupProduct();
    const otherSection = await insertSection(other.productId, { sectionName: "他", x: 1, y: 1 });
    const res = await req("PATCH", sectionUrl(productId, otherSection.sectionId), {
      cookie: leader.cookie,
      body: { sectionName: "乗っ取り", x: 999 },
    });
    expect(res.status).toBe(404);
    const after = await findSection(otherSection.sectionId);
    expect([after.sectionName, after.x]).toEqual(["他", 1]);
    expect(
      (await req("PATCH", sectionUrl(productId, crypto.randomUUID()), { cookie: leader.cookie, body: { color: "blue" } }))
        .status,
    ).toBe(404);
  });
});

describe("DELETE /section/:sectionId(削除)", () => {
  test("204。所属していたメンバーは残り、無所属に戻って、位置は残る", async () => {
    const { productId, leader, members } = await setupProduct();
    const s = await insertSection(productId);
    await setMember(members[0].memberId, { sectionId: s.sectionId, positionX: 12, positionY: 34 });
    const res = await req("DELETE", sectionUrl(productId, s.sectionId), { cookie: leader.cookie });
    expect(res.status).toBe(204);
    expect(await findSection(s.sectionId)).toBeUndefined();
    const member = await findMember(members[0].memberId);
    expect(member.sectionId).toBeNull();
    expect(pos(member)).toEqual([12, 34]);
    const list = await req("GET", sectionUrl(productId), { cookie: leader.cookie });
    expect(await list.json()).toEqual([]);
  });

  test("別のプロダクトのセクション・存在しないセクション・二度目の削除は 404。別のプロダクトのセクションは残る", async () => {
    const { productId, leader } = await setupProduct();
    const other = await setupProduct();
    const otherSection = await insertSection(other.productId);
    expect((await req("DELETE", sectionUrl(productId, otherSection.sectionId), { cookie: leader.cookie })).status).toBe(404);
    expect(await findSection(otherSection.sectionId)).toBeDefined();
    const s = await insertSection(productId);
    expect((await req("DELETE", sectionUrl(productId, s.sectionId), { cookie: leader.cookie })).status).toBe(204);
    expect((await req("DELETE", sectionUrl(productId, s.sectionId), { cookie: leader.cookie })).status).toBe(404);
    expect((await req("DELETE", sectionUrl(productId, crypto.randomUUID()), { cookie: leader.cookie })).status).toBe(404);
  });
});

describe("PATCH /member/:memberId/position(カードの移動)", () => {
  test("位置とセクションを変えられる。応答の形と DB の状態を確認する", async () => {
    const { productId, leader, members } = await setupProduct();
    const s = await insertSection(productId);
    const res = await req("PATCH", positionUrl(productId, members[0].memberId), {
      cookie: leader.cookie,
      body: { positionX: 120.5, positionY: -30, sectionId: s.sectionId },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      productMemberId: members[0].memberId,
      sectionId: s.sectionId,
      positionX: 120.5,
      positionY: -30,
    });
    const member = await findMember(members[0].memberId);
    expect([member.sectionId, member.positionX, member.positionY]).toEqual([s.sectionId, 120.5, -30]);
  });

  test("sectionId を省略すると所属は変わらず、null で無所属に戻る", async () => {
    const { productId, leader, members } = await setupProduct();
    const s = await insertSection(productId);
    await setMember(members[0].memberId, { sectionId: s.sectionId, positionX: 1, positionY: 1 });
    const move = (body: unknown) =>
      req("PATCH", positionUrl(productId, members[0].memberId), { cookie: leader.cookie, body });

    expect((await move({ positionX: 5, positionY: 6 })).status).toBe(200);
    let m = await findMember(members[0].memberId);
    expect([m.sectionId, m.positionX, m.positionY]).toEqual([s.sectionId, 5, 6]);

    const cleared = await move({ positionX: 7, positionY: 8, sectionId: null });
    expect(cleared.status).toBe(200);
    expect(((await cleared.json()) as { sectionId: unknown }).sectionId).toBeNull();
    m = await findMember(members[0].memberId);
    expect([m.sectionId, m.positionX, m.positionY]).toEqual([null, 7, 8]);
  });

  test("別のプロダクトのセクション・存在しないセクションへは入れられない(422)。メンバーは何も変わらない", async () => {
    const { productId, leader, members } = await setupProduct();
    const other = await setupProduct();
    const otherSection = await insertSection(other.productId);
    const own = await insertSection(productId);
    await setMember(members[0].memberId, { sectionId: own.sectionId, positionX: 1, positionY: 2 });
    for (const sectionId of [otherSection.sectionId, crypto.randomUUID()]) {
      const res = await req("PATCH", positionUrl(productId, members[0].memberId), {
        cookie: leader.cookie,
        body: { positionX: 99, positionY: 99, sectionId },
      });
      expect(res.status).toBe(422);
    }
    const m = await findMember(members[0].memberId);
    expect([m.sectionId, m.positionX, m.positionY]).toEqual([own.sectionId, 1, 2]);
  });

  test("別のプロダクトのメンバー・存在しないメンバーは 404。何も変わらない", async () => {
    const { productId, leader } = await setupProduct();
    const other = await setupProduct();
    const foreign = other.members[0].memberId;
    for (const memberId of [foreign, crypto.randomUUID()]) {
      const res = await req("PATCH", positionUrl(productId, memberId), {
        cookie: leader.cookie,
        body: { positionX: 1, positionY: 2 },
      });
      expect(res.status).toBe(404);
    }
    expect(pos(await findMember(foreign))).toEqual([null, null]);
    expect(
      (await req("PATCH", `/api/product/${productId}/member/not-a-uuid/position`, {
        cookie: leader.cookie,
        body: { positionX: 1, positionY: 2 },
      })).status,
    ).toBe(422);
  });

  test("リーダー自身のカードも動かせる", async () => {
    const { productId, leader } = await setupProduct();
    const res = await req("PATCH", positionUrl(productId, leader.memberId), {
      cookie: leader.cookie,
      body: { positionX: 10, positionY: 20 },
    });
    expect(res.status).toBe(200);
    expect(pos(await findMember(leader.memberId))).toEqual([10, 20]);
  });

  test("位置は、必ず x と y の両方を指定する(片方だけは 422)。範囲外・型の誤りも 422。何も変わらない", async () => {
    const { productId, leader, members } = await setupProduct();
    await setMember(members[0].memberId, { positionX: 1, positionY: 2 });
    const move = (body: unknown) =>
      req("PATCH", positionUrl(productId, members[0].memberId), { cookie: leader.cookie, body });
    expect((await move({ positionX: 5 })).status).toBe(422);
    expect((await move({ positionY: 5 })).status).toBe(422);
    expect((await move({})).status).toBe(422);
    expect((await move({ positionX: 1_000_001, positionY: 0 })).status).toBe(422);
    expect((await move({ positionX: 0, positionY: -1_000_001 })).status).toBe(422);
    expect((await move({ positionX: "5", positionY: 5 })).status).toBe(422);
    expect((await move({ positionX: null, positionY: 5 })).status).toBe(422);
    expect((await move({ positionX: 1, positionY: 1, sectionId: "not-a-uuid" })).status).toBe(422);
    expect((await move({ positionX: 1_000_000, positionY: -1_000_000 })).status).toBe(200);
    expect(pos(await findMember(members[0].memberId))).toEqual([1_000_000, -1_000_000]);
  });
});

describe("ツリー取得の応答", () => {
  test("各メンバーに sectionId と位置が入る(所属・位置があるカードと、無いカード)", async () => {
    const { productId, leader, members } = await setupProduct();
    const s = await insertSection(productId);
    await req("PATCH", positionUrl(productId, members[0].memberId), {
      cookie: leader.cookie,
      body: { positionX: 40, positionY: 50, sectionId: s.sectionId },
    });
    const res = await req("GET", `/api/product/${productId}/tree`, { cookie: members[1].cookie });
    expect(res.status).toBe(200);
    const tree = (await res.json()) as {
      leader: { sectionId: string | null; positionX: number | null };
      members: { productMemberId: string; sectionId: string | null; positionX: number | null; positionY: number | null }[];
    };
    const moved = tree.members.find((m) => m.productMemberId === members[0].memberId)!;
    const plain = tree.members.find((m) => m.productMemberId === members[1].memberId)!;
    expect([moved.sectionId, moved.positionX, moved.positionY]).toEqual([s.sectionId, 40, 50]);
    expect([plain.sectionId, plain.positionX, plain.positionY]).toEqual([null, null, null]);
    expect(tree.leader.sectionId).toBeNull();
    expect(tree.leader.positionX).toBeNull();
  });
});
