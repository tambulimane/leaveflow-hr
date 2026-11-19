import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  employeeProfilesTable,
  leavesTable,
  payrollRunsTable,
  payslipsTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth, requireHrOrAdmin } from "../lib/auth";

const router: IRouter = Router();

// List all employees with their compensation profiles
router.get("/payroll/profiles", requireHrOrAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      profile: employeeProfilesTable,
    })
    .from(usersTable)
    .leftJoin(employeeProfilesTable, eq(usersTable.id, employeeProfilesTable.userId))
    .orderBy(usersTable.name);

  res.json(rows);
});

// Get logged-in employee's own salary profile
router.get("/payroll/profiles/me", requireAuth, async (req, res): Promise<void> => {
  const [profile] = await db
    .select()
    .from(employeeProfilesTable)
    .where(eq(employeeProfilesTable.userId, req.session.userId!));

  res.json(profile ?? null);
});

// Create or update an employee's Indian salary structure (inputs in INR rupees, stored in paise)
router.put("/payroll/profiles/:userId", requireHrOrAdmin, async (req, res): Promise<void> => {
  const rawUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const {
    employeeCode,
    department = "General",
    designation = "Associate",
    joiningDate,
    phoneNumber,
    panNumber,
    uanNumber,
    bankName,
    bankAccountNumber,
    ifscCode,
    basicInr = 0,
    hraInr = 0,
    specialAllowanceInr = 0,
    conveyanceInr = 0,
    epfEnabled = true,
    ptEnabled = true,
    monthlyTdsInr = 0,
  } = req.body;

  if (!employeeCode || !joiningDate) {
    res.status(400).json({ error: "Employee code and joining date are required" });
    return;
  }

  const values = {
    userId: rawUserId,
    employeeCode: employeeCode.trim(),
    department: department.trim(),
    designation: designation.trim(),
    joiningDate,
    phoneNumber: phoneNumber?.trim() || null,
    panNumber: panNumber?.trim() || null,
    uanNumber: uanNumber?.trim() || null,
    bankName: bankName?.trim() || null,
    bankAccountNumber: bankAccountNumber?.trim() || null,
    ifscCode: ifscCode?.trim() || null,
    basicPaise: Math.round(Number(basicInr) * 100),
    hraPaise: Math.round(Number(hraInr) * 100),
    specialAllowancePaise: Math.round(Number(specialAllowanceInr) * 100),
    conveyancePaise: Math.round(Number(conveyanceInr) * 100),
    epfEnabled: Boolean(epfEnabled),
    ptEnabled: Boolean(ptEnabled),
    monthlyTdsPaise: Math.round(Number(monthlyTdsInr) * 100),
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select()
    .from(employeeProfilesTable)
    .where(eq(employeeProfilesTable.userId, rawUserId));

  if (existing) {
    const [updated] = await db
      .update(employeeProfilesTable)
      .set(values)
      .where(eq(employeeProfilesTable.userId, rawUserId))
      .returning();
    res.json(updated);
    return;
  }

  const [created] = await db.insert(employeeProfilesTable).values(values).returning();
  res.status(201).json(created);
});

// List all monthly payroll runs
router.get("/payroll/runs", requireHrOrAdmin, async (_req, res): Promise<void> => {
  const runs = await db
    .select()
    .from(payrollRunsTable)
    .orderBy(desc(payrollRunsTable.year), desc(payrollRunsTable.month));

  res.json(
    runs.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      finalizedAt: r.finalizedAt ? r.finalizedAt.toISOString() : null,
    }))
  );
});

// Generate or recalculate a monthly Indian payroll run
router.post("/payroll/runs/generate", requireHrOrAdmin, async (req, res): Promise<void> => {
  const month = Number(req.body.month);
  const year = Number(req.body.year);

  if (!month || month < 1 || month > 12 || !year) {
    res.status(400).json({ error: "Valid month (1-12) and year are required" });
    return;
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const employees = await db
    .select({
      user: usersTable,
      profile: employeeProfilesTable,
    })
    .from(usersTable)
    .innerJoin(employeeProfilesTable, eq(usersTable.id, employeeProfilesTable.userId));

  if (employees.length === 0) {
    res.status(400).json({ error: "No employee salary profiles configured yet" });
    return;
  }

  let [run] = await db
    .select()
    .from(payrollRunsTable)
    .where(and(eq(payrollRunsTable.month, month), eq(payrollRunsTable.year, year)));

  if (run && run.status === "paid") {
    res.status(400).json({ error: "This payroll run is already marked as paid and locked" });
    return;
  }

  if (!run) {
    [run] = await db
      .insert(payrollRunsTable)
      .values({ month, year, status: "draft", generatedBy: req.session.userId! })
      .returning();
  } else {
    await db.delete(payslipsTable).where(eq(payslipsTable.payrollRunId, run.id));
  }

  const approvedLeaves = await db
    .select()
    .from(leavesTable)
    .where(
      and(
        eq(leavesTable.status, "approved"),
        lte(leavesTable.startDate, monthEnd),
        gte(leavesTable.endDate, monthStart)
      )
    );

  let batchGross = 0;
  let batchDeductions = 0;
  let batchNet = 0;
  const createdPayslips = [];

  for (const { user, profile } of employees) {
    const userLeaves = approvedLeaves.filter((l) => l.userId === user.id);

    let paidLeaveDays = 0;
    let lopDays = 0;

    for (const leave of userLeaves) {
      const effectiveStart = leave.startDate < monthStart ? monthStart : leave.startDate;
      const effectiveEnd = leave.endDate > monthEnd ? monthEnd : leave.endDate;
      const startObj = new Date(effectiveStart + "T00:00:00Z");
      const endObj = new Date(effectiveEnd + "T00:00:00Z");
      const overlapDays = Math.max(
        1,
        Math.round((endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24)) + 1
      );

      if (leave.isLossOfPay || leave.leaveType === "unpaid") {
        lopDays += overlapDays;
      } else {
        paidLeaveDays += overlapDays;
      }
    }

    const payableDays = Math.max(0, daysInMonth - lopDays);
    const fullGrossPaise =
      profile.basicPaise +
      profile.hraPaise +
      profile.specialAllowancePaise +
      profile.conveyancePaise;

    const lopDeductionPaise = Math.round((fullGrossPaise * lopDays) / daysInMonth);
    const grossEarningsPaise = fullGrossPaise - lopDeductionPaise;
    const basicEarnedPaise = Math.round((profile.basicPaise * payableDays) / daysInMonth);

    // Indian Statutory EPF: 12% of earned basic (capped at ₹15,000 wage ceiling = 1,500,000 paise)
    const pfWageBase = Math.min(basicEarnedPaise, 1500000);
    const epfEmployeePaise = profile.epfEnabled ? Math.round(pfWageBase * 0.12) : 0;
    const epfEmployerPaise = profile.epfEnabled ? Math.round(pfWageBase * 0.12) : 0;

    // Professional Tax: ₹200/month (20,000 paise) when gross >= ₹15,000
    const professionalTaxPaise =
      profile.ptEnabled && grossEarningsPaise >= 1500000 ? 20000 : 0;

    const tdsPaise = profile.monthlyTdsPaise;
    const totalDeductionsPaise = epfEmployeePaise + professionalTaxPaise + tdsPaise;
    const netPayPaise = Math.max(0, grossEarningsPaise - totalDeductionsPaise);

    batchGross += grossEarningsPaise;
    batchDeductions += totalDeductionsPaise + lopDeductionPaise;
    batchNet += netPayPaise;

    const [slip] = await db
      .insert(payslipsTable)
      .values({
        payrollRunId: run.id,
        userId: user.id,
        totalDaysInMonth: daysInMonth,
        paidLeaveDays: paidLeaveDays.toFixed(1),
        lopDays: lopDays.toFixed(1),
        payableDays: payableDays.toFixed(1),
        basicEarnedPaise,
        hraEarnedPaise: Math.round((profile.hraPaise * payableDays) / daysInMonth),
        specialAllowanceEarnedPaise: Math.round(
          (profile.specialAllowancePaise * payableDays) / daysInMonth
        ),
        conveyanceEarnedPaise: Math.round((profile.conveyancePaise * payableDays) / daysInMonth),
        bonusPaise: 0,
        grossEarningsPaise,
        lopDeductionPaise,
        epfEmployeePaise,
        epfEmployerPaise,
        professionalTaxPaise,
        tdsPaise,
        totalDeductionsPaise,
        netPayPaise,
      })
      .returning();

    createdPayslips.push({ ...slip, userName: user.name, userEmail: user.email });
  }

  const [updatedRun] = await db
    .update(payrollRunsTable)
    .set({
      totalGrossPaise: batchGross,
      totalDeductionsPaise: batchDeductions,
      totalNetPayPaise: batchNet,
    })
    .where(eq(payrollRunsTable.id, run.id))
    .returning();

  res.json({ run: updatedRun, payslips: createdPayslips });
});

// Finalize or mark a payroll run as paid
router.patch("/payroll/runs/:id/status", requireHrOrAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { status } = req.body as { status: "finalized" | "paid" };

  if (status !== "finalized" && status !== "paid") {
    res.status(400).json({ error: "Status must be 'finalized' or 'paid'" });
    return;
  }

  const [updated] = await db
    .update(payrollRunsTable)
    .set({
      status,
      finalizedAt: status === "finalized" ? new Date() : undefined,
    })
    .where(eq(payrollRunsTable.id, rawId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Payroll run not found" });
    return;
  }

  res.json(updated);
});

// Get all payslips for a specific payroll run (HR/Admin)
router.get("/payroll/runs/:id/payslips", requireHrOrAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const slips = await db
    .select({
      payslip: payslipsTable,
      userName: usersTable.name,
      userEmail: usersTable.email,
      profile: employeeProfilesTable,
    })
    .from(payslipsTable)
    .innerJoin(usersTable, eq(payslipsTable.userId, usersTable.id))
    .leftJoin(employeeProfilesTable, eq(payslipsTable.userId, employeeProfilesTable.userId))
    .where(eq(payslipsTable.payrollRunId, rawId));

  res.json(slips);
});

// Get logged-in employee's own payslips
router.get("/payroll/payslips/me", requireAuth, async (req, res): Promise<void> => {
  const slips = await db
    .select({
      payslip: payslipsTable,
      month: payrollRunsTable.month,
      year: payrollRunsTable.year,
      runStatus: payrollRunsTable.status,
    })
    .from(payslipsTable)
    .innerJoin(payrollRunsTable, eq(payslipsTable.payrollRunId, payrollRunsTable.id))
    .where(eq(payslipsTable.userId, req.session.userId!))
    .orderBy(desc(payrollRunsTable.year), desc(payrollRunsTable.month));

  res.json(slips);
});

export default router;
