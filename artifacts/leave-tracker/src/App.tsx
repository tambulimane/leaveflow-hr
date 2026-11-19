import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Pages
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Leaves from "@/pages/leaves";
import Approvals from "@/pages/approvals";
import Payroll from "@/pages/payroll";
import Payslips from "@/pages/payslips";
import Shifts from "@/pages/shifts";
import Calendar from "@/pages/calendar";
import Insights from "@/pages/insights";
import Holidays from "@/pages/holidays";
import Admin from "@/pages/admin";
import Profile from "@/pages/profile";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/leaves" component={Leaves} />
      <Route path="/approvals" component={Approvals} />
      <Route path="/payroll" component={Payroll} />
      <Route path="/payslips" component={Payslips} />
      <Route path="/shifts" component={Shifts} />
      <Route path="/calendar" component={Calendar} />
      <Route path="/insights" component={Insights} />
      <Route path="/holidays" component={Holidays} />
      <Route path="/admin" component={Admin} />
      <Route path="/profile" component={Profile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
