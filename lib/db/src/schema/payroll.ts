import { pgTable, text, uuid, timestamp, date, integer, boolean, numeric } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Employee HR & Indian Statutory Compensation Structure (amounts in paise: ₹1 = 100 paise)
export const employeeProfilesTable = pgTable("employee_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  employeeCode: text("employee_code").notNull().unique(),
  department: text("department").notNull().default("General"),
  designation: text("designation").notNull().default("Associate"),
  joiningDate: date("joining_date").notNull(),
  phoneNumber: text("phone_number"), // E.164 format e.g. +919876543210
  panNumber: text("pan_number"),
  uanNumber: text("uan_number"),
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  ifscCode: text("ifsc_code"),
  // Monthly salary components in paise
  basicPaise: integer("basic_paise").notNull().default(0),
  hraPaise: integer("hra_paise").notNull().default(0),
  specialAllowancePaise: integer("special_allowance_paise").notNull().default(0),
  conveyancePaise: integer("conveyance_paise").notNull().default(0),
  // Statutory flags & monthly TDS
  epfEnabled: boolean("epf_enabled").notNull().default(true), // 12% of Basic (capped at ₹15,000 wage ceiling or actual)
  ptEnabled: boolean("pt_enabled").notNull().default(true),   // Professional Tax (e.g., ₹200/month in Karnataka/Maharashtra)
  monthlyTdsPaise: integer("monthly_tds_paise").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Monthly Payroll Batch Header
export const payrollRunsTable = pgTable("payroll_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  month: integer("month").notNull(), // 1 - 12
  year: integer("year").notNull(),   // e.g. 2026
  status: text("status", { enum: ["draft", "finalized", "paid"] }).notNull().default("draft"),
  totalGrossPaise: integer("total_gross_paise").notNull().default(0),
  totalDeductionsPaise: integer("total_deductions_paise").notNull().default(0),
  totalNetPayPaise: integer("total_net_pay_paise").notNull().default(0),
  generatedBy: uuid("generated_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
});

// Individual Employee Monthly Payslip
export const payslipsTable = pgTable("payslips", {
  id: uuid("id").primaryKey().defaultRandom(),
  payrollRunId: uuid("payroll_run_id")
    .notNull()
    .references(() => payrollRunsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  totalDaysInMonth: integer("total_days_in_month").notNull(),
  paidLeaveDays: numeric("paid_leave_days", { precision: 4, scale: 1 }).notNull().default("0.0"),
  lopDays: numeric("lop_days", { precision: 4, scale: 1 }).notNull().default("0.0"),
  payableDays: numeric("payable_days", { precision: 4, scale: 1 }).notNull(),
  // Earnings (paise)
  basicEarnedPaise: integer("basic_earned_paise").notNull(),
  hraEarnedPaise: integer("hra_earned_paise").notNull(),
  specialAllowanceEarnedPaise: integer("special_allowance_earned_paise").notNull(),
  conveyanceEarnedPaise: integer("conveyance_earned_paise").notNull(),
  bonusPaise: integer("bonus_paise").notNull().default(0),
  grossEarningsPaise: integer("gross_earnings_paise").notNull(),
  // Deductions (paise)
  lopDeductionPaise: integer("lop_deduction_paise").notNull().default(0),
  epfEmployeePaise: integer("epf_employee_paise").notNull().default(0),
  epfEmployerPaise: integer("epf_employer_paise").notNull().default(0),
  professionalTaxPaise: integer("professional_tax_paise").notNull().default(0),
  tdsPaise: integer("tds_paise").notNull().default(0),
  totalDeductionsPaise: integer("total_deductions_paise").notNull(),
  // Net Take-Home (paise)
  netPayPaise: integer("net_pay_paise").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmployeeProfile = typeof employeeProfilesTable.$inferSelect;
export type PayrollRun = typeof payrollRunsTable.$inferSelect;
export type Payslip = typeof payslipsTable.$inferSelect;
