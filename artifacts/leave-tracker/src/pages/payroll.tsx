import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/hooks/use-toast";
import { hrApi, formatInr, type EmployeeWithProfile } from "@/lib/hr-api";
import { IndianRupee, Play, CheckCircle, UserCog, FileSpreadsheet } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function PayrollPage() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [editingEmp, setEditingEmp] = useState<EmployeeWithProfile | null>(null);

  const [form, setForm] = useState({
    employeeCode: "",
    department: "Engineering",
    designation: "Software Engineer",
    joiningDate: new Date().toISOString().split("T")[0],
    panNumber: "",
    uanNumber: "",
    bankName: "",
    bankAccountNumber: "",
    ifscCode: "",
    basicInr: "30000",
    hraInr: "15000",
    specialAllowanceInr: "10000",
    conveyanceInr: "1600",
    epfEnabled: true,
    ptEnabled: true,
    monthlyTdsInr: "0",
  });

  const { data: employees = [], isLoading: isLoadingEmp, error: empError } = useQuery({
    queryKey: ["payroll-profiles"],
    queryFn: hrApi.getProfiles,
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["payroll-runs"],
    queryFn: hrApi.getRuns,
  });

  const activeRunId = selectedRunId || runs[0]?.id || null;

  const { data: runPayslips = [] } = useQuery({
    queryKey: ["payroll-run-slips", activeRunId],
    queryFn: () => hrApi.getRunPayslips(activeRunId!),
    enabled: Boolean(activeRunId),
  });

  const saveProfileMutation = useMutation({
    mutationFn: () => {
      if (!editingEmp) throw new Error("No employee selected");
      return hrApi.upsertProfile(editingEmp.userId, form);
    },
    onSuccess: () => {
      toast({ title: "Salary profile saved", type: "success" });
      setEditingEmp(null);
      queryClient.invalidateQueries({ queryKey: ["payroll-profiles"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, type: "error" }),
  });

  const generateRunMutation = useMutation({
    mutationFn: () => hrApi.generateRun(month, year),
    onSuccess: (res) => {
      toast({
        title: `Payroll generated for ${MONTHS[month - 1]} ${year}`,
        type: "success",
      });
      setSelectedRunId(res.run.id);
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run-slips", res.run.id] });
    },
    onError: (err: Error) => toast({ title: "Payroll failed", description: err.message, type: "error" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "finalized" | "paid" }) =>
      hrApi.updateRunStatus(id, status),
    onSuccess: () => {
      toast({ title: "Payroll status updated", type: "success" });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    },
  });

  function openProfileModal(emp: EmployeeWithProfile) {
    setEditingEmp(emp);
    const p = emp.profile;
    setForm({
      employeeCode: p?.employeeCode || `EMP-${emp.userId.slice(0, 4).toUpperCase()}`,
      department: p?.department || "Engineering",
      designation: p?.designation || "Associate",
      joiningDate: p?.joiningDate || new Date().toISOString().split("T")[0],
      panNumber: p?.panNumber || "",
      uanNumber: p?.uanNumber || "",
      bankName: p?.bankName || "",
      bankAccountNumber: p?.bankAccountNumber || "",
      ifscCode: p?.ifscCode || "",
      basicInr: p ? String(p.basicPaise / 100) : "30000",
      hraInr: p ? String(p.hraPaise / 100) : "15000",
      specialAllowanceInr: p ? String(p.specialAllowancePaise / 100) : "10000",
      conveyanceInr: p ? String(p.conveyancePaise / 100) : "1600",
      epfEnabled: p ? p.epfEnabled : true,
      ptEnabled: p ? p.ptEnabled : true,
      monthlyTdsInr: p ? String(p.monthlyTdsPaise / 100) : "0",
    });
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header & Run Payroll Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-2">
              <IndianRupee className="w-7 h-7 text-accent" />
              Indian Payroll & Compensation
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Configure Basic, HRA, EPF (12%), Professional Tax, TDS & process monthly payroll with automatic LOP deductions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 bg-white/[0.04] p-2.5 rounded-xl border border-white/10">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={idx + 1}>{m}</option>
              ))}
            </select>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24 bg-black/40 border-white/10 text-sm"
            />
            <Button
              onClick={() => generateRunMutation.mutate()}
              disabled={generateRunMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Play className="w-4 h-4 mr-1.5" />
              {generateRunMutation.isPending ? "Calculating..." : "Run Payroll"}
            </Button>
          </div>
        </div>

        {/* Employee Salary Structures */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <UserCog className="w-5 h-5 text-primary" />
            Employee Salary Structures
          </h2>
          {empError && (
            <div className="p-4 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-sm">
              Failed to load employees: {(empError as Error).message}
            </div>
          )}
          {isLoadingEmp && <p className="text-sm text-muted-foreground">Loading employees...</p>}
          {!isLoadingEmp && !empError && employees.length === 0 && (
            <p className="text-sm text-amber-400">No users returned from /api/payroll/profiles.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {employees.map((emp) => {
              const p = emp.profile;
              const monthlyGross = p
                ? p.basicPaise + p.hraPaise + p.specialAllowancePaise + p.conveyancePaise
                : 0;
              return (
                <Card key={emp.userId} className="bg-white/[0.03] border-white/10">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{emp.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {p?.employeeCode || "Unconfigured"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{emp.email}</p>
                      {p ? (
                        <p className="text-sm text-emerald-400 font-medium mt-1">
                          Monthly Gross: {formatInr(monthlyGross)} · {p.designation}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-400 mt-1">
                          Salary structure not set — excluded from payroll runs
                        </p>
                      )}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openProfileModal(emp)}>
                      {p ? "Edit CTC" : "Setup Salary"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Payroll Runs & Generated Payslips */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-accent" />
            Monthly Payroll Batches
          </h2>

          {runs.length === 0 ? (
            <Card className="bg-white/[0.03] border-white/10">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                Setup at least one employee salary structure above, then click "Run Payroll".
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {runs.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRunId(r.id)}
                    className={`px-4 py-2 rounded-xl border text-left transition-all ${
                      activeRunId === r.id
                        ? "bg-primary/20 border-primary text-white"
                        : "bg-white/[0.03] border-white/10 text-muted-foreground hover:text-white"
                    }`}
                  >
                    <div className="text-sm font-semibold">
                      {MONTHS[r.month - 1]} {r.year}
                    </div>
                    <div className="text-xs opacity-80">
                      Net: {formatInr(r.totalNetPayPaise)} · <span className="uppercase">{r.status}</span>
                    </div>
                  </button>
                ))}
              </div>

              {activeRunId && (
                <Card className="bg-white/[0.03] border-white/10 overflow-hidden">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm text-muted-foreground">
                        Showing {runPayslips.length} generated employee payslips
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            statusMutation.mutate({ id: activeRunId, status: "finalized" })
                          }
                        >
                          Finalize Batch
                        </Button>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white"
                          onClick={() =>
                            statusMutation.mutate({ id: activeRunId, status: "paid" })
                          }
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Mark Paid
                        </Button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs uppercase text-muted-foreground border-b border-white/10">
                          <tr>
                            <th className="py-3 px-2">Employee</th>
                            <th className="py-3 px-2">Payable / LOP</th>
                            <th className="py-3 px-2">Gross Earned</th>
                            <th className="py-3 px-2">LOP Ded.</th>
                            <th className="py-3 px-2">EPF (12%)</th>
                            <th className="py-3 px-2">PT + TDS</th>
                            <th className="py-3 px-2 text-right">Net Pay</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {runPayslips.map(({ payslip, userName, profile }) => (
                            <tr key={payslip.id} className="hover:bg-white/[0.02]">
                              <td className="py-3 px-2">
                                <div className="font-medium text-white">{userName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {profile?.employeeCode} · {profile?.department}
                                </div>
                              </td>
                              <td className="py-3 px-2 text-xs">
                                <span className="text-white">{payslip.payableDays}d</span> /{" "}
                                <span className={Number(payslip.lopDays) > 0 ? "text-rose-400 font-semibold" : "text-muted-foreground"}>
                                  {payslip.lopDays}d LOP
                                </span>
                              </td>
                              <td className="py-3 px-2 text-white">
                                {formatInr(payslip.grossEarningsPaise)}
                              </td>
                              <td className="py-3 px-2 text-rose-400">
                                -{formatInr(payslip.lopDeductionPaise)}
                              </td>
                              <td className="py-3 px-2 text-amber-300">
                                -{formatInr(payslip.epfEmployeePaise)}
                              </td>
                              <td className="py-3 px-2 text-amber-300">
                                -{formatInr(payslip.professionalTaxPaise + payslip.tdsPaise)}
                              </td>
                              <td className="py-3 px-2 text-right font-bold text-emerald-400">
                                {formatInr(payslip.netPayPaise)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Salary Configuration Modal */}
      <Modal
        isOpen={Boolean(editingEmp)}
        onClose={() => setEditingEmp(null)}
        title={`Salary Structure — ${editingEmp?.name || ""}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveProfileMutation.mutate();
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Employee Code</label>
              <Input
                value={form.employeeCode}
                onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Joining Date</label>
              <Input
                type="date"
                value={form.joiningDate}
                onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Department</label>
              <Input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Designation</label>
              <Input
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Basic Salary (₹/mo)</label>
              <Input
                type="number"
                value={form.basicInr}
                onChange={(e) => setForm({ ...form, basicInr: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">HRA (₹/mo)</label>
              <Input
                type="number"
                value={form.hraInr}
                onChange={(e) => setForm({ ...form, hraInr: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Special Allowance (₹/mo)</label>
              <Input
                type="number"
                value={form.specialAllowanceInr}
                onChange={(e) => setForm({ ...form, specialAllowanceInr: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Conveyance (₹/mo)</label>
              <Input
                type="number"
                value={form.conveyanceInr}
                onChange={(e) => setForm({ ...form, conveyanceInr: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Monthly TDS (₹/mo)</label>
              <Input
                type="number"
                value={form.monthlyTdsInr}
                onChange={(e) => setForm({ ...form, monthlyTdsInr: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">PAN Number</label>
              <Input
                value={form.panNumber}
                onChange={(e) => setForm({ ...form, panNumber: e.target.value })}
                placeholder="ABCDE1234F"
              />
            </div>
          </div>

          <div className="flex items-center gap-6 pt-2 text-sm text-white">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.epfEnabled}
                onChange={(e) => setForm({ ...form, epfEnabled: e.target.checked })}
              />
              EPF 12% (Capped at ₹15k Basic)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.ptEnabled}
                onChange={(e) => setForm({ ...form, ptEnabled: e.target.checked })}
              />
              Professional Tax (₹200/mo)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="ghost" onClick={() => setEditingEmp(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveProfileMutation.isPending}>
              {saveProfileMutation.isPending ? "Saving..." : "Save Salary Profile"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
