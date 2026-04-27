import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { LEGACY_TASK_MODULE_BY_SLUG } from "./task-legacy-config";
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function todayInput() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function isYes(value) {
    return ["si", "sí", "yes"].includes((value ?? "").trim().toLowerCase());
}
export function TaskTermsPage() {
    const { slug } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
    const recurrentMode = location.pathname.endsWith("/terminos-recurrentes");
    const [terms, setTerms] = useState([]);
    const [loading, setLoading] = useState(true);
    async function loadTerms() {
        if (!moduleConfig) {
            return;
        }
        setLoading(true);
        try {
            const loaded = await apiGet(`/tasks/terms?moduleId=${moduleConfig.moduleId}`);
            setTerms(loaded);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadTerms();
    }, [moduleConfig]);
    const visibleTerms = useMemo(() => terms.filter((term) => term.recurring === recurrentMode), [recurrentMode, terms]);
    async function patchTerm(term, patch) {
        const updated = await apiPatch(`/tasks/terms/${term.id}`, patch);
        setTerms((current) => current.map((candidate) => candidate.id === term.id ? updated : candidate));
    }
    async function addTerm() {
        if (!moduleConfig) {
            return;
        }
        const verification = Object.fromEntries(moduleConfig.verificationColumns.map((column) => [column.key, "No"]));
        const created = await apiPost("/tasks/terms", {
            moduleId: moduleConfig.moduleId,
            eventName: recurrentMode ? "Termino recurrente" : "Termino",
            responsible: moduleConfig.defaultResponsible,
            dueDate: todayInput(),
            termDate: todayInput(),
            status: "pendiente",
            recurring: recurrentMode,
            verification
        });
        setTerms((current) => [created, ...current]);
    }
    async function deleteTerm(term) {
        await apiDelete(`/tasks/terms/${term.id}`);
        setTerms((current) => current.filter((candidate) => candidate.id !== term.id));
    }
    if (!moduleConfig) {
        return _jsx(Navigate, { to: "/app/tasks", replace: true });
    }
    return (_jsxs("section", { className: "page-stack tasks-legacy-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "execution-page-topline", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}`), children: "Volver al dashboard" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/distribuidor`), children: "Abrir distribuidor" })] }), _jsxs("h2", { children: [recurrentMode ? "Terminos recurrentes" : "Terminos", " (", moduleConfig.label, ")"] }), _jsx("p", { className: "muted", children: "Tabla maestra de terminos. La fila queda en rojo si falta responsable, falta fecha limite, la fecha esta vencida o falta alguna verificacion." })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "tasks-legacy-toolbar", children: [_jsx("button", { type: "button", className: "primary-action-button", onClick: addTerm, children: "Agregar termino" }), moduleConfig.hasRecurringTerms && !recurrentMode ? (_jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/terminos-recurrentes`), children: "Ver terminos recurrentes" })) : null] }), _jsx("div", { className: "table-scroll tasks-legacy-table-wrap", children: _jsxs("table", { className: "data-table tasks-legacy-table tasks-terms-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Proceso especifico" }), _jsx("th", { children: "ID Asunto" }), _jsx("th", { children: moduleConfig.termEventLabel }), _jsx("th", { children: "Responsable" }), _jsx("th", { children: "Fecha Presentar" }), _jsx("th", { children: moduleConfig.termDateLabel }), moduleConfig.verificationColumns.map((column) => _jsx("th", { children: column.label }, column.key)), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 12, className: "centered-inline-message", children: "Cargando terminos..." }) })) : visibleTerms.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 12, className: "centered-inline-message", children: "No hay terminos en esta seccion." }) })) : (visibleTerms.map((term) => {
                                        const missingVerification = moduleConfig.verificationColumns.some((column) => !isYes(term.verification[column.key]));
                                        const date = toDateInput(term.termDate || term.dueDate);
                                        const completed = term.status === "concluida" || term.status === "presentado";
                                        const red = !completed && (!term.responsible || !date || date <= todayInput() || missingVerification);
                                        const green = !red && moduleConfig.verificationColumns.every((column) => isYes(term.verification[column.key]));
                                        return (_jsxs("tr", { className: red ? "tasks-legacy-row-red" : green ? "tasks-legacy-row-green" : undefined, children: [_jsx("td", { children: term.clientNumber || "-" }), _jsx("td", { children: term.clientName || "-" }), _jsx("td", { children: term.subject || "-" }), _jsx("td", { children: _jsx("span", { className: "tasks-legacy-process-pill", children: term.specificProcess || "N/A" }) }), _jsx("td", { children: term.matterIdentifier || term.matterNumber || "-" }), _jsx("td", { children: _jsx("textarea", { className: "tasks-legacy-textarea", value: `${term.recurring ? "[Recurrente] " : ""}${term.eventName}`, onChange: (event) => void patchTerm(term, { eventName: event.target.value.replace("[Recurrente] ", "") }) }) }), _jsx("td", { children: _jsx("input", { className: "tasks-legacy-input", value: term.responsible, onChange: (event) => void patchTerm(term, { responsible: event.target.value }) }) }), _jsx("td", { children: _jsx("input", { className: "tasks-legacy-input", type: "date", value: toDateInput(term.dueDate), onChange: (event) => void patchTerm(term, { dueDate: event.target.value }) }) }), _jsx("td", { children: _jsx("input", { className: "tasks-legacy-input", type: "date", value: toDateInput(term.termDate || term.dueDate), onChange: (event) => void patchTerm(term, { termDate: event.target.value }) }) }), moduleConfig.verificationColumns.map((column) => (_jsx("td", { children: _jsxs("select", { className: "tasks-legacy-input", value: term.verification[column.key] ?? "No", onChange: (event) => void patchTerm(term, {
                                                            verification: {
                                                                ...term.verification,
                                                                [column.key]: event.target.value
                                                            }
                                                        }), children: [_jsx("option", { value: "No", children: "No" }), _jsx("option", { value: "Si", children: "Si" })] }) }, column.key))), _jsx("td", { children: _jsxs("div", { className: "tasks-legacy-actions", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => void patchTerm(term, { status: completed ? "pendiente" : "concluida" }), children: completed ? "Reabrir" : "Concluir" }), _jsx("button", { type: "button", className: "danger-button", onClick: () => void deleteTerm(term), children: "Borrar" })] }) })] }, term.id));
                                    })) })] }) })] })] }));
}
