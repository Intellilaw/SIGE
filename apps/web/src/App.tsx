import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { EntryPage } from "./features/auth/EntryPage";
import { LoginPage } from "./features/auth/LoginPage";
import { PasswordAssistancePage } from "./features/auth/PasswordAssistancePage";
import { PasswordResetPage } from "./features/auth/PasswordResetPage";
import { DailyDocumentsPage } from "./features/modules/DailyDocumentsPage";
import { GuidelinesManualsPage } from "./features/modules/GuidelinesManualsPage";
import { HolidaysPage } from "./features/modules/HolidaysPage";
import { InternalContractsPage } from "./features/modules/InternalContractsPage";
import { LaborFilesPage } from "./features/modules/LaborFilesPage";
import { ModuleAvailabilityProvider, useModuleAvailability } from "./features/modules/ModuleAvailabilityContext";
import { ModuleEnablementPage } from "./features/modules/ModuleEnablementPage";
import { MyAccountPage } from "./features/account/MyAccountPage";
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
import { RusconiIntelligencePage } from "./features/rusconi-intelligence/RusconiIntelligencePage";
import { GeneralExpensesPage } from "./features/workbench/GeneralExpensesPage";
import { KpisPage } from "./features/kpis/KpisPage";
import { SalesPage } from "./features/sales/SalesPage";
import {
  MobileExecutionIndexPage,
  MobileExecutionTeamPage,
  MobileDashboardIndexPage,
  MobileDashboardModulePage,
  MobileFinancesPage,
  MobileGeneralExpensesPage,
  MobileGeneralSupervisionPage,
  MobileHomePage,
  MobileKpisPage,
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

  return (
    <ModuleAvailabilityProvider>
      <AppShell />
    </ModuleAvailabilityProvider>
  );
}

function EnabledModuleRoute({ moduleId, children }: { moduleId: string; children: ReactNode }) {
  const { isModuleEnabled, loading } = useModuleAvailability();

  if (loading) {
    return <div className="centered-message">Cargando modulos...</div>;
  }

  if (!isModuleEnabled(moduleId)) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}

function withEnabledModule(moduleId: string, element: ReactNode) {
  return <EnabledModuleRoute moduleId={moduleId}>{element}</EnabledModuleRoute>;
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
            <Route path="kpis" element={<MobileKpisPage />} />
            <Route path="general-supervision" element={<MobileGeneralSupervisionPage />} />
            <Route path="execution" element={<MobileExecutionIndexPage />} />
            <Route path="execution/:slug" element={<MobileExecutionTeamPage />} />
            <Route path="dashboard" element={<MobileDashboardIndexPage />} />
            <Route path="dashboard/:slug" element={<MobileDashboardModulePage />} />
            <Route path="tracking" element={<MobileTrackingIndexPage />} />
            <Route path="tracking/:slug" element={<MobileTrackingModulePage />} />
            <Route path="tracking/:slug/:tableId" element={<MobileTrackingTablePage />} />
          </Route>
          <Route path="/app" element={<ProtectedLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="clients" element={withEnabledModule("clients", <ClientsPage />)} />
            <Route path="quotes" element={withEnabledModule("quotes", <QuotesPage />)} />
            <Route path="leads" element={withEnabledModule("lead-tracking", <LeadsPage />)} />
            <Route path="matters" element={withEnabledModule("active-matters", <MattersPage />)} />
            <Route path="execution" element={withEnabledModule("execution", <ExecutionPage />)} />
            <Route path="execution/:slug" element={withEnabledModule("execution", <ExecutionTeamPage />)} />
            <Route path="tasks" element={withEnabledModule("tasks", <TasksPage />)} />
            <Route path="tasks/:slug/distribuidor" element={withEnabledModule("tasks", <TaskDistributorPage />)} />
            <Route path="tasks/:slug/adicionales" element={withEnabledModule("tasks", <TaskAdditionalTasksPage />)} />
            <Route path="tasks/:slug/terminos" element={withEnabledModule("tasks", <TaskTermsPage />)} />
            <Route path="tasks/:slug/terminos-recurrentes" element={withEnabledModule("tasks", <TaskTermsPage />)} />
            <Route path="tasks/:slug/:tableId" element={withEnabledModule("tasks", <TaskLegacyTablePage />)} />
            <Route path="tasks/:slug" element={withEnabledModule("tasks", <TasksTeamPage />)} />
            <Route path="sales" element={withEnabledModule("sales", <SalesPage />)} />
            <Route path="kpis" element={withEnabledModule("kpis", <KpisPage />)} />
            <Route path="finances" element={withEnabledModule("finances", <FinancesPage />)} />
            <Route path="budget-planning" element={withEnabledModule("budget-planning", <BudgetPlanningPage />)} />
            <Route path="general-expenses" element={withEnabledModule("general-expenses", <GeneralExpensesPage />)} />
            <Route path="commissions" element={withEnabledModule("commissions", <CommissionsPage />)} />
            <Route path="general-supervision" element={withEnabledModule("general-supervision", <GeneralSupervisionPage />)} />
            <Route path="rusconi-intelligence" element={withEnabledModule("rusconi-intelligence", <RusconiIntelligencePage />)} />
            <Route path="matter-catalog" element={withEnabledModule("matter-catalog", <MatterCatalogPage />)} />
            <Route path="internal-contracts" element={withEnabledModule("internal-contracts", <InternalContractsPage />)} />
            <Route path="labor-file" element={withEnabledModule("labor-file", <LaborFilesPage />)} />
            <Route path="daily-documents" element={withEnabledModule("daily-documents", <DailyDocumentsPage />)} />
            <Route path="third-party-documents" element={withEnabledModule("third-party-documents", <ThirdPartyDocumentsPage />)} />
            <Route path="guidelines-manuals" element={withEnabledModule("guidelines-manuals", <GuidelinesManualsPage />)} />
            <Route path="holidays" element={withEnabledModule("holidays", <HolidaysPage />)} />
            <Route path="users" element={<UsersPage />} />
            <Route path="my-account" element={<MyAccountPage />} />
            <Route path="module-enablement" element={<ModuleEnablementPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
