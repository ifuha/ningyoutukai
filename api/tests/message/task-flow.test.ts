import { describe, expect, test } from "bun:test";
import {
  canComment,
  canDeleteMessage,
  canDoAction,
  canEditMessage,
  canViewTask,
  nextStep,
  taskStatuses,
  type Actor,
  type FlowAction,
  type TaskStatus,
} from "../../src/lib/task-flow";

const leader: Actor = { productMemberId: "m1", isLeader: true, isAssignee: false };
const assignee: Actor = { productMemberId: "m2", isLeader: false, isAssignee: true };
const other: Actor = { productMemberId: "m3", isLeader: false, isAssignee: false };

describe("nextStep（状態遷移）", () => {
  test("作業中 → 報告 → 確認待ち（kind は report）", () => {
    expect(nextStep("in_progress", "report")).toEqual({
      ok: true,
      next: "reported",
      kind: "report",
    });
  });

  test("差し戻し中 → 報告 → 確認待ち（kind は resubmit）", () => {
    expect(nextStep("rejected", "report")).toEqual({
      ok: true,
      next: "reported",
      kind: "resubmit",
    });
  });

  test("確認待ち → 承認 → 完了、確認待ち → 差し戻し → 差し戻し中", () => {
    expect(nextStep("reported", "approve")).toEqual({
      ok: true,
      next: "completed",
      kind: "approve",
    });
    expect(nextStep("reported", "reject")).toEqual({
      ok: true,
      next: "rejected",
      kind: "reject",
    });
  });

  test("表にない組み合わせは、すべて拒否される", () => {
    const allowed = new Set([
      "in_progress:report",
      "rejected:report",
      "reported:approve",
      "reported:reject",
    ]);
    const actions: FlowAction[] = ["report", "approve", "reject"];
    for (const status of taskStatuses) {
      for (const action of actions) {
        const expected = allowed.has(`${status}:${action}`);
        expect(nextStep(status as TaskStatus, action).ok).toBe(expected);
      }
    }
  });

  test("完了したタスクは、どの操作も受け付けない", () => {
    expect(nextStep("completed", "report").ok).toBe(false);
    expect(nextStep("completed", "approve").ok).toBe(false);
    expect(nextStep("completed", "reject").ok).toBe(false);
  });
});

describe("操作の権限", () => {
  test("報告は担当者、承認と差し戻しはリーダー", () => {
    expect(canDoAction("report", assignee)).toBe(true);
    expect(canDoAction("report", leader)).toBe(false);
    expect(canDoAction("approve", leader)).toBe(true);
    expect(canDoAction("reject", assignee)).toBe(false);
  });
});

describe("リーダー兼担当者(自分のタスクを自分に割り振ったとき)", () => {
  const both: Actor = { productMemberId: "m1", isLeader: true, isAssignee: true };

  // 現状の挙動を固定する。自分の報告を自分で承認してよいかは、未決定(docs/v2.0/message-feature.md の Q15)。
  // 決まったら、このテストを書き換える
  test("自分で報告して、自分で承認も差し戻しもできる(Q15 が未決定)", () => {
    expect(canDoAction("report", both)).toBe(true);
    expect(canDoAction("approve", both)).toBe(true);
    expect(canDoAction("reject", both)).toBe(true);
  });

  test("コメント・閲覧も、リーダーと担当者の両方の権限で通る", () => {
    expect(canComment(both, "reported")).toBe(true);
    expect(canViewTask(both, { isVisible: false })).toBe(true);
  });
});

describe("未知の status(DB の CHECK で防ぐ想定。コードの現状を固定する)", () => {
  const unknown = "bogus" as unknown as TaskStatus;
  const author = { authorMemberId: "m2", kind: "comment" as const, deletedAt: null };

  test("状態遷移は、どの操作も拒否される", () => {
    for (const action of ["report", "approve", "reject"] as const) {
      expect(nextStep(unknown, action).ok).toBe(false);
    }
  });

  // 「完了ではない」ものとして扱うので、コメントと編集は通る。tasks_status_check があるため、実際には起きない
  test("コメントと編集は、完了ではないものとして扱われる", () => {
    expect(canComment(assignee, unknown)).toBe(true);
    expect(canEditMessage(assignee, author, unknown)).toBe(true);
  });
});

describe("メッセージの削除済みの判定(JSON や DB 経由で型が揺れたとき)", () => {
  const base = { authorMemberId: "m2", kind: "comment" as const };

  test("deletedAt が日時の文字列や空文字なら、削除済みとして編集も削除もできない", () => {
    for (const deletedAt of ["2026-01-01T00:00:00Z", ""]) {
      const message = { ...base, deletedAt: deletedAt as never };
      expect(canEditMessage(assignee, message, "reported")).toBe(false);
      expect(canDeleteMessage(assignee, message, "reported")).toBe(false);
    }
  });

  test("deletedAt が undefined(列の取りこぼし)なら、安全側に倒れて、編集も削除もできない", () => {
    const message = { ...base, deletedAt: undefined as never };
    expect(canEditMessage(assignee, message, "reported")).toBe(false);
    expect(canDeleteMessage(assignee, message, "reported")).toBe(false);
  });
});

describe("閲覧とコメント", () => {
  test("公開タスクは誰でも見られ、非公開はリーダーと担当者だけ", () => {
    expect(canViewTask(other, { isVisible: true })).toBe(true);
    expect(canViewTask(other, { isVisible: false })).toBe(false);
    expect(canViewTask(assignee, { isVisible: false })).toBe(true);
    expect(canViewTask(leader, { isVisible: false })).toBe(true);
  });

  test("コメントを書けるのはリーダーと担当者。完了後は書けない", () => {
    expect(canComment(assignee, "reported")).toBe(true);
    expect(canComment(leader, "rejected")).toBe(true);
    expect(canComment(other, "reported")).toBe(false);
    expect(canComment(leader, "completed")).toBe(false);
  });
});

describe("編集と削除", () => {
  const mine = { authorMemberId: "m2", kind: "comment" as const, deletedAt: null };

  test("編集できるのは自分のメッセージだけ", () => {
    expect(canEditMessage(assignee, mine, "reported")).toBe(true);
    expect(canEditMessage(leader, mine, "reported")).toBe(false);
  });

  test("削除済みのメッセージと、完了後のタスクは、編集も削除もできない", () => {
    const deleted = { ...mine, deletedAt: new Date() };
    expect(canEditMessage(assignee, deleted, "reported")).toBe(false);
    expect(canDeleteMessage(assignee, deleted, "reported")).toBe(false);
    expect(canEditMessage(assignee, mine, "completed")).toBe(false);
    expect(canDeleteMessage(assignee, mine, "completed")).toBe(false);
  });

  test("コメントは、本人とリーダーが削除できる。ほかの人はできない", () => {
    expect(canDeleteMessage(assignee, mine, "reported")).toBe(true);
    expect(canDeleteMessage(leader, mine, "reported")).toBe(true);
    expect(canDeleteMessage(other, mine, "reported")).toBe(false);
  });

  test("報告・差し戻しなどの履歴は、本人でもリーダーでも削除できない（編集は本人だけ可）", () => {
    const report = { authorMemberId: "m2", kind: "report" as const, deletedAt: null };
    expect(canDeleteMessage(assignee, report, "reported")).toBe(false);
    expect(canDeleteMessage(leader, report, "reported")).toBe(false);
    expect(canEditMessage(assignee, report, "reported")).toBe(true);
  });
});