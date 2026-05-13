import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { canReadModule } from "./features/auth/permissions";
import { EntryPage } from "./features/auth/EntryPage";
import { LoginPage } from "./features/auth/LoginPage";
import { PasswordAssistancePage } from "./features/auth/PasswordAssistancePage";
import { PasswordResetPage } from "./features/auth/PasswordResetPage";
import { DailyDocumentsPage } from "./features/modules/DailyDocumentsPage";
import { InternalContractsPage } from "./features/modules/InternalContractsPage";
import { ModulePlaceholderPage } from "./features/modules/ModulePlaceholderPage";
import { ThirdPartyDocumentsPage } from "./features/modules/ThirdPartyDocumentsPage";
import { AppShell } from "./features/shell/AppShell";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ExecutionPage } from "./features/execution/ExecutionPage";
import { ExecutionTeamPage } from "./features/execution/ExecutionTeamPage";
import { TaskAdditionalTasksPage } from "./features/tasks/TaskAdditionalTasksPage";
import { TaskDistributorPage } from "./features/tasks/TaskDistributorPage";
import { TaskLegacyTablePage } from "./features/tasks/TaskLegacyTablePage";
import { TaskTermsPage } from "./features/tasks/TaskTermsPage";
import { TasksPage } from "./features/tasks/TasksPage";
import { TasksTeamPage } from "./features/tasks/TasksTeamPage";
import { UsersPage } from "./features/users/UsersPage";
import { ClientsPage } from "./features/workbench/ClientsPage";
import { QuotesPage } from "./features/workbench/QuotesPage";
import { LeadsPage } from "./features/workbench/LeadsPage";
import { MattersPage } from "./features/workbench/MattersPage";
import { MatterCatalogPage } from "./features/workbench/MatterCatalogPage";
import { BudgetPlanningPage } from "./features/budget-planning/BudgetPlanningPage";
import { CommissionsPage } from "./features/commissions/CommissionsPage";
import { FinancesPage } from "./features/finances/FinancesPage";
import { GeneralExpensesPage } from "./features/workbench/GeneralExpensesPage";
import {
  MobileExecutionIndexPage,
  MobileExecutionTeamPage,
  MobileFinancesPage,
  MobileGeneralExpensesPage,
  MobileHomePage,
  MobileLeadsPage,
  MobileProtectedLayout,
  MobileTrackingIndexPage,
  MobileTrackingModulePage,
  MobileTrackingTablePage
} from "./features/mobile/MobileApp";

function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="centered-message">Loading SIGE...</div>;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <AppShell />;
}

function ModuleAccessGate({ moduleId, children }: { moduleId: string; children: ReactNode }) {
  const { user } = useAuth();

  if (!canReadModule(user, moduleId)) {
    return <Navigate to="/app" replace />;
  }

  return children;
}

function protectedModule(moduleId: string, element: ReactNode) {
  return <ModuleAccessGate moduleId={moduleId}>{element}</ModuleAccessGate>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<EntryPage />} />
          <Route path="/intranet-login" element={<LoginPage />} />
          <Route path="/intranet-password-help" element={<PasswordAssistancePage />} />
          <Route path="/intranet-reset-password" element={<PasswordResetPage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/mobile" element={<MobileProtectedLayout />}>
            <Route index element={<MobileHomePage />} />
            <Route path="leads" element={<MobileLeadsPage />} />
            <Route path="finances" element={<MobileFinancesPage />} />
            <Route path="general-expenses" element={<MobileGeneralExpensesPage />} />
            <Route path="execution" element={<MobileExecutionIndexPage />} />
            <Route path="execution/:slug" element={<MobileExecutionTeamPage />} />
            <Route path="tracking" element={<MobileTrackingIndexPage />} />
            <Route path="tracking/:slug" element={<MobileTrackingModulePage />} />
            <Route path="tracking/:slug/:tableId" element={<MobileTrackingTablePage />} />
          </Route>
          <Route path="/app" element={<ProtectedLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="clients" element={protectedModule("clients", <ClientsPage />)} />
            <Route path="quotes" element={protectedModule("quotes", <QuotesPage />)} />
            <Route path="leads" element={protectedModule("lead-tracking", <LeadsPage />)} />
            <Route path="matters" element={protectedModule("active-matters", <MattersPage />)} />
            <Route path="execution" element={protectedModule("execution", <ExecutionPage />)} />
            <Route path="execution/:slug" element={protectedModule("execution", <ExecutionTeamPage />)} />
            <Route path="tasks" element={protectedModule("tasks", <TasksPage />)} />
            <Route path="tasks/:slug/distribuidor" element={protectedModule("tasks", <TaskDistributorPage />)} />
            <Route path="tasks/:slug/adicionales" element={protectedModule("tasks", <TaskAdditionalTasksPage />)} />
            <Route path="tasks/:slug/terminos" element={protectedModule("tasks", <TaskTermsPage />)} />
            <Route path="tasks/:slug/terminos-recurrentes" element={protectedModule("tasks", <TaskTermsPage />)} />
            <Route path="tasks/:slug/:tableId" element={protectedModule("tasks", <TaskLegacyTablePage />)} />
            <Route path="tasks/:slug" element={protectedModule("tasks", <TasksTeamPage />)} />
            <Route path="kpis" element={protectedModule("kpis", <ModulePlaceholderPage moduleId="kpis" />)} />
            <Route path="finances" element={protectedModule("finances", <FinancesPage />)} />
            <Route path="budget-planning" element={protectedModule("budget-planning", <BudgetPlanningPage />)} />
            <Route path="general-expenses" element={protectedModule("general-expenses", <GeneralExpensesPage />)} />
            <Route path="commissions" element={protectedModule("commissions", <CommissionsPage />)} />
            <Route path="general-supervision" element={protectedModule("general-supervision", <ModulePlaceholderPage moduleId="general-supervision" />)} />
            <Route path="matter-catalog" element={protectedModule("matter-catalog", <MatterCatalogPage />)} />
            <Route path="brief-manager" element={protectedModule("brief-manager", <ModulePlaceholderPage moduleId="brief-manager" />)} />
            <Route path="internal-contracts" element={protectedModule("internal-contracts", <InternalContractsPage />)} />
            <Route path="labor-file" element={protectedModule("labor-file", <ModulePlaceholderPage moduleId="labor-file" />)} />
            <Route path="daily-documents" element={protectedModule("daily-documents", <DailyDocumentsPage />)} />
            <Route path="third-party-documents" element={protectedModule("third-party-documents", <ThirdPartyDocumentsPage />)} />
            <Route path="holidays" element={protectedModule("holidays", <ModulePlaceholderPage moduleId="holidays" />)} />
            <Route path="users" element={protectedModule("users", <UsersPage />)} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
