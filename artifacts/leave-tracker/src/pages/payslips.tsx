import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hrApi, formatInr } from "@/lib/hr-api";
import { Receipt, Printer } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function PayslipsPage() {
  const { data: balance } = useQuery({
    queryKey: ["my-leave-balance"],
    queryFn: () => hrApi.getBalance(),
  });

  const { data: slips = [], isLoading } = useQuery({
    queryKey: ["my-payslips"],
    queryFn: hrApi.getMyPayslips,
  });

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white flex items-center gap-2">
            <Receipt className="w-7 h-7 text-accent" />
            My Payslips & Leave Balances
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            View your annual leave quotas and monthly Indian statutory payslips.
          </p>
        </div>

        {/* Leave Quota Summary Cards */}
        {balance && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Casual Leave (CL)", used: balance.casualUsed, total: balance.casualTotal },
              { label: "Sick Leave (SL)", used: balance.sickUsed, total: balance.sickTotal },
              { label: "Earned Leave (EL)", used: balance.earnedUsed, total: balance.earnedTotal },
            ].map((item) => {
              const rem = Math.max(0, Number(item.total) - Number(item.used));
              return (
                <Card key={item.label} className="bg-white/[0.03] border-white/10">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {rem.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">/ {item.total} days left</span>
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Monthly Payslips */}
        {isLoading ? (
          <p className="text-muted-foreground">Loading payslips...</p>
        ) : slips.length === 0 ? (
          <Card className="bg-white/[0.03] border-white/10">
            <CardContent className="p-10 text-center text-muted-foreground text-sm">
              No payslips generated for your account yet. Once HR processes payroll, your monthly payslips will appear here.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {slips.map(({ payslip, month, year, runStatus }) => (
              <Card key={payslip.id} className="bg-white/[0.03] border-white/10">
                <CardContent className="p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-white">
                          Payslip — {MONTHS[month - 1]} {year}
                        </h3>
                        <Badge className="uppercase">{runStatus}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Days in Month: {payslip.totalDaysInMonth} · Payable Days: {payslip.payableDays} · Paid Leaves: {payslip.paidLeaveDays} · LOP Days: {payslip.lopDays}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => window.print()}>
                      <Printer className="w-4 h-4 mr-1.5" />
                      Print / Save PDF
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-emerald-400 uppercase text-xs tracking-wider">
                        Earnings
                      </h4>
                      <div className="flex justify-between text-white/90">
                        <span>Basic Salary</span>
                        <span>{formatInr(payslip.basicEarnedPaise)}</span>
                      </div>
                      <div className="flex justify-between text-white/90">
                        <span>House Rent Allowance (HRA)</span>
                        <span>{formatInr(payslip.hraEarnedPaise)}</span>
                      </div>
                      <div className="flex justify-between text-white/90">
                        <span>Special Allowance</span>
                        <span>{formatInr(payslip.specialAllowanceEarnedPaise)}</span>
                      </div>
                      <div className="flex justify-between text-white/90">
                        <span>Conveyance Allowance</span>
                        <span>{formatInr(payslip.conveyanceEarnedPaise)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-white border-t border-white/10 pt-2">
                        <span>Gross Earnings</span>
                        <span>{formatInr(payslip.grossEarningsPaise)}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold text-rose-400 uppercase text-xs tracking-wider">
                        Deductions
                      </h4>
                      <div className="flex justify-between text-white/90">
                        <span>Loss of Pay (LOP Deduction)</span>
                        <span>{formatInr(payslip.lopDeductionPaise)}</span>
                      </div>
                      <div className="flex justify-between text-white/90">
                        <span>Employee Provident Fund (EPF 12%)</span>
                        <span>{formatInr(payslip.epfEmployeePaise)}</span>
                      </div>
                      <div className="flex justify-between text-white/90">
                        <span>Professional Tax (PT)</span>
                        <span>{formatInr(payslip.professionalTaxPaise)}</span>
                      </div>
                      <div className="flex justify-between text-white/90">
                        <span>Income Tax (TDS)</span>
                        <span>{formatInr(payslip.tdsPaise)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-rose-300 border-t border-white/10 pt-2">
                        <span>Total Statutory Deductions</span>
                        <span>{formatInr(payslip.totalDeductionsPaise)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-emerald-200">
                      Net Take-Home Pay (Employer EPF Contribution: {formatInr(payslip.epfEmployerPaise)})
                    </span>
                    <span className="text-2xl font-bold text-emerald-400">
                      {formatInr(payslip.netPayPaise)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
