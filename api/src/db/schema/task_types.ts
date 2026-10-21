
import { snakeCase, text, unique, uuid } from "drizzle-orm/pg-core";
import { products } from "./products";

export const taskTypes = snakeCase.table(
  "task_types",
  {
    taskTypeId: uuid().primaryKey().defaultRandom(),
    taskTypeName: text().notNull(),
    productId: uuid()
      .notNull()
      .references(() => products.productId, { onDelete: "cascade" }),
  },
  // 同じプロダクト内で種類名が重複しない
  (t) => [unique().on(t.productId, t.taskTypeName)]
);

