import { Elysia } from "elysia";
import { documentStorage, storage } from "./storage";

/**
 * オブジェクトストレージを、ルートから呼べるようにするプラグイン(ミドルウェア)。
 * `.use(objectStorage)` すると、ハンドラで `storage.put(key, body, { contentType })` / `storage.get(key)` / `storage.delete(key)` が使える
 * (`auto-assign-plugin.ts` と同じ形)。保存先は、環境で決まる(Workers は R2、ローカルとテストはフォルダ。`storage.ts`)。
 * ハンドラは、保存先を意識しなくてよい。キーは、ルートが自分で作る(利用者の入力を、そのままキーにしない)。
 */
export const objectStorage = new Elysia({ name: "object-storage" }).decorate("storage", storage);

/**
 * 文書(Markdown)の保存先を、ルートから呼べるようにするプラグイン。`.use(documentObjectStorage)` すると、ハンドラで
 * `documentStorage.put` / `get` / `delete` が使える(`objectStorage` と同じ形。保存先は、アイコン用とは別の非公開バケット)。
 * 文書は、参加者だけが読めればよい。**ログインと権限を確かめてから、api を通して返す**こと(バケットの公開 URL は使わない)。
 */
export const documentObjectStorage = new Elysia({ name: "document-object-storage" }).decorate("documentStorage", documentStorage);
