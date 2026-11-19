import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Clock, Plus, Send, MessageSquare, Smartphone, CalendarClock } from "lucide-react";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:3000";

async function shiftFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE.replace(/\/$/, "")}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

interface ShiftItem {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  weeklyOffs: string;
  isNightShift: boolean;
}

interface AllocationRow {
  allocation: {
    id: string;
    startDate: string;
    endDate: string;
    notes: string | null;
    notificationChannel: string;
    notificationStatus: string;
  };
  userName?: string;
  userEmail?: string;
  shiftName: string;
  shiftCode: string;
  startTime: string;
  endTime: string;
  phoneNumber?: string | null;
}

export default function ShiftsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { retry: false } as never });
  const isManager = ["admin", "hr", "manager"].includes(me?.role || "");

  // Create Shift State
  const [shiftForm, setShiftForm] = useState({
    name: "",
    code: "",
    startTime: "09:30",
    endTime: "18:30",
    graceMinutes: "15",
    weeklyOffs: "Saturday,Sunday",
    isNightShift: false,
  });

  // Allocate Shift State
  const [allocForm, setAllocForm] = useState({
    userId: "",
    shiftId: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    phoneNumber: "",
    notificationChannel: "whatsapp",
    notes: "",
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["shifts-list"],
    queryFn: () => shiftFetch<ShiftItem[]>("/api/shifts"),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["shift-employees"],
    queryFn: () =>
      shiftFetch<
        Array<{ userId: string; name: string; email: string; profile?: { phoneNumber?: string | null } | null }>
      >("/api/payroll/profiles"),
    enabled: isManager,
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ["shift-allocations", isManager],
    queryFn: () =>
      shiftFetch<AllocationRow[]>(
        isManager ? "/api/shifts/allocations" : "/api/shifts/allocations/me"
      ),
  });

  const createShiftMutation = useMutation({
    mutationFn: () =>
      shiftFetch("/api/shifts", {
        method: "POST",
        body: JSON.stringify(shiftForm),
      }),
    onSuccess: () => {
      toast({ title: "Shift created", type: "success" });
      setShiftForm({
        name: "",
        code: "",
        startTime: "09:30",
        endTime: "18:30",
        graceMinutes: "15",
        weeklyOffs: "Saturday,Sunday",
        isNightShift: false,
      });
      queryClient.invalidateQueries({ queryKey: ["shifts-list"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, type: "error" }),
  });

  const allocateMutation = useMutation({
    mutationFn: () =>
      shiftFetch<{ notification: { status: string; detail: string } }>(
        "/api/shifts/allocations",
        {
          method: "POST",
          body: JSON.stringify(allocForm),
        }
      ),
    onSuccess: (res) => {
      toast({
        title: "Shift Allocated",
        description: res.notification.detail,
        type: res.notification.status === "failed" ? "error" : "success",
      });
      queryClient.invalidateQueries({ queryKey: ["shift-allocations"] });
    },
    onError: (err: Error) =>
      toast({ title: "Allocation failed", description: err.message, type: "error" }),
  });

  function handleEmployeeSelect(userId: string) {
    const found = employees.find((e) => e.userId === userId);
    setAllocForm((prev) => ({
      ...prev,
      userId,
      phoneNumber: found?.profile?.phoneNumber || prev.phoneNumber,
    }));
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white flex items-center gap-2">
            <CalendarClock className="w-7 h-7 text-accent" />
            Shift Management & Roster Alerts
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define work shifts, allocate employee schedules, and notify staff automatically via WhatsApp or SMS.
          </p>
        </div>

        {/* Manager / HR Shift Creation & Allocation Grid */}
        {isManager && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create Shift Card */}
            <Card className="bg-white/[0.03] border-white/10">
              <CardContent className="p-5 space-y-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  1. Create Shift Template
                </h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createShiftMutation.mutate();
                  }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Shift Name</label>
                      <Input
                        placeholder="General Shift"
                        value={shiftForm.name}
                        onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Shift Code</label>
                      <Input
                        placeholder="GEN"
                        value={shiftForm.code}
                        onChange={(e) => setShiftForm({ ...shiftForm, code: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Start Time</label>
                      <Input
                        type="time"
                        value={shiftForm.startTime}
                        onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">End Time</label>
                      <Input
                        type="time"
                        value={shiftForm.endTime}
                        onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Weekly Offs</label>
                    <Input
                      value={shiftForm.weeklyOffs}
                      onChange={(e) => setShiftForm({ ...shiftForm, weeklyOffs: e.target.value })}
                    />
                  </div>
                  <Button type="submit" disabled={createShiftMutation.isPending} className="w-full">
                    <Plus className="w-4 h-4 mr-1.5" />
                    {createShiftMutation.isPending ? "Saving..." : "Add Shift Template"}
                  </Button>
                </form>

                {/* Existing Shifts */}
                <div className="pt-2 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Available Shifts</p>
                  {shifts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No shifts created yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {shifts.map((s) => (
                        <Badge key={s.id} variant="outline" className="py-1 px-2.5 text-xs">
                          {s.code}: {s.name} ({s.startTime}–{s.endTime})
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Allocate Shift & Notify Card */}
            <Card className="bg-white/[0.03] border-white/10">
              <CardContent className="p-5 space-y-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Send className="w-5 h-5 text-accent" />
                  2. Allocate Shift & Notify Employee
                </h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    allocateMutation.mutate();
                  }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Select Employee</label>
                      <select
                        value={allocForm.userId}
                        onChange={(e) => handleEmployeeSelect(e.target.value)}
                        required
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                      >
                        <option value="">-- Choose Employee --</option>
                        {employees.map((emp) => (
                          <option key={emp.userId} value={emp.userId}>
                            {emp.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Select Shift</label>
                      <select
                        value={allocForm.shiftId}
                        onChange={(e) => setAllocForm({ ...allocForm, shiftId: e.target.value })}
                        required
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                      >
                        <option value="">-- Choose Shift --</option>
                        {shifts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.startTime}–{s.endTime})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">From Date</label>
                      <Input
                        type="date"
                        value={allocForm.startDate}
                        onChange={(e) => setAllocForm({ ...allocForm, startDate: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">To Date</label>
                      <Input
                        type="date"
                        value={allocForm.endDate}
                        onChange={(e) => setAllocForm({ ...allocForm, endDate: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Mobile Number (+91...)</label>
                      <Input
                        placeholder="+919876543210"
                        value={allocForm.phoneNumber}
                        onChange={(e) =>
                          setAllocForm({ ...allocForm, phoneNumber: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Notify Via</label>
                      <select
                        value={allocForm.notificationChannel}
                        onChange={(e) =>
                          setAllocForm({ ...allocForm, notificationChannel: e.target.value })
                        }
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                      >
                        <option value="whatsapp">WhatsApp</option>
                        <option value="sms">SMS</option>
                        <option value="both">Both (WhatsApp + SMS)</option>
                        <option value="none">No Notification</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Roster Note (Optional)</label>
                    <Input
                      placeholder="e.g. Client deployment support"
                      value={allocForm.notes}
                      onChange={(e) => setAllocForm({ ...allocForm, notes: e.target.value })}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={allocateMutation.isPending}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    <MessageSquare className="w-4 h-4 mr-1.5" />
                    {allocateMutation.isPending
                      ? "Allocating & Notifying..."
                      : "Allocate Shift & Send Alert"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Shift Roster Table */}
        <Card className="bg-white/[0.03] border-white/10">
          <CardContent className="p-5 space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {isManager ? "Team Shift Allocations" : "My Assigned Shifts"}
            </h2>
            {allocations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shift allocations recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase text-muted-foreground border-b border-white/10">
                    <tr>
                      {isManager && <th className="py-3 px-2">Employee</th>}
                      <th className="py-3 px-2">Shift</th>
                      <th className="py-3 px-2">Dates</th>
                      <th className="py-3 px-2">Channel</th>
                      <th className="py-3 px-2">Alert Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {allocations.map((row) => (
                      <tr key={row.allocation.id}>
                        {isManager && (
                          <td className="py-3 px-2">
                            <div className="font-medium text-white">{row.userName}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.phoneNumber || "No phone"}
                            </div>
                          </td>
                        )}
                        <td className="py-3 px-2">
                          <span className="font-medium text-white">{row.shiftName}</span>{" "}
                          <span className="text-xs text-accent">
                            ({row.startTime}–{row.endTime})
                          </span>
                        </td>
                        <td className="py-3 px-2 text-white/90">
                          {row.allocation.startDate} to {row.allocation.endDate}
                        </td>
                        <td className="py-3 px-2 uppercase text-xs">
                          <span className="inline-flex items-center gap-1">
                            <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
                            {row.allocation.notificationChannel}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <Badge
                            className={
                              row.allocation.notificationStatus === "sent"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : row.allocation.notificationStatus === "failed"
                                ? "bg-rose-500/20 text-rose-300"
                                : "bg-amber-500/20 text-amber-300"
                            }
                          >
                            {row.allocation.notificationStatus}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
