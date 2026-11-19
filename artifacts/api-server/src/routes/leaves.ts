import { Router, type IRouter } from "express";
import { db, leavesTable, leaveBalancesTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { requireAuth, requireApprover } from "../lib/auth";

const router: IRouter = Router();

function calculateInclusiveDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

async function getOrCreateBalance(userId: string, year: number) {
  const [existing] = await db
    .select()
    .from(leaveBalancesTable)
    .where(and(eq(leaveBalancesTable.userId, userId), eq(leaveBalancesTable.year, year)));

  if (existing) return existing;

  const [created] = await db
    .insert(leaveBalancesTable)
    .values({ userId, year })
    .returning();
  return created;
}

// Get current user's leave balance for the year
router.get("/leaves/balances", requireAuth, async (req, res): Promise<void> => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const balance = await getOrCreateBalance(req.session.userId!, year);
  res.json(balance);
});

// Get logged-in user's own leaves
router.get("/leaves", requireAuth, async (req, res): Promise<void> => {
  const leaves = await db
    .select({
      id: leavesTable.id,
      userId: leavesTable.userId,
      leaveType: leavesTable.leaveType,
      startDate: leavesTable.startDate,
      endDate: leavesTable.endDate,
      totalDays: leavesTable.totalDays,
      isLossOfPay: leavesTable.isLossOfPay,
      reason: leavesTable.reason,
      status: leavesTable.status,
      reviewerComment: leavesTable.reviewerComment,
      reviewedAt: leavesTable.reviewedAt,
      createdAt: leavesTable.createdAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(leavesTable)
    .innerJoin(usersTable, eq(leavesTable.userId, usersTable.id))
    .where(eq(leavesTable.userId, req.session.userId!))
    .orderBy(desc(leavesTable.startDate));

  res.json(
    leaves.map((l) => ({
      ...l,
      reviewedAt: l.reviewedAt ? l.reviewedAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
    }))
  );
});

// Get all team leaves (filterable by ?status=pending|approved|rejected)
router.get("/leaves/all", requireAuth, async (req, res): Promise<void> => {
  const statusFilter = req.query.status as "pending" | "approved" | "rejected" | undefined;

  const query = db
    .select({
      id: leavesTable.id,
      userId: leavesTable.userId,
      leaveType: leavesTable.leaveType,
      startDate: leavesTable.startDate,
      endDate: leavesTable.endDate,
      totalDays: leavesTable.totalDays,
      isLossOfPay: leavesTable.isLossOfPay,
      reason: leavesTable.reason,
      status: leavesTable.status,
      reviewerComment: leavesTable.reviewerComment,
      reviewedAt: leavesTable.reviewedAt,
      createdAt: leavesTable.createdAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(leavesTable)
    .innerJoin(usersTable, eq(leavesTable.userId, usersTable.id));

  const leaves = statusFilter
    ? await query.where(eq(leavesTable.status, statusFilter)).orderBy(desc(leavesTable.createdAt))
    : await query.orderBy(desc(leavesTable.startDate));

  res.json(
    leaves.map((l) => ({
      ...l,
      reviewedAt: l.reviewedAt ? l.reviewedAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
    }))
  );
});

// Apply for leave (automatically flags Loss of Pay if quota is exceeded or type is 'unpaid')
router.post("/leaves", requireAuth, async (req, res): Promise<void> => {
  const { startDate, endDate, reason, leaveType = "casual", totalDays: customDays } = req.body;

  if (!startDate || !endDate || !reason) {
    res.status(400).json({ error: "Start date, end date, and reason are required" });
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    res.status(400).json({ error: "Start date must be before or equal to end date" });
    return;
  }

  const days = customDays ? Number(customDays) : calculateInclusiveDays(startDate, endDate);
  const year = new Date(startDate).getFullYear();
  const balance = await getOrCreateBalance(req.session.userId!, year);

  let isLossOfPay = leaveType === "unpaid";
  if (leaveType === "casual") {
    const remaining = Number(balance.casualTotal) - Number(balance.casualUsed);
    if (days > remaining) isLossOfPay = true;
  } else if (leaveType === "sick") {
    const remaining = Number(balance.sickTotal) - Number(balance.sickUsed);
    if (days > remaining) isLossOfPay = true;
  } else if (leaveType === "earned") {
    const remaining = Number(balance.earnedTotal) - Number(balance.earnedUsed);
    if (days > remaining) isLossOfPay = true;
  }

  const [leave] = await db
    .insert(leavesTable)
    .values({
      userId: req.session.userId!,
      leaveType,
      startDate,
      endDate,
      totalDays: days.toFixed(1),
      isLossOfPay,
      reason: reason.trim(),
      status: "pending",
    })
    .returning();

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId!));

  res.status(201).json({
    ...leave,
    reviewedAt: null,
    createdAt: leave.createdAt.toISOString(),
    userName: user.name,
    userEmail: user.email,
  });
});

// Manager / HR / Admin Approve or Reject Leave Request
router.patch("/leaves/:id/review", requireApprover, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { status, reviewerComment } = req.body as {
    status: "approved" | "rejected";
    reviewerComment?: string;
  };

  if (status !== "approved" && status !== "rejected") {
    res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
    return;
  }

  const [existing] = await db
    .select()
    .from(leavesTable)
    .where(eq(leavesTable.id, rawId));

  if (!existing) {
    res.status(404).json({ error: "Leave request not found" });
    return;
  }

  // Deduct from leave balance if transitioning into 'approved' (and not unpaid/LOP)
  if (status === "approved" && existing.status !== "approved" && !existing.isLossOfPay) {
    const year = new Date(existing.startDate).getFullYear();
    const balance = await getOrCreateBalance(existing.userId, year);
    const days = Number(existing.totalDays);

    if (existing.leaveType === "casual") {
      await db
        .update(leaveBalancesTable)
        .set({ casualUsed: (Number(balance.casualUsed) + days).toFixed(1), updatedAt: new Date() })
        .where(eq(leaveBalancesTable.id, balance.id));
    } else if (existing.leaveType === "sick") {
      await db
        .update(leaveBalancesTable)
        .set({ sickUsed: (Number(balance.sickUsed) + days).toFixed(1), updatedAt: new Date() })
        .where(eq(leaveBalancesTable.id, balance.id));
    } else if (existing.leaveType === "earned") {
      await db
        .update(leaveBalancesTable)
        .set({ earnedUsed: (Number(balance.earnedUsed) + days).toFixed(1), updatedAt: new Date() })
        .where(eq(leaveBalancesTable.id, balance.id));
    }
  }

  const [updated] = await db
    .update(leavesTable)
    .set({
      status,
      reviewedBy: req.session.userId!,
      reviewerComment: reviewerComment?.trim() || null,
      reviewedAt: new Date(),
    })
    .where(eq(leavesTable.id, rawId))
    .returning();

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, updated.userId));

  res.json({
    ...updated,
    reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
    createdAt: updated.createdAt.toISOString(),
    userName: user.name,
    userEmail: user.email,
  });
});

// Edit a pending leave
router.patch("/leaves/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { startDate, endDate, reason, leaveType } = req.body;

  const [existing] = await db
    .select()
    .from(leavesTable)
    .where(eq(leavesTable.id, rawId));

  if (!existing) {
    res.status(404).json({ error: "Leave not found" });
    return;
  }

  const isAdmin = req.session.role === "admin" || req.session.role === "hr";
  if (!isAdmin && existing.userId !== req.session.userId) {
    res.status(403).json({ error: "You can only edit your own leaves" });
    return;
  }

  const updates: Partial<typeof existing> = {};
  if (startDate) updates.startDate = startDate;
  if (endDate) updates.endDate = endDate;
  if (reason) updates.reason = reason.trim();
  if (leaveType) updates.leaveType = leaveType;

  const finalStart = updates.startDate ?? existing.startDate;
  const finalEnd = updates.endDate ?? existing.endDate;

  if (new Date(finalStart) > new Date(finalEnd)) {
    res.status(400).json({ error: "Start date must be before or equal to end date" });
    return;
  }

  updates.totalDays = calculateInclusiveDays(finalStart, finalEnd).toFixed(1);

  const [updated] = await db
    .update(leavesTable)
    .set(updates)
    .where(eq(leavesTable.id, rawId))
    .returning();

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, updated.userId));

  res.json({
    ...updated,
    reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
    createdAt: updated.createdAt.toISOString(),
    userName: user.name,
    userEmail: user.email,
  });
});

router.delete("/leaves/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [existing] = await db
    .select()
    .from(leavesTable)
    .where(eq(leavesTable.id, rawId));

  if (!existing) {
    res.status(404).json({ error: "Leave not found" });
    return;
  }

  const isAdmin = req.session.role === "admin" || req.session.role === "hr";
  if (!isAdmin && existing.userId !== req.session.userId) {
    res.status(403).json({ error: "You can only delete your own leaves" });
    return;
  }

  await db.delete(leavesTable).where(eq(leavesTable.id, rawId));
  res.sendStatus(204);
});

router.get("/stats", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.substring(0, 7) + "-01";
  const monthEnd = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0
  )
    .toISOString()
    .split("T")[0];

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable);

  const [todayCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leavesTable)
    .where(
      and(
        eq(leavesTable.status, "approved"),
        lte(leavesTable.startDate, today),
        gte(leavesTable.endDate, today)
      )
    );

  const [upcomingCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leavesTable)
    .where(and(eq(leavesTable.status, "approved"), gte(leavesTable.startDate, tomorrowStr)));

  const [monthlyCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leavesTable)
    .where(
      and(
        gte(leavesTable.startDate, monthStart),
        lte(leavesTable.startDate, monthEnd)
      )
    );

  const [pendingCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leavesTable)
    .where(eq(leavesTable.status, "pending"));

  res.json({
    totalMembers: memberCount.count,
    leavesToday: todayCount.count,
    upcomingLeaves: upcomingCount.count,
    monthlyLeaves: monthlyCount.count,
    pendingApprovals: pendingCount.count,
  });
});

export default router;
