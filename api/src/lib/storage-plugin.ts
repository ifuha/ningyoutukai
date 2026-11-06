import { Elysia } from "elysia";
import { storage } from "./storage";

/**
 * オブジェクトストレージを、ルートから呼べるようにするプラグイン(ミドルウェア)。
 * `.use(objectStorage)` すると、ハンドラで `storage.put(key, body, { contentType })` / `storage.get(key)` / `storage.delete(key)` が使える
 * (`auto-assign-plugin.ts` と同じ形)。保存先は、環境で決まる(Workers は R2、ローカルとテストはフォルダ。`storage.ts`)。
 * ハンドラは、保存先を意識しなくてよい。キーは、ルートが自分で作る(利用者の入力を、そのままキーにしない)。
 */
export const objectStorage = new Elysia({ name: "object-storage" }).decorate("storage", storage);
