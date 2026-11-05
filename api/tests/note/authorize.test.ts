import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { authorize, noteAuthorize } from "../../src/lib/note-authorize";

const owner = { userId: "u-owner", role: "member" as const };
const other = { userId: "u-other", role: "member" as const };
const leader = { userId: "u-leader", role: "leader" as const };

describe("authorize(me).canEdit(note)", () => {
  test("作成者本人は変更できる(メンバーでも、リーダーでも)", () => {
    expect(authorize(owner).canEdit({ createdBy: owner.userId })).toBe(true);
    expect(authorize(leader).canEdit({ createdBy: leader.userId })).toBe(true);
  });

  test("他の人のメモは変更できない。リーダーでも同じ", () => {
    expect(authorize(other).canEdit({ createdBy: owner.userId })).toBe(false);
    expect(authorize(leader).canEdit({ createdBy: owner.userId })).toBe(false);
  });

  test("作成者が NULL のメモは、リーダーだけが変更できる", () => {
    expect(authorize(leader).canEdit({ createdBy: null })).toBe(true);
    expect(authorize(other).canEdit({ createdBy: null })).toBe(false);
  });
});

describe("noteAuthorize プラグイン", () => {
  test(".use(noteAuthorize) すると、ハンドラで authorize(me) が使える", async () => {
    const app = new Elysia().use(noteAuthorize).get("/t", ({ authorize }) => ({
      mine: authorize(owner).canEdit({ createdBy: owner.userId }),
      theirs: authorize(other).canEdit({ createdBy: owner.userId }),
    }));
    const res = await app.handle(new Request("http://localhost/t"));
    expect(await res.json()).toEqual({ mine: true, theirs: false });
  });
});
