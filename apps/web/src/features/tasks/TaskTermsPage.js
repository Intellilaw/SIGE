import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiGet } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { EXECUTION_MODULE_BY_SLUG, getVisibleExecutionModules } from "../execution/execution-config";
import { hasMeaningfulTaskLabel, isTrackingTermEnabled, resolveTrackingTaskName, usesPresentationAndTermDates } from "./task-display-utils";
import { LEGACY_TASK_MODULE_BY_SLUG } from "./task-legacy-config";
import { findLegacyTableByAnyName } from "./task-distribution-utils";
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function todayInput() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function findTrackingTable(moduleConfig, record) {
    return findLegacyTableByAnyName(moduleConfig, record.tableCode)
        ?? findLegacyTableByAnyName(moduleConfig, record.sourceTable);
}
function isCompletedRecord(table, record) {
    if (record.status === "presentado" || record.status === "concluida") {
        return true;
    }
    return table?.mode === "workflow" && record.workflowStage >= table.tabs.length;
}
function getManagerTermDate(table, record) {
    const explicitTerm = toDateInput(record.termDate);
    if (usesPresentationAndTermDates(table)) {
        return isTrackingTermEnabled(record, table) ? explicitTerm : "";
    }
    if (explicitTerm) {
        return explicitTerm;
    }
    if (table && !usesPresentationAndTermDates(table) && (table.autoTerm || table.termManagedDate)) {
        return toDateInput(record.dueDate);
    }
    return "";
}
function isManagerTermRecord(moduleConfig, record) {
    const table = findTrackingTable(moduleConfig, record);
    if (!table) {
        return false;
    }
    if (usesPresentationAndTermDates(table)) {
        return !isCompletedRecord(table, record) && isTrackingTermEnabled(record, table);
    }
    return !isCompletedRecord(table, record)
        && Boolean(getManagerTermDate(table, record))
        && Boolean(table.autoTerm || table.termManagedDate);
}
function getLinkedTerm(terms, record) {
    return terms.find((term) => term.id === record.termId || term.sourceRecordId === record.id);
}
function termFromTrackingRecord(moduleConfig, record, linkedTerm) {
    const table = findTrackingTable(moduleConfig, record);
    const taskName = resolveTrackingTaskName(record, table, undefined, record.eventName);
    return {
        ...(linkedTerm ?? {
            id: `manager-term-${record.id}`,
            verification: {},
            data: record.data,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        }),
        moduleId: record.moduleId,
        sourceTable: record.sourceTable,
        sourceRecordId: record.id,
        matterId: record.matterId,
        matterNumber: record.matterNumber,
        clientNumber: record.clientNumber,
        clientName: record.clientName,
        subject: record.subject,
        specificProcess: record.specificProcess,
        matterIdentifier: record.matterIdentifier,
        eventName: taskName || record.eventName || "Termino",
        pendingTaskLabel: taskName || undefined,
        responsible: record.responsible,
        dueDate: record.dueDate,
        termDate: getManagerTermDate(table, record),
        status: record.status,
        recurring: false,
        reportedMonth: record.reportedMonth,
        deletedAt: record.deletedAt
    };
}
function sortTermRows(left, right) {
    const leftDate = toDateInput(left.term.termDate);
    const rightDate = toDateInput(right.term.termDate);
    if (!leftDate && !rightDate) {
        return left.term.clientName.localeCompare(right.term.clientName) || left.term.createdAt.localeCompare(right.term.createdAt);
    }
    if (!leftDate) {
        return 1;
    }
    if (!rightDate) {
        return -1;
    }
    return leftDate.localeCompare(rightDate) || left.term.clientName.localeCompare(right.term.clientName);
}
export function TaskTermsPage() {
    const { slug } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
    const executionModule = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
    const canAccessModule = Boolean(executionModule && getVisibleExecutionModules(user).some((module) => module.moduleId === executionModule.moduleId));
    const recurrentMode = location.pathname.endsWith("/terminos-recurrentes");
    const [terms, setTerms] = useState([]);
    const [trackingRecords, setTrackingRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    async function loadTerms() {
        if (!moduleConfig || !canAccessModule) {
            return;
        }
        setLoading(true);
        try {
            const [loadedTerms, loadedTrackingRecords] = await Promise.all([
                apiGet(`/tasks/terms?moduleId=${moduleConfig.moduleId}`),
                apiGet(`/tasks/tracking-records?moduleId=${moduleConfig.moduleId}`)
            ]);
            setTerms(loadedTerms);
            setTrackingRecords(loadedTrackingRecords);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadTerms();
    }, [canAccessModule, moduleConfig]);
    const visibleTermRows = useMemo(() => {
        if (!moduleConfig) {
            return [];
        }
        const rows = [];
        if (!recurrentMode) {
            trackingRecords.forEach((record) => {
                if (!isManagerTermRecord(moduleConfig, record)) {
                    return;
                }
                const linkedTerm = getLinkedTerm(terms, record);
                const term = termFromTrackingRecord(moduleConfig, record, linkedTerm);
                rows.push({
                    key: `manager-${record.id}`,
                    term,
                    sourceRecord: record,
                    virtual: !linkedTerm
                });
            });
            return rows.sort(sortTermRows);
        }
        terms.forEach((term) => {
            if (term.recurring !== recurrentMode) {
                return;
            }
            rows.push({
                key: `term-${term.id}`,
                term,
                virtual: false
            });
        });
        return rows.sort(sortTermRows);
    }, [moduleConfig, recurrentMode, terms, trackingRecords]);
    if (!moduleConfig || !executionModule || !canAccessModule) {
        return _jsx(Navigate, { to: "/app/tasks", replace: true });
    }
    return (_jsxs("section", { className: "page-stack tasks-legacy-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "execution-page-topline", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}`), children: "Volver al dashboard" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/distribuidor`), children: "Abrir Manager de tareas" })] }), _jsxs("h2", { children: [recurrentMode ? "Terminos recurrentes" : "Terminos", " (", moduleConfig.label, ")"] }), _jsx("p", { className: "muted", children: "Tabla maestra de terminos. Refleja los terminos activos del Manager de tareas; las filas quedan en rojo si falta responsable, falta fecha de termino o la fecha esta vencida. Las verificaciones se actualizan exclusivamente desde el Manager de tareas." })] }), _jsxs("section", { className: "panel", children: [moduleConfig.hasRecurringTerms && !recurrentMode ? (_jsx("div", { className: "tasks-legacy-toolbar", children: _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/terminos-recurrentes`), children: "Ver terminos recurrentes" }) })) : null, _jsx("div", { className: "table-scroll tasks-legacy-table-wrap", children: _jsxs("table", { className: "data-table tasks-legacy-table tasks-terms-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Proceso especifico" }), _jsx("th", { children: "ID Asunto" }), _jsx("th", { children: moduleConfig.termEventLabel }), _jsx("th", { children: "Responsable" }), _jsx("th", { children: moduleConfig.termDateLabel })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "centered-inline-message", children: "Cargando terminos..." }) })) : visibleTermRows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "centered-inline-message", children: "No hay terminos en esta seccion." }) })) : (visibleTermRows.map((row) => {
                                        const { term } = row;
                                        const eventName = hasMeaningfulTaskLabel(term.eventName)
                                            ? term.eventName
                                            : hasMeaningfulTaskLabel(term.pendingTaskLabel)
                                                ? term.pendingTaskLabel
                                                : "Termino";
                                        const date = toDateInput(term.termDate);
                                        const completed = term.status === "concluida" || term.status === "presentado";
                                        const red = !completed && (!term.responsible || !date || date <= todayInput());
                                        const green = !red && completed;
                                        return (_jsxs("tr", { className: red ? "tasks-legacy-row-red" : green ? "tasks-legacy-row-green" : undefined, children: [_jsx("td", { children: term.clientName || "-" }), _jsx("td", { children: term.subject || "-" }), _jsx("td", { children: _jsx("span", { className: "tasks-legacy-process-pill", children: term.specificProcess || "N/A" }) }), _jsx("td", { children: term.matterIdentifier || term.matterNumber || "-" }), _jsx("td", { children: _jsxs("div", { className: "tasks-legacy-task-readonly", children: [term.recurring ? "[Recurrente] " : "", eventName] }) }), _jsx("td", { children: _jsx("div", { className: "tasks-legacy-readonly-value", children: term.responsible || "-" }) }), _jsx("td", { children: _jsx("div", { className: "tasks-legacy-readonly-value tasks-legacy-date-readonly", children: toDateInput(term.termDate) || "-" }) })] }, row.key));
                                    })) })] }) })] })] }));
}
