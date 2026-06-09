import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { EntryPage } from "./features/auth/EntryPage";
import { LoginPage } from "./features/auth/LoginPage";
import { ManagerSsoBridgePage } from "./features/auth/ManagerSsoBridgePage";
import { PasswordAssistancePage } from "./features/auth/PasswordAssistancePage";
import { PasswordResetPage } from "./features/auth/PasswordResetPage";
import { DailyDocumentsPage } from "./features/modules/DailyDocumentsPage";
import { ExternalContractsPage } from "./features/modules/ExternalContractsPage";
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
import { MobileExecutionIndexPage, MobileExecutionTeamPage, MobileDashboardIndexPage, MobileDashboardModulePage, MobileFinancesPage, MobileGeneralExpensesPage, MobileGeneralSupervisionPage, MobileHomePage, MobileKpisPage, MobileLeadsPage, MobileProtectedLayout, MobileTrackingIndexPage, MobileTrackingModulePage, MobileTrackingTablePage } from "./features/mobile/MobileApp";
function ProtectedLayout() {
    const { user, loading } = useAuth();
    if (loading) {
        return _jsx("div", { className: "centered-message", children: "Loading SIGE..." });
    }
    if (!user) {
        return _jsx(Navigate, { to: "/", replace: true });
    }
    return (_jsx(ModuleAvailabilityProvider, { children: _jsx(AppShell, {}) }));
}
function EnabledModuleRoute({ moduleId, children }) {
    const { isModuleEnabled, loading } = useModuleAvailability();
    if (loading) {
        return _jsx("div", { className: "centered-message", children: "Cargando modulos..." });
    }
    if (!isModuleEnabled(moduleId)) {
        return _jsx(Navigate, { to: "/app", replace: true });
    }
    return _jsx(_Fragment, { children: children });
}
function withEnabledModule(moduleId, element) {
    return _jsx(EnabledModuleRoute, { moduleId: moduleId, children: element });
}
export default function App() {
    return (_jsx(AuthProvider, { children: _jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(EntryPage, {}) }), _jsx(Route, { path: "/intranet-login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/intranet-password-help", element: _jsx(PasswordAssistancePage, {}) }), _jsx(Route, { path: "/intranet-reset-password", element: _jsx(PasswordResetPage, {}) }), _jsx(Route, { path: "/login", element: _jsx(Navigate, { to: "/", replace: true }) }), _jsxs(Route, { path: "/mobile", element: _jsx(MobileProtectedLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(MobileHomePage, {}) }), _jsx(Route, { path: "leads", element: _jsx(MobileLeadsPage, {}) }), _jsx(Route, { path: "finances", element: _jsx(MobileFinancesPage, {}) }), _jsx(Route, { path: "general-expenses", element: _jsx(MobileGeneralExpensesPage, {}) }), _jsx(Route, { path: "kpis", element: _jsx(MobileKpisPage, {}) }), _jsx(Route, { path: "general-supervision", element: _jsx(MobileGeneralSupervisionPage, {}) }), _jsx(Route, { path: "execution", element: _jsx(MobileExecutionIndexPage, {}) }), _jsx(Route, { path: "execution/:slug", element: _jsx(MobileExecutionTeamPage, {}) }), _jsx(Route, { path: "dashboard", element: _jsx(MobileDashboardIndexPage, {}) }), _jsx(Route, { path: "dashboard/:slug", element: _jsx(MobileDashboardModulePage, {}) }), _jsx(Route, { path: "tracking", element: _jsx(MobileTrackingIndexPage, {}) }), _jsx(Route, { path: "tracking/:slug", element: _jsx(MobileTrackingModulePage, {}) }), _jsx(Route, { path: "tracking/:slug/:tableId", element: _jsx(MobileTrackingTablePage, {}) })] }), _jsxs(Route, { path: "/app", element: _jsx(ProtectedLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "clients", element: withEnabledModule("clients", _jsx(ClientsPage, {})) }), _jsx(Route, { path: "quotes", element: withEnabledModule("quotes", _jsx(QuotesPage, {})) }), _jsx(Route, { path: "leads", element: withEnabledModule("lead-tracking", _jsx(LeadsPage, {})) }), _jsx(Route, { path: "matters", element: withEnabledModule("active-matters", _jsx(MattersPage, {})) }), _jsx(Route, { path: "execution", element: withEnabledModule("execution", _jsx(ExecutionPage, {})) }), _jsx(Route, { path: "execution/:slug", element: withEnabledModule("execution", _jsx(ExecutionTeamPage, {})) }), _jsx(Route, { path: "tasks", element: withEnabledModule("tasks", _jsx(TasksPage, {})) }), _jsx(Route, { path: "tasks/:slug/distribuidor", element: withEnabledModule("tasks", _jsx(TaskDistributorPage, {})) }), _jsx(Route, { path: "tasks/:slug/adicionales", element: withEnabledModule("tasks", _jsx(TaskAdditionalTasksPage, {})) }), _jsx(Route, { path: "tasks/:slug/terminos", element: withEnabledModule("tasks", _jsx(TaskTermsPage, {})) }), _jsx(Route, { path: "tasks/:slug/terminos-recurrentes", element: withEnabledModule("tasks", _jsx(TaskTermsPage, {})) }), _jsx(Route, { path: "tasks/:slug/:tableId", element: withEnabledModule("tasks", _jsx(TaskLegacyTablePage, {})) }), _jsx(Route, { path: "tasks/:slug", element: withEnabledModule("tasks", _jsx(TasksTeamPage, {})) }), _jsx(Route, { path: "sales", element: withEnabledModule("sales", _jsx(SalesPage, {})) }), _jsx(Route, { path: "kpis", element: withEnabledModule("kpis", _jsx(KpisPage, {})) }), _jsx(Route, { path: "finances", element: withEnabledModule("finances", _jsx(FinancesPage, {})) }), _jsx(Route, { path: "budget-planning", element: withEnabledModule("budget-planning", _jsx(BudgetPlanningPage, {})) }), _jsx(Route, { path: "general-expenses", element: withEnabledModule("general-expenses", _jsx(GeneralExpensesPage, {})) }), _jsx(Route, { path: "commissions", element: withEnabledModule("commissions", _jsx(CommissionsPage, {})) }), _jsx(Route, { path: "general-supervision", element: withEnabledModule("general-supervision", _jsx(GeneralSupervisionPage, {})) }), _jsx(Route, { path: "rusconi-intelligence", element: withEnabledModule("rusconi-intelligence", _jsx(RusconiIntelligencePage, {})) }), _jsx(Route, { path: "matter-catalog", element: withEnabledModule("matter-catalog", _jsx(MatterCatalogPage, {})) }), _jsx(Route, { path: "brief-manager", element: withEnabledModule("brief-manager", _jsx(ManagerSsoBridgePage, {})) }), _jsx(Route, { path: "external-contracts", element: withEnabledModule("external-contracts", _jsx(ExternalContractsPage, {})) }), _jsx(Route, { path: "internal-contracts", element: withEnabledModule("internal-contracts", _jsx(InternalContractsPage, {})) }), _jsx(Route, { path: "labor-file", element: withEnabledModule("labor-file", _jsx(LaborFilesPage, {})) }), _jsx(Route, { path: "daily-documents", element: withEnabledModule("daily-documents", _jsx(DailyDocumentsPage, {})) }), _jsx(Route, { path: "third-party-documents", element: withEnabledModule("third-party-documents", _jsx(ThirdPartyDocumentsPage, {})) }), _jsx(Route, { path: "guidelines-manuals", element: withEnabledModule("guidelines-manuals", _jsx(GuidelinesManualsPage, {})) }), _jsx(Route, { path: "holidays", element: withEnabledModule("holidays", _jsx(HolidaysPage, {})) }), _jsx(Route, { path: "users", element: _jsx(UsersPage, {}) }), _jsx(Route, { path: "my-account", element: _jsx(MyAccountPage, {}) }), _jsx(Route, { path: "module-enablement", element: _jsx(ModuleEnablementPage, {}) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }) }));
}
