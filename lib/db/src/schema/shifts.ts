import { pgTable, text, uuid, timestamp, date, integer, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const shiftsTable = pgTable("shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),               // e.g. "General Shift", "Morning Shift", "Night Shift"
  code: text("code").notNull().unique(),      // e.g. "GEN", "MORN", "NGT"
  startTime: text("start_time").notNull(),    // "09:30" (24h HH:mm)
  endTime: text("end_time").notNull(),        // "18:30"
  graceMinutes: integer("grace_minutes").notNull().default(15),
  weeklyOffs: text("weekly_offs").notNull().default("Saturday,Sunday"),
  isNightShift: boolean("is_night_shift").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shiftAllocationsTable = pgTable("shift_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  shiftId: uuid("shift_id")
    .notNull()
    .references(() => shiftsTable.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  notes: text("notes"),
  notificationChannel: text("notification_channel", {
    enum: ["whatsapp", "sms", "both", "none"],
  })
    .notNull()
    .default("whatsapp"),
  notificationStatus: text("notification_status", {
    enum: ["pending", "sent", "logged", "failed"],
  })
    .notNull()
    .default("pending"),
  notificationSid: text("notification_sid"),
  allocatedBy: uuid("allocated_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Shift = typeof shiftsTable.$inferSelect;
export type ShiftAllocation = typeof shiftAllocationsTable.$inferSelect;
