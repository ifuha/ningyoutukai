import { Elysia } from "elysia";
import { apply, suggest } from "./assign-service";

/**
 * 自動割り振りを、ルートから呼べるようにするプラグイン(ミドルウェア)。
 * `.use(autoAssign)` すると、ハンドラで `autoAssign.suggest(...)` / `autoAssign.apply(...)` が使える。
 * 担当を付け替えたあとの処理(通知・カレンダー)は、`assign-hooks.ts` に登録して足す。
 * 割り振りの本体(`assign-service.ts`)は、このプラグインを通さなくても呼べる(CLI 以外の入口を足すときのため)。
 */
export const autoAssign = new Elysia({ name: "auto-assign" }).decorate("autoAssign", {
  suggest,
  apply,
});
