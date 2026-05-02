import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { apiGet } from "../../api/http-client";
import { buildDistributionHistoryTaskNameMap, isTrackingTermEnabled, resolveHistoryTaskName, resolveTrackingTaskName, usesPresentationAndTermDates } from "./task-display-utils";
import { getAdjacentLegacyTaskTable, getLegacyTaskTable, LEGACY_TASK_MODULE_BY_SLUG } from "./task-legacy-config";
import { findLegacyTableByAnyName } from "./task-distribution-utils";
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function todayInput() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function currentMonthInput() {
    return todayInput().slice(0, 7);
}
function getRowDate(record) {
    return toDateInput(record.dueDate || record.termDate);
}
function getPresentationDate(record) {
    return toDateInput(record.dueDate);
}
function getCompletionDate(record) {
    return toDateInput(record.completedAt || record.updatedAt);
}
function getCompletionMonth(record) {
    return getCompletionDate(record).slice(0, 7);
}
function findTrackingTable(moduleConfig, record) {
    return findLegacyTableByAnyName(moduleConfig, record.tableCode)
        ?? findLegacyTableByAnyName(moduleConfig, record.sourceTable);
}
function hasCompletedStatus(record) {
    return record.status === "presentado" || record.status === "concluida";
}
function formatDisplayDate(value) {
    const date = toDateInput(value);
    if (!date) {
        return "-";
    }
    const [year, month, day] = date.split("-");
    return `${day}/${month}/${year}`;
}
function isRowRed(record, tab, showDateColumn, table, taskNamesByRecordId, historyFallback = "") {
    if (tab.isCompleted) {
        return false;
    }
    const taskName = resolveTrackingTaskName(record, table, taskNamesByRecordId, historyFallback);
    if (usesPresentationAndTermDates(table)) {
        const presentationDate = toDateInput(record.dueDate);
        const termDate = toDateInput(record.termDate);
        const termEnabled = isTrackingTermEnabled(record, table);
        return !taskName
            || !record.responsible
            || !presentationDate
            || presentationDate <= todayInput()
            || (termEnabled && (!termDate || termDate <= todayInput()));
    }
    const dueDate = getRowDate(record);
    return !taskName || !record.responsible || (showDateColumn && !dueDate) || (Boolean(dueDate) && dueDate <= todayInput());
}
export function TaskLegacyTablePage() {
    const { slug, tableId } = useParams();
    const navigate = useNavigate();
    const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
    const tableConfig = moduleConfig ? getLegacyTaskTable(moduleConfig, tableId) : undefined;
    const [records, setRecords] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTabKey, setActiveTabKey] = useState(null);
    const [completedMonth, setCompletedMonth] = useState(currentMonthInput());
    const activeTab = tableConfig?.tabs.find((tab) => tab.key === activeTabKey) ?? tableConfig?.tabs[0];
    useEffect(() => {
        if (!moduleConfig || !tableConfig) {
            return;
        }
        setActiveTabKey(tableConfig.tabs[0]?.key ?? null);
    }, [moduleConfig, tableConfig]);
    async function loadRecords() {
        if (!moduleConfig || !tableConfig) {
            return;
        }
        setLoading(true);
        try {
            const [loaded, loadedHistory] = await Promise.all([
                apiGet(`/tasks/tracking-records?moduleId=${moduleConfig.moduleId}`),
                apiGet(`/tasks/distributions?moduleId=${moduleConfig.moduleId}`)
            ]);
            setRecords(loaded);
            setHistory(loadedHistory);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadRecords();
    }, [moduleConfig, tableConfig]);
    const taskNamesByRecordId = useMemo(() => buildDistributionHistoryTaskNameMap(history), [history]);
    const visibleRecords = useMemo(() => {
        if (!activeTab || !tableConfig) {
            return [];
        }
        return records.filter((record) => {
            if (!moduleConfig || findTrackingTable(moduleConfig, record)?.slug !== tableConfig.slug) {
                return false;
            }
            if (activeTab.stage) {
                if (activeTab.isCompleted) {
                    const isCompleted = record.workflowStage === activeTab.stage || hasCompletedStatus(record);
                    return isCompleted && getCompletionMonth(record) === completedMonth;
                }
                return record.status !== "presentado" && record.workflowStage === activeTab.stage;
            }
            if (activeTab.isCompleted) {
                return hasCompletedStatus(record) && getCompletionMonth(record) === completedMonth;
            }
            return record.status === (activeTab.status ?? "pendiente");
        });
    }, [activeTab, completedMonth, moduleConfig, records, tableConfig]);
    if (!moduleConfig || !tableConfig || !activeTab) {
        return _jsx(Navigate, { to: "/app/tasks", replace: true });
    }
    const previous = getAdjacentLegacyTaskTable(moduleConfig, tableConfig.slug, -1);
    const next = getAdjacentLegacyTaskTable(moduleConfig, tableConfig.slug, 1);
    const showDateColumn = tableConfig.showDateColumn !== false;
    const showTermColumn = usesPresentationAndTermDates(tableConfig);
    const isCompletedMonthView = activeTab.isCompleted;
    const tableColumnCount = 6 + (showDateColumn ? 1 : 0) + (tableConfig.showReportedPeriod ? 1 : 0) + (showTermColumn ? 1 : 0);
    return (_jsxs("section", { className: "page-stack tasks-legacy-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "execution-page-topline", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}`), children: "Volver al dashboard" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/${previous.slug}`), children: "Ir a tabla anterior" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/${next.slug}`), children: "Ir a siguiente tabla" })] }), _jsx("h2", { children: tableConfig.title }), _jsx("p", { className: "muted", children: "Tabla de seguimiento operativa. Las filas pendientes se marcan en rojo si falta tarea, responsable, fecha requerida o si la fecha esta vencida." })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "tasks-legacy-toolbar", children: [_jsx("button", { type: "button", className: "primary-action-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/distribuidor`), children: "Abrir Manager de tareas" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/terminos`), children: "Ver terminos" })] }), _jsx("p", { className: "muted matter-table-caption", children: "Los registros nuevos se crean desde el Selector de Tareas en Ejecucion; la informacion, etapas y bajas se controlan desde Tareas activas del Manager de tareas." }), _jsx("div", { className: "tasks-legacy-tabs", children: tableConfig.tabs.map((tab) => (_jsx("button", { type: "button", className: tab.key === activeTab.key ? "is-active" : "", onClick: () => setActiveTabKey(tab.key), children: tab.label }, tab.key))) }), isCompletedMonthView ? (_jsxs("div", { className: "tasks-legacy-month-filter", children: [_jsxs("label", { className: "form-field tasks-legacy-month-field", children: [_jsx("span", { children: "Mes calendario" }), _jsx("input", { type: "month", value: completedMonth, onChange: (event) => setCompletedMonth(event.target.value || currentMonthInput()) })] }), _jsx("p", { className: "muted", children: "Vista historica mensual: muestra los registros concluidos durante el mes seleccionado." })] })) : null, _jsx("div", { className: "table-scroll tasks-legacy-table-wrap", children: _jsxs("table", { className: `data-table tasks-legacy-table${showTermColumn ? " tasks-legacy-table-with-term" : ""}`, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Proceso especifico" }), _jsx("th", { children: "ID Asunto" }), _jsx("th", { className: "tasks-legacy-task-column", children: "Tarea" }), _jsx("th", { children: "Responsable" }), showDateColumn ? _jsx("th", { children: activeTab.isCompleted ? "Fecha completada" : tableConfig.dateLabel }) : null, tableConfig.showReportedPeriod ? _jsx("th", { children: tableConfig.reportedPeriodLabel ?? "Mes reportado" }) : null, showTermColumn ? _jsx("th", { children: tableConfig.termDateLabel ?? "Término" }) : null] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: tableColumnCount, className: "centered-inline-message", children: "Cargando registros..." }) })) : visibleRecords.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: tableColumnCount, className: "centered-inline-message", children: isCompletedMonthView ? "No hay registros concluidos en el mes seleccionado." : "No hay registros en esta seccion." }) })) : (visibleRecords.map((record) => {
                                        const historyTaskName = resolveHistoryTaskName(record, history, tableConfig);
                                        const red = isRowRed(record, activeTab, showDateColumn, tableConfig, taskNamesByRecordId, historyTaskName);
                                        const green = !red && !activeTab.isCompleted;
                                        const taskName = resolveTrackingTaskName(record, tableConfig, taskNamesByRecordId, historyTaskName);
                                        return (_jsxs("tr", { className: red ? "tasks-legacy-row-red" : green ? "tasks-legacy-row-green" : undefined, children: [_jsx("td", { children: record.clientName || "-" }), _jsx("td", { children: record.subject || "-" }), _jsx("td", { children: _jsx("span", { className: "tasks-legacy-process-pill", children: record.specificProcess || "N/A" }) }), _jsx("td", { children: record.matterIdentifier || record.matterNumber || "-" }), _jsx("td", { className: "tasks-legacy-task-cell", children: _jsx("div", { className: "tasks-legacy-task-readonly", children: taskName || "-" }) }), _jsx("td", { className: "tasks-legacy-responsible-cell", children: _jsx("div", { className: "tasks-legacy-readonly-value", children: record.responsible || "-" }) }), showDateColumn ? (_jsx("td", { children: _jsx("div", { className: "tasks-legacy-readonly-value tasks-legacy-date-readonly", children: formatDisplayDate(activeTab.isCompleted ? getCompletionDate(record) : usesPresentationAndTermDates(tableConfig) ? getPresentationDate(record) : getRowDate(record)) }) })) : null, tableConfig.showReportedPeriod ? (_jsx("td", { children: _jsx("div", { className: "tasks-legacy-readonly-value tasks-legacy-date-readonly", children: record.reportedMonth || "-" }) })) : null, showTermColumn ? (_jsx("td", { children: _jsx("div", { className: "tasks-legacy-readonly-value tasks-legacy-date-readonly", children: isTrackingTermEnabled(record, tableConfig) ? formatDisplayDate(record.termDate) : "-" }) })) : null] }, record.id));
                                    })) })] }) })] })] }));
}
