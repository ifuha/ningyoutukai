import { relations } from "drizzle-orm/_relations";
import { productInvitations } from "./product_invitations";
import { productMembers } from "./product_members";
import { products } from "./products";
import { sections } from "./sections";
import { taskTypes } from "./task_types";
import { tasks } from "./tasks";
import { users } from "./users";

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(productMembers),
  invitations: many(productInvitations),
}));

export const productsRelations = relations(products, ({ many }) => ({
  members: many(productMembers),
  sections: many(sections),
  taskTypes: many(taskTypes),
  invitations: many(productInvitations),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  product: one(products, {
    fields: [sections.productId],
    references: [products.productId],
  }),
  members: many(productMembers),
}));

export const productMembersRelations = relations(productMembers, ({ one, many }) => ({
  product: one(products, {
    fields: [productMembers.productId],
    references: [products.productId],
  }),
  user: one(users, {
    fields: [productMembers.userId],
    references: [users.userId],
  }),
  section: one(sections, {
    fields: [productMembers.sectionId],
    references: [sections.sectionId],
  }),
  tasks: many(tasks),
}));

export const productInvitationsRelations = relations(productInvitations, ({ one }) => ({
  product: one(products, {
    fields: [productInvitations.productId],
    references: [products.productId],
  }),
  user: one(users, {
    fields: [productInvitations.userId],
    references: [users.userId],
  }),
}));

export const taskTypesRelations = relations(taskTypes, ({ one, many }) => ({
  product: one(products, {
    fields: [taskTypes.productId],
    references: [products.productId],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  member: one(productMembers, {
    fields: [tasks.productMemberId],
    references: [productMembers.productMemberId],
  }),
  type: one(taskTypes, {
    fields: [tasks.taskTypeId],
    references: [taskTypes.taskTypeId],
  }),
}));