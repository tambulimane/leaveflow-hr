import { Router, type IRouter } from "express";
import {
  db,
  shiftsTable,
  shiftAllocationsTable,
  usersTable,
  employeeProfilesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireApprover } from "../lib/auth";
import { sendShiftNotification } from "../lib/notifier";

const router: IRouter = Router();

// List all shift definitions
router.get("/shifts", requireAuth, async (_req, res): Promise<void> => {
  const shifts = await db.select().from(shiftsTable).orderBy(shiftsTable.startTime);
  res.json(shifts);
});

// Create a new shift template
router.post("/shifts", requireApprover, async (req, res): Promise<void> => {
  const {
    name,
    code,
    startTime,
    endTime,
    graceMinutes = 15,
    weeklyOffs = "Saturday,Sunday",
    isNightShift = false,
  } = req.body;

  if (!name || !code || !startTime || !endTime) {
    res.status(400).json({ error: "Shift name, code, start time, and end time are required" });
    return;
  }

  const [created] = await db
    .insert(shiftsTable)
    .values({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      startTime,
      endTime,
      graceMinutes: Number(graceMinutes),
      weeklyOffs,
      isNightShift: Boolean(isNightShift),
    })
    .returning();

  res.status(201).json(created);
});

// List all shift allocations (HR/Manager/Admin)
router.get("/shifts/allocations", requireApprover, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      allocation: shiftAllocationsTable,
      userName: usersTable.name,
      userEmail: usersTable.email,
      shiftName: shiftsTable.name,
      shiftCode: shiftsTable.code,
      startTime: shiftsTable.startTime,
      endTime: shiftsTable.endTime,
      phoneNumber: employeeProfilesTable.phoneNumber,
    })
    .from(shiftAllocationsTable)
    .innerJoin(usersTable, eq(shiftAllocationsTable.userId, usersTable.id))
    .innerJoin(shiftsTable, eq(shiftAllocationsTable.shiftId, shiftsTable.id))
    .leftJoin(employeeProfilesTable, eq(usersTable.id, employeeProfilesTable.userId))
    .orderBy(desc(shiftAllocationsTable.startDate));

  res.json(rows);
});

// Get logged-in employee's own shift allocations
router.get("/shifts/allocations/me", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      allocation: shiftAllocationsTable,
      shiftName: shiftsTable.name,
      shiftCode: shiftsTable.code,
      startTime: shiftsTable.startTime,
      endTime: shiftsTable.endTime,
      weeklyOffs: shiftsTable.weeklyOffs,
    })
    .from(shiftAllocationsTable)
    .innerJoin(shiftsTable, eq(shiftAllocationsTable.shiftId, shiftsTable.id))
    .where(eq(shiftAllocationsTable.userId, req.session.userId!))
    .orderBy(desc(shiftAllocationsTable.startDate));

  res.json(rows);
});

// Allocate a shift to an employee & send SMS / WhatsApp notification
router.post("/shifts/allocations", requireApprover, async (req, res): Promise<void> => {
  const {
    userId,
    shiftId,
    startDate,
    endDate,
    phoneNumber,
    notificationChannel = "whatsapp",
    notes,
  } = req.body;

  if (!userId || !shiftId || !startDate || !endDate) {
    res.status(400).json({ error: "Employee, shift, start date, and end date are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const [shift] = await db.select().from(shiftsTable).where(eq(shiftsTable.id, shiftId));
  const [profile] = await db
    .select()
    .from(employeeProfilesTable)
    .where(eq(employeeProfilesTable.userId, userId));

  if (!user || !shift) {
    res.status(404).json({ error: "Employee or Shift not found" });
    return;
  }

  const targetPhone = (phoneNumber || profile?.phoneNumber || "").trim();

  // Save phone number back to employee profile if provided
  if (phoneNumber && profile && phoneNumber.trim() !== profile.phoneNumber) {
    await db
      .update(employeeProfilesTable)
      .set({ phoneNumber: phoneNumber.trim() })
      .where(eq(employeeProfilesTable.id, profile.id));
  }

  let notifyResult: { status: "sent" | "logged" | "failed"; sid?: string; detail: string } = {
    status: "logged",
    detail: "No phone number provided",
  };

  if (targetPhone && notificationChannel !== "none") {
    const msg = `Hi ${user.name}, your shift "${shift.name}" (${shift.startTime} - ${shift.endTime}) has been scheduled from ${startDate} to ${endDate}. Weekly Off: ${shift.weeklyOffs}.${notes ? ` Note: ${notes}` : ""} - LeaveFlow HR`;
    notifyResult = await sendShiftNotification({
      toPhone: targetPhone,
      channel: notificationChannel,
      message: msg,
    });
  } else if (notificationChannel !== "none" && !targetPhone) {
    notifyResult = {
      status: "failed",
      detail: "Employee phone number missing — add mobile number to send SMS/WhatsApp",
    };
  }

  const [allocation] = await db
    .insert(shiftAllocationsTable)
    .values({
      userId,
      shiftId,
      startDate,
      endDate,
      notes: notes?.trim() || null,
      notificationChannel,
      notificationStatus: notifyResult.status,
      notificationSid: notifyResult.sid || null,
      allocatedBy: req.session.userId!,
    })
    .returning();

  res.status(201).json({
    allocation,
    notification: notifyResult,
  });
});

export default router;
