import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { EntryPage } from "./features/auth/EntryPage";
import { LoginPage } from "./features/auth/LoginPage";
import { PasswordAssistancePage } from "./features/auth/PasswordAssistancePage";
import { PasswordResetPage } from "./features/auth/PasswordResetPage";
import { BriefManagerLauncher } from "./features/modules/BriefManagerLauncher";
import { DailyDocumentsPage } from "./features/modules/DailyDocumentsPage";
import { HolidaysPage } from "./features/modules/HolidaysPage";
import { InternalContractsPage } from "./features/modules/InternalContractsPage";
import { LaborFilesPage } from "./features/modules/LaborFilesPage";
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
import { GeneralSupervisionPage } from "./features/general-supervision/GeneralSupervisionPage";
import { GeneralExpensesPage } from "./features/workbench/GeneralExpensesPage";
import { KpisPage } from "./features/kpis/KpisPage";
import {
  MobileExecutionIndexPage,
  MobileExecutionTeamPage,
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
            <Route path="execution" element={<MobileExecutionIndexPage />} />
            <Route path="execution/:slug" element={<MobileExecutionTeamPage />} />
            <Route path="tracking" element={<MobileTrackingIndexPage />} />
            <Route path="tracking/:slug" element={<MobileTrackingModulePage />} />
            <Route path="tracking/:slug/:tableId" element={<MobileTrackingTablePage />} />
          </Route>
          <Route path="/app" element={<ProtectedLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="quotes" element={<QuotesPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="matters" element={<MattersPage />} />
            <Route path="execution" element={<ExecutionPage />} />
            <Route path="execution/:slug" element={<ExecutionTeamPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="tasks/:slug/distribuidor" element={<TaskDistributorPage />} />
            <Route path="tasks/:slug/adicionales" element={<TaskAdditionalTasksPage />} />
            <Route path="tasks/:slug/terminos" element={<TaskTermsPage />} />
            <Route path="tasks/:slug/terminos-recurrentes" element={<TaskTermsPage />} />
            <Route path="tasks/:slug/:tableId" element={<TaskLegacyTablePage />} />
            <Route path="tasks/:slug" element={<TasksTeamPage />} />
            <Route path="kpis" element={<KpisPage />} />
            <Route path="finances" element={<FinancesPage />} />
            <Route path="budget-planning" element={<BudgetPlanningPage />} />
            <Route path="general-expenses" element={<GeneralExpensesPage />} />
            <Route path="commissions" element={<CommissionsPage />} />
            <Route path="general-supervision" element={<GeneralSupervisionPage />} />
            <Route path="matter-catalog" element={<MatterCatalogPage />} />
            <Route path="brief-manager" element={<BriefManagerLauncher />} />
            <Route path="internal-contracts" element={<InternalContractsPage />} />
            <Route path="labor-file" element={<LaborFilesPage />} />
            <Route path="daily-documents" element={<DailyDocumentsPage />} />
            <Route path="third-party-documents" element={<ThirdPartyDocumentsPage />} />
            <Route path="holidays" element={<HolidaysPage />} />
            <Route path="users" element={<UsersPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
