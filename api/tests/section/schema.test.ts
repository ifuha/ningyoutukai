import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { productMembers, products, sections } from "../../src/db/schema";
import { sectionColors } from "../../src/lib/section";
import { cleanup, setupProduct } from "../task/helpers";

/**
 * sections と product_members.section_id の、DB の制約のテスト(F1 のテーブルだけ。ルートはまだ無い)。
 * 「同じプロダクトのセクションにしか入れられない」は、DB では守らない(API で検証する。末尾のテストで固定)。
 */

afterAll(cleanup);

const ZERO = "00000000-0000-0000-0000-000000000000";
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

/** Postgres のエラーコード(drizzle は、元のエラーを cause に入れて包む) */
async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    return err.cause?.code ?? err.code ?? "unknown";
  }
  return undefined;
}

const insertSection = (productId: string, sectionName: string, color: string = "blue") =>
  db
    .insert(sections)
    .values({ productId, sectionName, color: color as never })
    .returning();

const findMember = async (productMemberId: string) =>
  (await db.select().from(productMembers).where(eq(productMembers.productMemberId, productMemberId)))[0];

describe("sections", () => {
  test("色の一覧は、Figma の section-* と同じ 6 色", () => {
    expect([...sectionColors]).toEqual(["red", "yellow", "green", "purple", "lightblue", "blue"]);
  });

  test("6 色すべてが入る。作成日時は自動で入る", async () => {
    const { productId } = await setupProduct();
    for (const color of sectionColors) {
      const [row] = await insertSection(productId, `色-${color}`, color);
      expect(row.color).toBe(color);
      expect(row.createdAt).toBeInstanceOf(Date);
    }
  });

  test("不正な色は、CHECK で拒否される(存在しない色、空文字、大文字)", async () => {
    const { productId } = await setupProduct();
    for (const color of ["pink", "", "Red"]) {
      expect(await pgCode(() => insertSection(productId, `不正-${color}`, color))).toBe(CHECK_VIOLATION);
    }
  });

  test("色の更新でも、不正な値は拒否される", async () => {
    const { productId } = await setupProduct();
    const [row] = await insertSection(productId, "更新");
    const code = await pgCode(() =>
      db.update(sections).set({ color: "pink" as never }).where(eq(sections.sectionId, row.sectionId))
    );
    expect(code).toBe(CHECK_VIOLATION);
  });

  test("同じプロダクトで、同じ名前は拒否される", async () => {
    const { productId } = await setupProduct();
    await insertSection(productId, "デザイン", "red");
    expect(await pgCode(() => insertSection(productId, "デザイン", "green"))).toBe(UNIQUE_VIOLATION);
  });

  test("別のプロダクトなら、同じ名前でも入る", async () => {
    const a = await setupProduct();
    const b = await setupProduct();
    await insertSection(a.productId, "デザイン");
    const [row] = await insertSection(b.productId, "デザイン");
    expect(row.productId).toBe(b.productId);
  });

  test("名前の重複は、大文字小文字や前後の空白を区別する(DB は文字列どおりに比べる。正規化は API で行う)", async () => {
    const { productId } = await setupProduct();
    await insertSection(productId, "Design");
    await insertSection(productId, "design");
    await insertSection(productId, "Design ");
    const rows = await db.select().from(sections).where(eq(sections.productId, productId));
    expect(rows).toHaveLength(3);
  });

  test("存在しない product_id は、外部キーで拒否される", async () => {
    expect(await pgCode(() => insertSection(ZERO, "迷子"))).toBe(FOREIGN_KEY_VIOLATION);
  });

  test("名前と色は NOT NULL", async () => {
    const { productId } = await setupProduct();
    const noName = await pgCode(() => db.insert(sections).values({ productId, color: "red" } as never));
    const noColor = await pgCode(() => db.insert(sections).values({ productId, sectionName: "色なし" } as never));
    expect(noName).toBe("23502");
    expect(noColor).toBe("23502");
  });

  test("プロダクトを消すと、そのセクションも消える(別のプロダクトのものは残る)", async () => {
    const a = await setupProduct();
    const b = await setupProduct();
    await insertSection(a.productId, "消える");
    await insertSection(b.productId, "残る");

    await db.delete(products).where(eq(products.productId, a.productId));
    expect(await db.select().from(sections).where(eq(sections.productId, a.productId))).toHaveLength(0);
    expect(await db.select().from(sections).where(eq(sections.productId, b.productId))).toHaveLength(1);
  });
});

describe("sections の位置と大きさ", () => {
  const insertGeometry = (productId: string, name: string, g: Partial<{ x: number; y: number; width: number; height: number }>) =>
    db.insert(sections).values({ productId, sectionName: name, color: "red", ...g }).returning();

  test("指定しなければ、大きさは 300×400、位置は (0, 0)(Figma の section-* と同じ大きさ)", async () => {
    const { productId } = await setupProduct();
    const [row] = await insertSection(productId, "既定");
    expect([row.x, row.y, row.width, row.height]).toEqual([0, 0, 300, 400]);
  });

  test("位置と大きさは、小数も負の座標もそのまま往復する", async () => {
    const { productId } = await setupProduct();
    const [row] = await insertGeometry(productId, "往復", { x: -120.5, y: 33.25, width: 512.75, height: 0.5 });
    const [read] = await db.select().from(sections).where(eq(sections.sectionId, row.sectionId));
    expect([read.x, read.y, read.width, read.height]).toEqual([-120.5, 33.25, 512.75, 0.5]);
  });

  test("位置と大きさは、あとから更新できる(動かす・大きさを変える)", async () => {
    const { productId } = await setupProduct();
    const [row] = await insertSection(productId, "更新");
    await db.update(sections).set({ x: 10, y: 20, width: 640, height: 480 }).where(eq(sections.sectionId, row.sectionId));
    const [read] = await db.select().from(sections).where(eq(sections.sectionId, row.sectionId));
    expect([read.x, read.y, read.width, read.height]).toEqual([10, 20, 640, 480]);
  });

  test("width と height が 0 以下だと、CHECK で拒否される(0、負、片方だけ)", async () => {
    const { productId } = await setupProduct();
    const cases = [
      { width: 0 }, { height: 0 }, { width: -1 }, { height: -300 }, { width: 0, height: 0 }, { width: 300, height: -0.001 },
    ];
    for (const [i, g] of cases.entries()) {
      expect(await pgCode(() => insertGeometry(productId, `不正-${i}`, g))).toBe(CHECK_VIOLATION);
    }
  });

  test("更新で 0 以下にしようとしても拒否され、元の値が残る", async () => {
    const { productId } = await setupProduct();
    const [row] = await insertSection(productId, "守る");
    const code = await pgCode(() => db.update(sections).set({ width: 0 }).where(eq(sections.sectionId, row.sectionId)));
    expect(code).toBe(CHECK_VIOLATION);
    const [read] = await db.select().from(sections).where(eq(sections.sectionId, row.sectionId));
    expect(read.width).toBe(300);
  });

  test("ごく小さい正の大きさは通る(境界: 0 は拒否、0 より大きければ通る)", async () => {
    const { productId } = await setupProduct();
    const [row] = await insertGeometry(productId, "最小", { width: Number.MIN_VALUE, height: 1e-300 });
    expect(row.width).toBeGreaterThan(0);
  });

  test("NaN と Infinity は、座標にも大きさにもならない(NaN は > 0 を通ってしまうので、別の CHECK で拒否する)", async () => {
    const { productId } = await setupProduct();
    const bad = [
      { x: Number.NaN }, { y: Number.NaN }, { width: Number.NaN }, { height: Number.NaN },
      { x: Infinity }, { x: -Infinity }, { y: Infinity }, { width: Infinity }, { height: Infinity },
    ];
    for (const [i, g] of bad.entries()) {
      expect(await pgCode(() => insertGeometry(productId, `非有限-${i}`, g))).toBe(CHECK_VIOLATION);
    }
  });

  test("位置と大きさは NULL にできない", async () => {
    const { productId } = await setupProduct();
    for (const col of ["x", "y", "width", "height"]) {
      const code = await pgCode(() => db.insert(sections).values({ productId, sectionName: `null-${col}`, color: "red", [col]: null } as never));
      expect(code).toBe("23502");
    }
  });
});

describe("product_members.section_id", () => {
  test("既定は NULL(無所属)", async () => {
    const { members, leader } = await setupProduct();
    expect((await findMember(members[0].memberId)).sectionId).toBeNull();
    expect((await findMember(leader.memberId)).sectionId).toBeNull();
  });

  describe("カードの自由な位置(position_x / position_y)", () => {
    const setPosition = (memberId: string, positionX: number | null, positionY: number | null) =>
      db.update(productMembers).set({ positionX, positionY }).where(eq(productMembers.productMemberId, memberId));

    test("既存の行(位置なし)は壊れない。両方 NULL = 自動配置", async () => {
      const { members, leader } = await setupProduct();
      for (const m of [leader, ...members]) {
        const row = await findMember(m.memberId);
        expect(row.positionX).toBeNull();
        expect(row.positionY).toBeNull();
      }
    });

    test("両方 NOT NULL なら通り、小数も負の座標もそのまま往復する", async () => {
      const { members } = await setupProduct();
      await setPosition(members[0].memberId, -250.75, 1024.5);
      const row = await findMember(members[0].memberId);
      expect([row.positionX, row.positionY]).toEqual([-250.75, 1024.5]);
    });

    test("(0, 0) は有効な位置で、NULL(自動配置)とは区別される", async () => {
      const { members } = await setupProduct();
      await setPosition(members[0].memberId, 0, 0);
      const row = await findMember(members[0].memberId);
      expect([row.positionX, row.positionY]).toEqual([0, 0]);
    });

    test("両方 NULL に戻せる(自動配置に戻す)", async () => {
      const { members } = await setupProduct();
      await setPosition(members[0].memberId, 10, 20);
      await setPosition(members[0].memberId, null, null);
      const row = await findMember(members[0].memberId);
      expect([row.positionX, row.positionY]).toEqual([null, null]);
    });

    test("position_x だけ NULL、position_y だけ NULL は、CHECK で拒否され、元の値が残る", async () => {
      const { members } = await setupProduct();
      await setPosition(members[0].memberId, 10, 20);
      expect(await pgCode(() => setPosition(members[0].memberId, null, 20))).toBe(CHECK_VIOLATION);
      expect(await pgCode(() => setPosition(members[0].memberId, 10, null))).toBe(CHECK_VIOLATION);
      // 位置なしの行に、片方だけ入れるのも拒否される
      expect(await pgCode(() => setPosition(members[1].memberId, 5, null))).toBe(CHECK_VIOLATION);
      expect(await pgCode(() => setPosition(members[1].memberId, null, 5))).toBe(CHECK_VIOLATION);
      const row = await findMember(members[0].memberId);
      expect([row.positionX, row.positionY]).toEqual([10, 20]);
      expect((await findMember(members[1].memberId)).positionX).toBeNull();
    });

    test("NaN と Infinity は、位置にならない", async () => {
      const { members } = await setupProduct();
      for (const [x, y] of [[Number.NaN, 0], [0, Number.NaN], [Infinity, 0], [0, -Infinity], [Number.NaN, Number.NaN]]) {
        expect(await pgCode(() => setPosition(members[0].memberId, x, y))).toBe(CHECK_VIOLATION);
      }
      expect((await findMember(members[0].memberId)).positionX).toBeNull();
    });

    test("位置を持っていても、セクションを消すと section_id だけ NULL に戻り、位置は残る", async () => {
      const { productId, members } = await setupProduct();
      const [section] = await insertSection(productId, "位置あり");
      await db.update(productMembers).set({ sectionId: section.sectionId, positionX: 50, positionY: 60 }).where(eq(productMembers.productMemberId, members[0].memberId));
      await db.delete(sections).where(eq(sections.sectionId, section.sectionId));
      const row = await findMember(members[0].memberId);
      expect(row.sectionId).toBeNull();
      expect([row.positionX, row.positionY]).toEqual([50, 60]);
    });
  });

  test("セクションに入れられる。リーダーも入れる", async () => {
    const { productId, members, leader } = await setupProduct();
    const [section] = await insertSection(productId, "開発");
    await db.update(productMembers).set({ sectionId: section.sectionId }).where(eq(productMembers.productMemberId, members[0].memberId));
    await db.update(productMembers).set({ sectionId: section.sectionId }).where(eq(productMembers.productMemberId, leader.memberId));
    expect((await findMember(members[0].memberId)).sectionId).toBe(section.sectionId);
    expect((await findMember(leader.memberId)).sectionId).toBe(section.sectionId);
  });

  test("1 人のメンバーは、1 つのセクションだけ(付け替えると前のセクションから外れる)", async () => {
    const { productId, members } = await setupProduct();
    const [s1] = await insertSection(productId, "A");
    const [s2] = await insertSection(productId, "B");
    const set = (sectionId: string | null) =>
      db.update(productMembers).set({ sectionId }).where(eq(productMembers.productMemberId, members[0].memberId));
    await set(s1.sectionId);
    await set(s2.sectionId);
    expect((await findMember(members[0].memberId)).sectionId).toBe(s2.sectionId);
    await set(null); // 無所属に戻せる
    expect((await findMember(members[0].memberId)).sectionId).toBeNull();
  });

  test("存在しない section_id は、外部キーで拒否される", async () => {
    const { members } = await setupProduct();
    const code = await pgCode(() =>
      db.update(productMembers).set({ sectionId: ZERO }).where(eq(productMembers.productMemberId, members[0].memberId))
    );
    expect(code).toBe(FOREIGN_KEY_VIOLATION);
    expect((await findMember(members[0].memberId)).sectionId).toBeNull();
  });

  test("セクションを消すと、中のメンバーは無所属(NULL)に戻り、メンバー自体は残る", async () => {
    const { productId, members } = await setupProduct();
    const [section] = await insertSection(productId, "消える");
    for (const m of members) {
      await db.update(productMembers).set({ sectionId: section.sectionId }).where(eq(productMembers.productMemberId, m.memberId));
    }

    await db.delete(sections).where(eq(sections.sectionId, section.sectionId));
    for (const m of members) {
      const row = await findMember(m.memberId);
      expect(row).toBeDefined(); // メンバーは残る
      expect(row.sectionId).toBeNull();
      expect(row.productId).toBe(productId);
    }
  });

  test("セクションを消しても、別のセクションのメンバーは変わらない", async () => {
    const { productId, members } = await setupProduct();
    const [gone] = await insertSection(productId, "消える");
    const [kept] = await insertSection(productId, "残る");
    await db.update(productMembers).set({ sectionId: gone.sectionId }).where(eq(productMembers.productMemberId, members[0].memberId));
    await db.update(productMembers).set({ sectionId: kept.sectionId }).where(eq(productMembers.productMemberId, members[1].memberId));

    await db.delete(sections).where(eq(sections.sectionId, gone.sectionId));
    expect((await findMember(members[0].memberId)).sectionId).toBeNull();
    expect((await findMember(members[1].memberId)).sectionId).toBe(kept.sectionId);
  });

  test("メンバーを消しても、セクションは残る", async () => {
    const { productId, members } = await setupProduct();
    const [section] = await insertSection(productId, "残る");
    await db.update(productMembers).set({ sectionId: section.sectionId }).where(eq(productMembers.productMemberId, members[0].memberId));

    await db.delete(productMembers).where(eq(productMembers.productMemberId, members[0].memberId));
    expect(await db.select().from(sections).where(eq(sections.sectionId, section.sectionId))).toHaveLength(1);
  });

  test("プロダクトを消すと、セクションとメンバーの両方が消える(外部キーの循環で止まらない)", async () => {
    const { productId, members } = await setupProduct();
    const [section] = await insertSection(productId, "どちらも消える");
    await db.update(productMembers).set({ sectionId: section.sectionId }).where(eq(productMembers.productMemberId, members[0].memberId));

    await db.delete(products).where(eq(products.productId, productId));
    expect(await db.select().from(sections).where(eq(sections.productId, productId))).toHaveLength(0);
    expect(await db.select().from(productMembers).where(eq(productMembers.productId, productId))).toHaveLength(0);
  });

  test("section_id の索引がある(セクションを消したときの SET NULL が全件走査にならない)", async () => {
    const rows = await db.$client.query(
      "select indexname from pg_indexes where tablename = 'product_members' and indexname = 'product_members_section_idx'"
    );
    expect(rows.rowCount).toBe(1);
  });

  // 現状の固定: DB は、カードの位置と section_id の食い違いを見ない。
  // 「セクションの中に置いたら section_id が入る」「外に出したら外れる」は、API の責任(ルートを作るときの必須事項)
  test("【現状の固定】位置と section_id の食い違い(セクションの外の位置で所属している、位置なしで所属している)を、DB は通す", async () => {
    const { productId, members } = await setupProduct();
    const [section] = await db
      .insert(sections)
      .values({ productId, sectionName: "食い違い", color: "red", x: 0, y: 0, width: 300, height: 400 })
      .returning();
    // セクション(0,0 〜 300,400)から遠く離れた位置で、そのセクションに所属している
    await db.update(productMembers).set({ sectionId: section.sectionId, positionX: 9999, positionY: 9999 }).where(eq(productMembers.productMemberId, members[0].memberId));
    // 位置なし(自動配置)のまま所属している
    await db.update(productMembers).set({ sectionId: section.sectionId }).where(eq(productMembers.productMemberId, members[1].memberId));
    expect((await findMember(members[0].memberId)).sectionId).toBe(section.sectionId);
    expect((await findMember(members[1].memberId)).positionX).toBeNull();
    expect((await findMember(members[1].memberId)).sectionId).toBe(section.sectionId);
  });

  // 現状の固定: DB は、別のプロダクトのセクションにも入れてしまう。
  // 複合外部キーだと ON DELETE SET NULL が列指定になり、drizzle で表せないため、DB では守らない。
  // **API で「メンバーとセクションが同じプロダクトか」を必ず検証すること**(ルートを作るときの必須事項)
  test("【現状の固定】別のプロダクトのセクションにも、DB は入れてしまう(API で検証が必須)", async () => {
    const a = await setupProduct();
    const b = await setupProduct();
    const [sectionOfB] = await insertSection(b.productId, "別のプロダクト");

    const code = await pgCode(() =>
      db.update(productMembers).set({ sectionId: sectionOfB.sectionId }).where(eq(productMembers.productMemberId, a.members[0].memberId))
    );
    expect(code).toBeUndefined(); // DB は通す
    expect((await findMember(a.members[0].memberId)).sectionId).toBe(sectionOfB.sectionId);
  });
});
