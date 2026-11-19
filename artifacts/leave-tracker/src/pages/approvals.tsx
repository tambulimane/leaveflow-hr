import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { hrApi, type LeaveRecord } from "@/lib/hr-api";
import { CheckCircle2, XCircle, Clock, AlertTriangle, CalendarDays } from "lucide-react";

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [comments, setComments] = useState<Record<string, string>>({});

  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ["hr-leaves", filter],
    queryFn: () => hrApi.getAllLeaves(filter === "all" ? undefined : filter),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "rejected" }) =>
      hrApi.reviewLeave(id, status, comments[id]),
    onSuccess: (_data, vars) => {
      toast({
        title: vars.status === "approved" ? "Leave Approved" : "Leave Rejected",
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["hr-leaves"] });
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message, type: "error" });
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white">Leave Approvals</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Review employee leave requests. Approved Loss of Pay (LOP) days sync automatically with monthly payroll.
            </p>
          </div>

          <div className="flex gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
            {(["pending", "approved", "rejected", "all"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  filter === tab
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading leave requests...</p>
        ) : leaves.length === 0 ? (
          <Card className="bg-white/[0.03] border-white/10">
            <CardContent className="p-12 text-center text-muted-foreground">
              No {filter !== "all" ? filter : ""} leave requests found.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {leaves.map((leave: LeaveRecord) => (
              <Card key={leave.id} className="bg-white/[0.03] border-white/10">
                <CardContent className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white text-base">{leave.userName}</span>
                      <span className="text-xs text-muted-foreground">({leave.userEmail})</span>
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {leave.leaveType}
                      </Badge>
                      <Badge
                        className={
                          leave.status === "approved"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : leave.status === "rejected"
                            ? "bg-red-500/20 text-red-300 border-red-500/30"
                            : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        }
                      >
                        {leave.status === "pending" && <Clock className="w-3 h-3 mr-1 inline" />}
                        {leave.status}
                      </Badge>
                      {leave.isLossOfPay && (
                        <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30">
                          <AlertTriangle className="w-3 h-3 mr-1 inline" />
                          Loss of Pay (LOP)
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5 text-white/90">
                        <CalendarDays className="w-4 h-4 text-accent" />
                        {leave.startDate} to {leave.endDate} ({leave.totalDays} days)
                      </span>
                    </div>

                    <p className="text-sm text-white/80">
                      <span className="text-muted-foreground">Reason:</span> {leave.reason}
                    </p>
                    {leave.reviewerComment && (
                      <p className="text-xs text-accent">
                        Reviewer note: {leave.reviewerComment}
                      </p>
                    )}
                  </div>

                  {leave.status === "pending" && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-[320px]">
                      <Input
                        placeholder="Optional comment..."
                        value={comments[leave.id] || ""}
                        onChange={(e) =>
                          setComments((prev) => ({ ...prev, [leave.id]: e.target.value }))
                        }
                        className="bg-white/5 border-white/10 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            reviewMutation.mutate({ id: leave.id, status: "approved" })
                          }
                          disabled={reviewMutation.isPending}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            reviewMutation.mutate({ id: leave.id, status: "rejected" })
                          }
                          disabled={reviewMutation.isPending}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
