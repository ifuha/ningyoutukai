import { Elysia } from "elysia";
import type { Me } from "./note-authorize";

/** 文書(Markdown)の、ディレクトリごとの権限。read = 読み取りのみ、write = 読み取りと書き込み */
export type DocumentLevel = "read" | "write";

/**
 * 文書の権限。`documentAuthorize(me)`。仕様は `docs/v4.0/overview.md`。
 * - **リーダーは全権限**(読み取り・書き込み・作成・削除・権限の設定)
 * - リーダー以外は、ディレクトリごとに付けられた権限(`directory_permissions`)。**何も設定していなければ、読み取りのみ**
 * - 権限を渡せる(設定を変える)のは、リーダーだけ。ディレクトリの作成・名前の変更・削除も、リーダーだけ
 * - 書き込みの権限があれば、そのディレクトリの文書の作成・編集・名前の変更・削除ができる
 * `permission` は、ディレクトリの設定の行の値(なければ null)。権限そのものは、DB から読む側(`document-access.ts`)が渡す
 */
export function documentAuthorize(me: Pick<Me, "role">) {
  const levelOf = (permission: DocumentLevel | null | undefined): DocumentLevel =>
    me.role === "leader" ? "write" : (permission ?? "read");
  return {
    /** そのディレクトリでの、実際の権限(リーダーは常に write) */
    levelOf,
    canRead: (_permission?: DocumentLevel | null): boolean => true,
    canWrite: (permission: DocumentLevel | null | undefined): boolean => levelOf(permission) === "write",
    /** ディレクトリの作成・変更・削除、権限の設定、「自動削除しない」の切り替え(リーダーだけ) */
    canManage: (): boolean => me.role === "leader",
  };
}

/** 文書の権限を、ルートから呼べるようにするプラグイン(`note-authorize.ts` と同じ形)。`.use(documentAuthorizer)` で `documentAuthorize` が使える */
export const documentAuthorizer = new Elysia({ name: "document-authorize" }).decorate("documentAuthorize", documentAuthorize);
