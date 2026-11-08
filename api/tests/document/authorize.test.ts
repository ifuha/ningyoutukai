import { describe, expect, test } from "bun:test";
import { documentAuthorize } from "../../src/lib/document-authorize";

// 文書の権限: リーダーは全権限。リーダー以外は、ディレクトリごとの設定(なければ読み取りのみ)

describe("documentAuthorize", () => {
  test("リーダーは、設定の有無にかかわらず、全権限(書き込みも、管理も)", () => {
    const can = documentAuthorize({ role: "leader" });
    for (const permission of [null, undefined, "read", "write"] as const) {
      expect(can.levelOf(permission)).toBe("write");
      expect(can.canWrite(permission)).toBe(true);
    }
    expect(can.canManage()).toBe(true);
  });

  test("メンバーは、何も設定していなければ、読み取りのみ", () => {
    const can = documentAuthorize({ role: "member" });
    expect(can.levelOf(null)).toBe("read");
    expect(can.levelOf(undefined)).toBe("read");
    expect(can.canWrite(null)).toBe(false);
    expect(can.canRead(null)).toBe(true);
  });

  test("メンバーは、write を渡されたディレクトリでだけ、書き込める。read の設定は読み取りのまま", () => {
    const can = documentAuthorize({ role: "member" });
    expect(can.canWrite("write")).toBe(true);
    expect(can.canWrite("read")).toBe(false);
  });

  test("管理(ディレクトリの作成・変更・削除、権限の設定、自動削除しない)は、メンバーには write があってもできない", () => {
    expect(documentAuthorize({ role: "member" }).canManage()).toBe(false);
  });
});
