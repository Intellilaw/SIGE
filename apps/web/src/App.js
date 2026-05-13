import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
import { MobileExecutionIndexPage, MobileExecutionTeamPage, MobileFinancesPage, MobileGeneralExpensesPage, MobileHomePage, MobileLeadsPage, MobileProtectedLayout, MobileTrackingIndexPage, MobileTrackingModulePage, MobileTrackingTablePage } from "./features/mobile/MobileApp";
function ProtectedLayout() {
    const { user, loading } = useAuth();
    if (loading) {
        return _jsx("div", { className: "centered-message", children: "Loading SIGE..." });
    }
    if (!user) {
        return _jsx(Navigate, { to: "/", replace: true });
    }
    return _jsx(AppShell, {});
}
function ModuleAccessGate({ moduleId, children }) {
    const { user } = useAuth();
    if (!canReadModule(user, moduleId)) {
        return _jsx(Navigate, { to: "/app", replace: true });
    }
    return children;
}
function protectedModule(moduleId, element) {
    return _jsx(ModuleAccessGate, { moduleId: moduleId, children: element });
}
export default function App() {
    return (_jsx(AuthProvider, { children: _jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(EntryPage, {}) }), _jsx(Route, { path: "/intranet-login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/intranet-password-help", element: _jsx(PasswordAssistancePage, {}) }), _jsx(Route, { path: "/intranet-reset-password", element: _jsx(PasswordResetPage, {}) }), _jsx(Route, { path: "/login", element: _jsx(Navigate, { to: "/", replace: true }) }), _jsxs(Route, { path: "/mobile", element: _jsx(MobileProtectedLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(MobileHomePage, {}) }), _jsx(Route, { path: "leads", element: _jsx(MobileLeadsPage, {}) }), _jsx(Route, { path: "finances", element: _jsx(MobileFinancesPage, {}) }), _jsx(Route, { path: "general-expenses", element: _jsx(MobileGeneralExpensesPage, {}) }), _jsx(Route, { path: "execution", element: _jsx(MobileExecutionIndexPage, {}) }), _jsx(Route, { path: "execution/:slug", element: _jsx(MobileExecutionTeamPage, {}) }), _jsx(Route, { path: "tracking", element: _jsx(MobileTrackingIndexPage, {}) }), _jsx(Route, { path: "tracking/:slug", element: _jsx(MobileTrackingModulePage, {}) }), _jsx(Route, { path: "tracking/:slug/:tableId", element: _jsx(MobileTrackingTablePage, {}) })] }), _jsxs(Route, { path: "/app", element: _jsx(ProtectedLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "clients", element: protectedModule("clients", _jsx(ClientsPage, {})) }), _jsx(Route, { path: "quotes", element: protectedModule("quotes", _jsx(QuotesPage, {})) }), _jsx(Route, { path: "leads", element: protectedModule("lead-tracking", _jsx(LeadsPage, {})) }), _jsx(Route, { path: "matters", element: protectedModule("active-matters", _jsx(MattersPage, {})) }), _jsx(Route, { path: "execution", element: protectedModule("execution", _jsx(ExecutionPage, {})) }), _jsx(Route, { path: "execution/:slug", element: protectedModule("execution", _jsx(ExecutionTeamPage, {})) }), _jsx(Route, { path: "tasks", element: protectedModule("tasks", _jsx(TasksPage, {})) }), _jsx(Route, { path: "tasks/:slug/distribuidor", element: protectedModule("tasks", _jsx(TaskDistributorPage, {})) }), _jsx(Route, { path: "tasks/:slug/adicionales", element: protectedModule("tasks", _jsx(TaskAdditionalTasksPage, {})) }), _jsx(Route, { path: "tasks/:slug/terminos", element: protectedModule("tasks", _jsx(TaskTermsPage, {})) }), _jsx(Route, { path: "tasks/:slug/terminos-recurrentes", element: protectedModule("tasks", _jsx(TaskTermsPage, {})) }), _jsx(Route, { path: "tasks/:slug/:tableId", element: protectedModule("tasks", _jsx(TaskLegacyTablePage, {})) }), _jsx(Route, { path: "tasks/:slug", element: protectedModule("tasks", _jsx(TasksTeamPage, {})) }), _jsx(Route, { path: "kpis", element: protectedModule("kpis", _jsx(ModulePlaceholderPage, { moduleId: "kpis" })) }), _jsx(Route, { path: "finances", element: protectedModule("finances", _jsx(FinancesPage, {})) }), _jsx(Route, { path: "budget-planning", element: protectedModule("budget-planning", _jsx(BudgetPlanningPage, {})) }), _jsx(Route, { path: "general-expenses", element: protectedModule("general-expenses", _jsx(GeneralExpensesPage, {})) }), _jsx(Route, { path: "commissions", element: protectedModule("commissions", _jsx(CommissionsPage, {})) }), _jsx(Route, { path: "general-supervision", element: protectedModule("general-supervision", _jsx(ModulePlaceholderPage, { moduleId: "general-supervision" })) }), _jsx(Route, { path: "matter-catalog", element: protectedModule("matter-catalog", _jsx(MatterCatalogPage, {})) }), _jsx(Route, { path: "brief-manager", element: protectedModule("brief-manager", _jsx(ModulePlaceholderPage, { moduleId: "brief-manager" })) }), _jsx(Route, { path: "internal-contracts", element: protectedModule("internal-contracts", _jsx(InternalContractsPage, {})) }), _jsx(Route, { path: "labor-file", element: protectedModule("labor-file", _jsx(ModulePlaceholderPage, { moduleId: "labor-file" })) }), _jsx(Route, { path: "daily-documents", element: protectedModule("daily-documents", _jsx(DailyDocumentsPage, {})) }), _jsx(Route, { path: "third-party-documents", element: protectedModule("third-party-documents", _jsx(ThirdPartyDocumentsPage, {})) }), _jsx(Route, { path: "holidays", element: protectedModule("holidays", _jsx(ModulePlaceholderPage, { moduleId: "holidays" })) }), _jsx(Route, { path: "users", element: protectedModule("users", _jsx(UsersPage, {})) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }) }));
}
