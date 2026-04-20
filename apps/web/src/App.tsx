import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { EntryPage } from "./features/auth/EntryPage";
import { LoginPage } from "./features/auth/LoginPage";
import { PasswordAssistancePage } from "./features/auth/PasswordAssistancePage";
import { PasswordResetPage } from "./features/auth/PasswordResetPage";
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
import { CommissionsPage } from "./features/commissions/CommissionsPage";
import { FinancesPage } from "./features/finances/FinancesPage";
import { GeneralExpensesPage } from "./features/workbench/GeneralExpensesPage";

function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="centered-message">Loading SIGE_2...</div>;
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
            <Route path="kpis" element={<ModulePlaceholderPage moduleId="kpis" />} />
            <Route path="finances" element={<FinancesPage />} />
            <Route path="general-expenses" element={<GeneralExpensesPage />} />
            <Route path="commissions" element={<CommissionsPage />} />
            <Route path="general-supervision" element={<ModulePlaceholderPage moduleId="general-supervision" />} />
            <Route path="matter-catalog" element={<MatterCatalogPage />} />
            <Route path="brief-manager" element={<ModulePlaceholderPage moduleId="brief-manager" />} />
            <Route path="labor-file" element={<ModulePlaceholderPage moduleId="labor-file" />} />
            <Route path="third-party-documents" element={<ThirdPartyDocumentsPage />} />
            <Route path="holidays" element={<ModulePlaceholderPage moduleId="holidays" />} />
            <Route path="users" element={<UsersPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
