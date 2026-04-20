import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { getAdjacentLegacyTaskTable, getLegacyTaskTable, LEGACY_TASK_MODULE_BY_SLUG } from "./task-legacy-config";
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function todayInput() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function getRowDate(record) {
    return toDateInput(record.dueDate || record.termDate);
}
function isRowRed(record, tab, showDateColumn) {
    if (tab.isCompleted) {
        return false;
    }
    const dueDate = getRowDate(record);
    return !record.taskName || !record.responsible || (showDateColumn && !dueDate) || (Boolean(dueDate) && dueDate <= todayInput());
}
export function TaskLegacyTablePage() {
    const { slug, tableId } = useParams();
    const navigate = useNavigate();
    const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
    const tableConfig = moduleConfig ? getLegacyTaskTable(moduleConfig, tableId) : undefined;
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTabKey, setActiveTabKey] = useState(null);
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
            const loaded = await apiGet(`/tasks/tracking-records?moduleId=${moduleConfig.moduleId}&tableCode=${tableConfig.slug}`);
            setRecords(loaded);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadRecords();
    }, [moduleConfig, tableConfig]);
    const visibleRecords = useMemo(() => {
        if (!activeTab || !tableConfig) {
            return [];
        }
        return records.filter((record) => {
            if (activeTab.stage) {
                if (activeTab.isCompleted) {
                    return record.workflowStage === activeTab.stage || record.status === "presentado";
                }
                return record.status !== "presentado" && record.workflowStage === activeTab.stage;
            }
            return record.status === (activeTab.status ?? "pendiente");
        });
    }, [activeTab, records, tableConfig]);
    async function patchRecord(record, patch) {
        const updated = await apiPatch(`/tasks/tracking-records/${record.id}`, patch);
        setRecords((current) => current.map((candidate) => candidate.id === record.id ? updated : candidate));
        if (record.termId && ("dueDate" in patch || "termDate" in patch || "responsible" in patch)) {
            await apiPatch(`/tasks/terms/${record.termId}`, {
                dueDate: patch.dueDate,
                termDate: patch.termDate ?? patch.dueDate,
                responsible: patch.responsible
            });
        }
    }
    async function handleDateChange(record, value) {
        await patchRecord(record, {
            dueDate: value || null,
            termDate: tableConfig?.termManagedDate ? value || null : record.termDate ?? null
        });
    }
    async function handleAdvance(record) {
        if (!tableConfig) {
            return;
        }
        if (tableConfig.mode === "workflow") {
            const finalStage = tableConfig.tabs.length;
            const nextStage = Math.min((record.workflowStage || 1) + 1, finalStage);
            await patchRecord(record, {
                workflowStage: nextStage,
                status: nextStage >= finalStage ? "presentado" : "pendiente",
                completedAt: nextStage >= finalStage ? new Date().toISOString() : undefined
            });
            return;
        }
        await patchRecord(record, {
            status: "presentado",
            completedAt: new Date().toISOString()
        });
    }
    async function handleReopen(record) {
        const finalStage = tableConfig?.tabs.length ?? 1;
        await patchRecord(record, {
            status: "pendiente",
            completedAt: null,
            workflowStage: tableConfig?.mode === "workflow" ? Math.max(1, finalStage - 1) : record.workflowStage
        });
    }
    async function handleDelete(record) {
        await apiDelete(`/tasks/tracking-records/${record.id}`);
        setRecords((current) => current.filter((candidate) => candidate.id !== record.id));
    }
    async function handleManualAdd() {
        if (!moduleConfig || !tableConfig) {
            return;
        }
        const created = await apiPost("/tasks/tracking-records", {
            moduleId: moduleConfig.moduleId,
            tableCode: tableConfig.slug,
            sourceTable: tableConfig.sourceTable,
            clientName: "",
            subject: "",
            taskName: "Tarea",
            responsible: moduleConfig.defaultResponsible,
            dueDate: tableConfig.showDateColumn === false ? null : todayInput(),
            termDate: tableConfig.autoTerm ? todayInput() : null,
            status: "pendiente",
            workflowStage: 1
        });
        setRecords((current) => [created, ...current]);
    }
    if (!moduleConfig || !tableConfig || !activeTab) {
        return _jsx(Navigate, { to: "/app/tasks", replace: true });
    }
    const previous = getAdjacentLegacyTaskTable(moduleConfig, tableConfig.slug, -1);
    const next = getAdjacentLegacyTaskTable(moduleConfig, tableConfig.slug, 1);
    const showDateColumn = tableConfig.showDateColumn !== false;
    return (_jsxs("section", { className: "page-stack tasks-legacy-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "execution-page-topline", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}`), children: "Volver al dashboard" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/${previous.slug}`), children: "Ir a tabla anterior" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/${next.slug}`), children: "Ir a siguiente tabla" })] }), _jsx("h2", { children: tableConfig.title }), _jsx("p", { className: "muted", children: "Tabla de seguimiento equivalente a Intranet. Las filas pendientes se marcan en rojo si falta tarea, responsable, fecha requerida o si la fecha esta vencida." })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "tasks-legacy-toolbar", children: [_jsx("button", { type: "button", className: "primary-action-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/distribuidor`), children: "Abrir distribuidor" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/terminos`), children: "Ver terminos" }), _jsx("button", { type: "button", className: "secondary-button", onClick: handleManualAdd, children: "Agregar registro" })] }), _jsx("div", { className: "tasks-legacy-tabs", children: tableConfig.tabs.map((tab) => (_jsx("button", { type: "button", className: tab.key === activeTab.key ? "is-active" : "", onClick: () => setActiveTabKey(tab.key), children: tab.label }, tab.key))) }), _jsx("div", { className: "table-scroll tasks-legacy-table-wrap", children: _jsxs("table", { className: "data-table tasks-legacy-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Proceso especifico" }), _jsx("th", { children: "ID Asunto" }), _jsx("th", { children: "Tarea" }), _jsx("th", { children: "Responsable" }), showDateColumn ? _jsx("th", { children: activeTab.isCompleted ? "Fecha completada" : tableConfig.dateLabel }) : null, tableConfig.showReportedPeriod ? _jsx("th", { children: tableConfig.reportedPeriodLabel ?? "Mes reportado" }) : null, _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 10, className: "centered-inline-message", children: "Cargando registros..." }) })) : visibleRecords.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 10, className: "centered-inline-message", children: "No hay registros en esta seccion." }) })) : (visibleRecords.map((record) => {
                                        const red = isRowRed(record, activeTab, showDateColumn);
                                        const green = !red && !activeTab.isCompleted;
                                        return (_jsxs("tr", { className: red ? "tasks-legacy-row-red" : green ? "tasks-legacy-row-green" : undefined, children: [_jsx("td", { children: record.clientNumber || "-" }), _jsx("td", { children: record.clientName || "-" }), _jsx("td", { children: record.subject || "-" }), _jsx("td", { children: _jsx("span", { className: "tasks-legacy-process-pill", children: record.specificProcess || "N/A" }) }), _jsx("td", { children: record.matterIdentifier || record.matterNumber || "-" }), _jsx("td", { children: _jsx("textarea", { className: "tasks-legacy-textarea", value: record.taskName, onChange: (event) => void patchRecord(record, { taskName: event.target.value }) }) }), _jsx("td", { children: _jsx("input", { className: "tasks-legacy-input", value: record.responsible, onChange: (event) => void patchRecord(record, { responsible: event.target.value }) }) }), showDateColumn ? (_jsx("td", { children: activeTab.isCompleted ? (toDateInput(record.completedAt || record.updatedAt)) : (_jsx("input", { className: "tasks-legacy-input", type: "date", value: getRowDate(record), onChange: (event) => void handleDateChange(record, event.target.value) })) })) : null, tableConfig.showReportedPeriod ? (_jsx("td", { children: _jsx("input", { className: "tasks-legacy-input", type: "month", value: record.reportedMonth ?? "", onChange: (event) => void patchRecord(record, { reportedMonth: event.target.value }) }) })) : null, _jsx("td", { children: _jsxs("div", { className: "tasks-legacy-actions", children: [activeTab.isCompleted ? (_jsx("button", { type: "button", className: "secondary-button", onClick: () => void handleReopen(record), children: "Reabrir" })) : (_jsx("button", { type: "button", className: "secondary-button", onClick: () => void handleAdvance(record), children: tableConfig.mode === "workflow" ? "Avanzar" : "Marcar completada" })), _jsx("button", { type: "button", className: "danger-button", onClick: () => void handleDelete(record), children: "Borrar" })] }) })] }, record.id));
                                    })) })] }) })] })] }));
}
