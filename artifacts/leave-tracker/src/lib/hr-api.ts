const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:3000";

async function hrFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE.replace(/\/$/, "")}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface LeaveRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  leaveType: "casual" | "sick" | "earned" | "unpaid";
  startDate: string;
  endDate: string;
  totalDays: string;
  isLossOfPay: boolean;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewerComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface LeaveBalance {
  id: string;
  userId: string;
  year: number;
  casualTotal: string;
  casualUsed: string;
  sickTotal: string;
  sickUsed: string;
  earnedTotal: string;
  earnedUsed: string;
}

export interface EmployeeProfile {
  id: string;
  userId: string;
  employeeCode: string;
  department: string;
  designation: string;
  joiningDate: string;
  panNumber: string | null;
  uanNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  ifscCode: string | null;
  basicPaise: number;
  hraPaise: number;
  specialAllowancePaise: number;
  conveyancePaise: number;
  epfEnabled: boolean;
  ptEnabled: boolean;
  monthlyTdsPaise: number;
}

export interface EmployeeWithProfile {
  userId: string;
  name: string;
  email: string;
  role: string;
  profile: EmployeeProfile | null;
}

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: "draft" | "finalized" | "paid";
  totalGrossPaise: number;
  totalDeductionsPaise: number;
  totalNetPayPaise: number;
  createdAt: string;
  finalizedAt: string | null;
}

export interface PayslipRecord {
  id: string;
  payrollRunId: string;
  userId: string;
  totalDaysInMonth: number;
  paidLeaveDays: string;
  lopDays: string;
  payableDays: string;
  basicEarnedPaise: number;
  hraEarnedPaise: number;
  specialAllowanceEarnedPaise: number;
  conveyanceEarnedPaise: number;
  bonusPaise: number;
  grossEarningsPaise: number;
  lopDeductionPaise: number;
  epfEmployeePaise: number;
  epfEmployerPaise: number;
  professionalTaxPaise: number;
  tdsPaise: number;
  totalDeductionsPaise: number;
  netPayPaise: number;
}

export function formatInr(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format((paise || 0) / 100);
}

export const hrApi = {
  getBalance: (year?: number) =>
    hrFetch<LeaveBalance>(`/api/leaves/balances${year ? `?year=${year}` : ""}`),
  getAllLeaves: (status?: string) =>
    hrFetch<LeaveRecord[]>(`/api/leaves/all${status ? `?status=${status}` : ""}`),
  applyLeave: (payload: {
    startDate: string;
    endDate: string;
    leaveType: "casual" | "sick" | "earned" | "unpaid";
    reason: string;
  }) =>
    hrFetch<LeaveRecord>("/api/leaves", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  reviewLeave: (id: string, status: "approved" | "rejected", reviewerComment?: string) =>
    hrFetch<LeaveRecord>(`/api/leaves/${id}/review`, {
      method: "PATCH",
      body: JSON.stringify({ status, reviewerComment }),
    }),
  getProfiles: () => hrFetch<EmployeeWithProfile[]>("/api/payroll/profiles"),
  upsertProfile: (userId: string, payload: Record<string, unknown>) =>
    hrFetch<EmployeeProfile>(`/api/payroll/profiles/${userId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getRuns: () => hrFetch<PayrollRun[]>("/api/payroll/runs"),
  generateRun: (month: number, year: number) =>
    hrFetch<{ run: PayrollRun; payslips: PayslipRecord[] }>("/api/payroll/runs/generate", {
      method: "POST",
      body: JSON.stringify({ month, year }),
    }),
  updateRunStatus: (id: string, status: "finalized" | "paid") =>
    hrFetch<PayrollRun>(`/api/payroll/runs/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  getRunPayslips: (runId: string) =>
    hrFetch<
      Array<{
        payslip: PayslipRecord;
        userName: string;
        userEmail: string;
        profile: EmployeeProfile | null;
      }>
    >(`/api/payroll/runs/${runId}/payslips`),
  getMyPayslips: () =>
    hrFetch<
      Array<{
        payslip: PayslipRecord;
        month: number;
        year: number;
        runStatus: "draft" | "finalized" | "paid";
      }>
    >("/api/payroll/payslips/me"),
};
