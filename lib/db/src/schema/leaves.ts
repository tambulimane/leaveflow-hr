import { pgTable, text, uuid, timestamp, date, numeric, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const leavesTable = pgTable("leaves", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  leaveType: text("leave_type", { enum: ["casual", "sick", "earned", "unpaid"] })
    .notNull()
    .default("casual"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  totalDays: numeric("total_days", { precision: 4, scale: 1 }).notNull().default("1.0"),
  isLossOfPay: boolean("is_loss_of_pay").notNull().default(false),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  reviewerComment: text("reviewer_comment"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leaveBalancesTable = pgTable("leave_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  casualTotal: numeric("casual_total", { precision: 4, scale: 1 }).notNull().default("12.0"),
  casualUsed: numeric("casual_used", { precision: 4, scale: 1 }).notNull().default("0.0"),
  sickTotal: numeric("sick_total", { precision: 4, scale: 1 }).notNull().default("8.0"),
  sickUsed: numeric("sick_used", { precision: 4, scale: 1 }).notNull().default("0.0"),
  earnedTotal: numeric("earned_total", { precision: 4, scale: 1 }).notNull().default("15.0"),
  earnedUsed: numeric("earned_used", { precision: 4, scale: 1 }).notNull().default("0.0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLeaveSchema = createInsertSchema(leavesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertLeave = z.infer<typeof insertLeaveSchema>;
export type Leave = typeof leavesTable.$inferSelect;
export type LeaveBalance = typeof leaveBalancesTable.$inferSelect;
