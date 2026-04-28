import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
const CHANNEL_OPTIONS = [
    { value: "WHATSAPP", label: "WhatsApp" },
    { value: "TELEGRAM", label: "Telegram" },
    { value: "WECHAT", label: "WeChat" },
    { value: "EMAIL", label: "Correo-e" },
    { value: "PHONE", label: "Telefono" }
];
const MONTH_NAMES = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre"
];
function toErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "Ocurrio un error inesperado.";
}
function normalizeText(value) {
    return (value ?? "").trim();
}
function normalizeComparableText(value) {
    return normalizeText(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
function getSearchWords(value) {
    return normalizeComparableText(value).split(/\s+/).filter(Boolean);
}
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function parseDateOnly(value) {
    if (!value) {
        return null;
    }
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) {
        return null;
    }
    return new Date(year, month - 1, day);
}
function formatDate(value) {
    if (!value) {
        return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }
    return date.toLocaleDateString("es-MX");
}
function formatCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2
    }).format(value || 0);
}
function channelLabel(channel) {
    return CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? "WhatsApp";
}
function getQuoteTypeLabel(quote) {
    if (!quote) {
        return "-";
    }
    return quote.quoteType === "RETAINER" ? "Iguala" : "Unico";
}
function sortQuotes(items) {
    return [...items].sort((left, right) => right.quoteNumber.localeCompare(left.quoteNumber, "es-MX", { numeric: true }));
}
function sortActive(items) {
    return [...items].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
function sortHistory(items) {
    return [...items].sort((left, right) => (right.sentToMattersAt ?? "").localeCompare(left.sentToMattersAt ?? ""));
}
function sortMonthly(items) {
    return [...items].sort((left, right) => (right.sentToClientAt ?? "").localeCompare(left.sentToClientAt ?? ""));
}
function replaceLead(items, updated) {
    const exists = items.some((item) => item.id === updated.id);
    if (!exists) {
        return items;
    }
    return items.map((item) => (item.id === updated.id ? updated : item));
}
function upsertLead(items, updated) {
    const exists = items.some((item) => item.id === updated.id);
    if (exists) {
        return items.map((item) => (item.id === updated.id ? updated : item));
    }
    return [...items, updated];
}
function removeLead(items, leadId) {
    return items.filter((item) => item.id !== leadId);
}
function isInSelectedMonth(value, year, month) {
    if (!value) {
        return false;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return false;
    }
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
}
function nextBusinessDay(from) {
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + 1);
    while (candidate.getDay() === 0 || candidate.getDay() === 6) {
        candidate.setDate(candidate.getDate() + 1);
    }
    candidate.setHours(0, 0, 0, 0);
    return candidate;
}
function evaluateLeadRow(lead) {
    const reasons = [];
    if (!normalizeText(lead.clientName) && !normalizeText(lead.prospectName))
        reasons.push("Cliente o prospecto");
    if (!normalizeText(lead.subject))
        reasons.push("Asunto");
    if (!lead.communicationChannel)
        reasons.push("Canal");
    if (!normalizeText(lead.lastInteractionLabel))
        reasons.push("Ultima interaccion");
    if (!toDateInput(lead.lastInteraction))
        reasons.push("Fecha de ultima interaccion");
    if (!normalizeText(lead.nextInteractionLabel))
        reasons.push("Siguiente interaccion");
    if (!toDateInput(lead.nextInteraction))
        reasons.push("Fecha de siguiente interaccion");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = parseDateOnly(toDateInput(lead.nextInteraction));
    const isOverdue = !dueDate || dueDate.getTime() <= today.getTime();
    if (reasons.length > 0 || isOverdue) {
        return {
            tone: "danger",
            title: reasons.length > 0 ? `Faltan datos: ${reasons.join(", ")}` : "Seguimiento vencido o programado para hoy."
        };
    }
    const nextDue = nextBusinessDay(today);
    if (dueDate && dueDate.getTime() === nextDue.getTime()) {
        return {
            tone: "next-business",
            title: "Seguimiento programado para el siguiente dia habil."
        };
    }
    return {
        tone: "normal",
        title: ""
    };
}
function matchesLeadKeywordSearch(lead, searchWords) {
    if (searchWords.length === 0) {
        return true;
    }
    const searchableText = normalizeComparableText([
        lead.commissionAssignee,
        lead.clientName,
        lead.prospectName,
        lead.quoteNumber,
        lead.subject,
        lead.notes,
        lead.lastInteractionLabel,
        lead.nextInteractionLabel,
        channelLabel(lead.communicationChannel)
    ].filter(Boolean).join(" "));
    return searchWords.every((word) => searchableText.includes(word));
}
function matchesLeadClientSearch(lead, searchWords) {
    if (searchWords.length === 0) {
        return true;
    }
    const clientText = normalizeComparableText([lead.clientName, lead.prospectName].filter(Boolean).join(" "));
    return searchWords.every((word) => clientText.includes(word));
}
function buildLeadPatch(lead) {
    return {
        clientId: lead.clientId ?? null,
        clientName: lead.clientName,
        prospectName: normalizeText(lead.prospectName) ? lead.prospectName ?? null : null,
        commissionAssignee: normalizeText(lead.commissionAssignee) ? lead.commissionAssignee ?? null : null,
        quoteId: lead.quoteId ?? null,
        quoteNumber: normalizeText(lead.quoteNumber) ? lead.quoteNumber ?? null : null,
        subject: lead.subject,
        amountMxn: Number(lead.amountMxn || 0),
        communicationChannel: lead.communicationChannel,
        lastInteractionLabel: normalizeText(lead.lastInteractionLabel) ? lead.lastInteractionLabel ?? null : null,
        lastInteraction: toDateInput(lead.lastInteraction) || null,
        nextInteractionLabel: normalizeText(lead.nextInteractionLabel) ? lead.nextInteractionLabel ?? null : null,
        nextInteraction: toDateInput(lead.nextInteraction) || null,
        notes: normalizeText(lead.notes) ? lead.notes ?? null : null
    };
}
export function LeadsPage() {
    const { user } = useAuth();
    const now = new Date();
    const [activeTab, setActiveTab] = useState("leads");
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
    const [activeItems, setActiveItems] = useState([]);
    const [historyItems, setHistoryItems] = useState([]);
    const [monthlyItems, setMonthlyItems] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [commissionShortNames, setCommissionShortNames] = useState([]);
    const [selectedLeads, setSelectedLeads] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState("");
    const [clientSearch, setClientSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const uniqueClients = useMemo(() => [...new Set(quotes.map((quote) => normalizeText(quote.clientName)).filter(Boolean))].sort((left, right) => left.localeCompare(right, "es-MX")), [quotes]);
    const commissionOptions = useMemo(() => [...new Set([
            ...commissionShortNames,
            normalizeText(user?.shortName).toUpperCase()
        ].filter(Boolean))].sort(), [commissionShortNames, user?.shortName]);
    const searchWords = useMemo(() => getSearchWords(searchTerm), [searchTerm]);
    const clientSearchWords = useMemo(() => getSearchWords(clientSearch), [clientSearch]);
    const hasActiveFilters = searchWords.length > 0 || clientSearchWords.length > 0;
    const filteredActiveItems = useMemo(() => activeItems.filter((lead) => matchesLeadKeywordSearch(lead, searchWords) && matchesLeadClientSearch(lead, clientSearchWords)), [activeItems, clientSearchWords, searchWords]);
    const filteredHistoryItems = useMemo(() => historyItems.filter((lead) => matchesLeadKeywordSearch(lead, searchWords) && matchesLeadClientSearch(lead, clientSearchWords)), [historyItems, clientSearchWords, searchWords]);
    const filteredMonthlyItems = useMemo(() => monthlyItems.filter((lead) => matchesLeadKeywordSearch(lead, searchWords) && matchesLeadClientSearch(lead, clientSearchWords)), [monthlyItems, clientSearchWords, searchWords]);
    const sentMonthlyTotal = useMemo(() => filteredMonthlyItems.reduce((sum, item) => sum + Number(item.amountMxn || 0), 0), [filteredMonthlyItems]);
    const contractedMonthlyTotal = useMemo(() => filteredMonthlyItems.reduce((sum, item) => sum + (item.status === "MOVED_TO_MATTERS" ? Number(item.amountMxn || 0) : 0), 0), [filteredMonthlyItems]);
    const selectedYearOptions = useMemo(() => Array.from({ length: 10 }, (_, index) => now.getFullYear() - 5 + index), [now]);
    async function loadBoard() {
        setLoading(true);
        setErrorMessage(null);
        try {
            const [activeRows, historyRows, quoteRows, shortNames] = await Promise.all([
                apiGet("/leads"),
                apiGet("/leads/history"),
                apiGet("/quotes"),
                apiGet("/leads/short-names")
            ]);
            setActiveItems(sortActive(activeRows));
            setHistoryItems(sortHistory(historyRows));
            setQuotes(sortQuotes(quoteRows));
            setCommissionShortNames(shortNames);
            setSelectedLeads(new Set());
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    async function loadMonthly() {
        setLoading(true);
        setErrorMessage(null);
        try {
            const [monthlyRows, quoteRows, shortNames] = await Promise.all([
                apiGet(`/leads/monthly?year=${selectedYear}&month=${selectedMonth}`),
                apiGet("/quotes"),
                apiGet("/leads/short-names")
            ]);
            setMonthlyItems(sortMonthly(monthlyRows));
            setQuotes(sortQuotes(quoteRows));
            setCommissionShortNames(shortNames);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        if (activeTab === "leads") {
            void loadBoard();
            return;
        }
        void loadMonthly();
    }, [activeTab, selectedMonth, selectedYear]);
    function syncLeadAcrossViews(updated) {
        setActiveItems((items) => {
            const next = updated.status === "ACTIVE" ? upsertLead(items, updated) : removeLead(items, updated.id);
            return sortActive(next);
        });
        setHistoryItems((items) => {
            const next = updated.status === "MOVED_TO_MATTERS" && !updated.hiddenFromTracking
                ? upsertLead(items, updated)
                : removeLead(items, updated.id);
            return sortHistory(next);
        });
        setMonthlyItems((items) => {
            const next = isInSelectedMonth(updated.sentToClientAt, selectedYear, selectedMonth)
                ? upsertLead(items, updated)
                : removeLead(items, updated.id);
            return sortMonthly(next);
        });
    }
    function updateActiveLeadLocal(leadId, updater) {
        const current = activeItems.find((item) => item.id === leadId);
        if (!current) {
            return null;
        }
        const updated = updater({ ...current });
        setActiveItems((items) => replaceLead(items, updated));
        return updated;
    }
    async function persistLead(lead) {
        try {
            const updated = await apiPatch(`/leads/${lead.id}`, buildLeadPatch(lead));
            syncLeadAcrossViews(updated);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
            if (activeTab === "leads") {
                await loadBoard();
            }
            else {
                await loadMonthly();
            }
        }
    }
    function findQuoteByNumber(quoteNumber) {
        const cleanQuoteNumber = normalizeText(quoteNumber);
        if (!cleanQuoteNumber) {
            return undefined;
        }
        return quotes.find((quote) => normalizeText(quote.quoteNumber) === cleanQuoteNumber);
    }
    async function handleAddRow() {
        try {
            const created = await apiPost("/leads", {});
            setActiveItems((items) => sortActive([...items, created]));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleDelete(leadId) {
        if (!window.confirm("Seguro que deseas eliminar este registro permanentemente?")) {
            return;
        }
        try {
            await apiDelete(`/leads/${leadId}`);
            setActiveItems((items) => removeLead(items, leadId));
            setHistoryItems((items) => removeLead(items, leadId));
            setMonthlyItems((items) => removeLead(items, leadId));
            setSelectedLeads((items) => {
                const next = new Set(items);
                next.delete(leadId);
                return next;
            });
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleBulkDelete() {
        if (selectedLeads.size === 0) {
            return;
        }
        if (!window.confirm(`Estas seguro de borrar ${selectedLeads.size} leads seleccionados?`)) {
            return;
        }
        try {
            await apiPost("/leads/bulk-delete", { ids: Array.from(selectedLeads) });
            setActiveItems((items) => items.filter((item) => !selectedLeads.has(item.id)));
            setMonthlyItems((items) => items.filter((item) => !selectedLeads.has(item.id)));
            setSelectedLeads(new Set());
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    function handleLeadFieldChange(leadId, field, value) {
        if (field === "quoteNumber") {
            const updated = updateActiveLeadLocal(leadId, (lead) => {
                const cleanValue = normalizeText(value);
                const linkedQuote = findQuoteByNumber(cleanValue);
                lead.quoteNumber = cleanValue || undefined;
                if (linkedQuote) {
                    lead.quoteId = linkedQuote.id;
                    lead.clientId = linkedQuote.clientId;
                    lead.clientName = linkedQuote.clientName;
                    lead.prospectName = undefined;
                    lead.subject = linkedQuote.subject;
                    lead.amountMxn = linkedQuote.totalMxn;
                }
                else {
                    lead.quoteId = undefined;
                    if (!cleanValue) {
                        lead.subject = "";
                        lead.amountMxn = 0;
                    }
                }
                return lead;
            });
            if (updated) {
                void persistLead(updated);
            }
            return;
        }
        if (field === "clientName") {
            updateActiveLeadLocal(leadId, (lead) => {
                lead.clientName = value;
                const linkedQuote = findQuoteByNumber(lead.quoteNumber);
                if (linkedQuote && normalizeText(linkedQuote.clientName) !== normalizeText(value)) {
                    lead.quoteId = undefined;
                    lead.quoteNumber = undefined;
                    lead.subject = "";
                    lead.amountMxn = 0;
                }
                return lead;
            });
            return;
        }
        updateActiveLeadLocal(leadId, (lead) => {
            switch (field) {
                case "prospectName":
                    lead.prospectName = value;
                    break;
                case "commissionAssignee":
                    lead.commissionAssignee = value;
                    break;
                case "subject":
                    lead.subject = value;
                    break;
                case "amountMxn":
                    lead.amountMxn = Number(value || 0);
                    break;
                case "communicationChannel":
                    lead.communicationChannel = value;
                    break;
                case "lastInteractionLabel":
                    lead.lastInteractionLabel = value;
                    break;
                case "lastInteraction":
                    lead.lastInteraction = value || undefined;
                    break;
                case "nextInteractionLabel":
                    lead.nextInteractionLabel = value;
                    break;
                case "nextInteraction":
                    lead.nextInteraction = value || undefined;
                    break;
                case "notes":
                    lead.notes = value;
                    break;
                default:
                    break;
            }
            return lead;
        });
    }
    function handleLeadBlur(leadId) {
        const lead = activeItems.find((item) => item.id === leadId);
        if (!lead) {
            return;
        }
        void persistLead(lead);
    }
    async function handleMarkSentToClient(leadId) {
        const lead = activeItems.find((item) => item.id === leadId);
        if (!lead) {
            return;
        }
        if (!normalizeText(lead.quoteNumber)) {
            window.alert("No se puede marcar como enviada.\n\nDebes asignar un No. de Cotizacion primero.");
            return;
        }
        if (!window.confirm(`Marcar la cotizacion ${lead.quoteNumber} como 'Enviada a cliente' con fecha de HOY?\nEsto hara que sume a las cotizaciones mensuales y aparezca en la Pestana 2.`)) {
            return;
        }
        try {
            const updated = await apiPost(`/leads/${leadId}/mark-sent-to-client`, {});
            syncLeadAcrossViews(updated);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleSendToMatters(leadId) {
        const lead = activeItems.find((item) => item.id === leadId);
        if (!lead) {
            return;
        }
        if (!normalizeText(lead.quoteNumber)) {
            window.alert("No se puede enviar a 'Asuntos Activos'.\n\nDebes asignar un No. de Cotizacion primero.");
            return;
        }
        let existsInMatters = false;
        try {
            const matters = await apiGet("/matters");
            existsInMatters = matters.some((matter) => normalizeText(matter.quoteNumber) === normalizeText(lead.quoteNumber));
        }
        catch {
            existsInMatters = false;
        }
        const confirmMessage = existsInMatters
            ? `La cotizacion ${lead.quoteNumber} YA EXISTE en Asuntos Activos.\nDeseas ACTUALIZAR la informacion en Asuntos Activos y mover este lead al historial?`
            : `Enviar a 'Asuntos Activos'?\nEsto movera el registro a la tabla inferior y creara un nuevo Asunto Activo vinculando la cotizacion ${lead.quoteNumber}.`;
        if (!window.confirm(confirmMessage)) {
            return;
        }
        try {
            await apiPost(`/leads/${leadId}/send-to-matters`, {});
            await loadBoard();
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleReturnToActive(leadId) {
        if (!window.confirm("Regresar este lead a Activos?")) {
            return;
        }
        try {
            await apiPost(`/leads/${leadId}/return-to-active`, {});
            await loadBoard();
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    return (_jsxs("section", { className: "page-stack leads-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Leads" }), _jsx("div", { children: _jsx("h2", { children: "Seguimiento a Leads y Cotizaciones" }) })] }), _jsx("p", { className: "muted", children: "Seguimiento diario de leads, historial de conversion a asuntos y vista mensual de cotizaciones enviadas." })] }), _jsx("section", { className: "panel", children: _jsxs("div", { className: "leads-tabs", role: "tablist", "aria-label": "Vistas de leads", children: [_jsx("button", { type: "button", className: `lead-tab ${activeTab === "leads" ? "is-active" : ""}`, onClick: () => setActiveTab("leads"), children: "1. Leads Activos y Diario" }), _jsx("button", { type: "button", className: `lead-tab ${activeTab === "month" ? "is-active" : ""}`, onClick: () => setActiveTab("month"), children: "2. Vista Mensual de Cotizaciones" })] }) }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, activeTab === "leads" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "1. Leads Activos" }), _jsxs("span", { children: [filteredActiveItems.length, " registros"] })] }), _jsxs("div", { className: "matters-toolbar matters-active-toolbar", children: [_jsxs("div", { className: "matters-toolbar-actions", children: [_jsx("button", { type: "button", className: "primary-button", onClick: () => void handleAddRow(), children: "+ Agregar Fila" }), selectedLeads.size > 0 ? (_jsxs("button", { type: "button", className: "danger-button", onClick: () => void handleBulkDelete(), children: ["Borrar (", selectedLeads.size, ")"] })) : null, _jsx("button", { type: "button", className: "secondary-button", onClick: () => void loadBoard(), children: "Refrescar" })] }), _jsxs("div", { className: "matters-filters leads-search-filters matters-active-search-filters", children: [_jsxs("label", { className: "form-field matters-search-field", children: [_jsx("span", { children: "Buscar por palabra" }), _jsx("input", { type: "text", value: searchTerm, onChange: (event) => setSearchTerm(event.target.value), placeholder: "Cotizacion, asunto, nota, canal..." })] }), _jsxs("label", { className: "form-field matters-search-field", children: [_jsx("span", { children: "Buscador por cliente" }), _jsx("input", { type: "text", value: clientSearch, onChange: (event) => setClientSearch(event.target.value), placeholder: "Buscar palabra del cliente..." })] })] })] })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "1. Leads Activos" }), _jsxs("span", { children: [filteredActiveItems.length, " registros"] })] }), _jsx("div", { className: "lead-table-shell", children: _jsx("div", { className: "lead-table-wrapper", children: _jsxs("table", { className: "lead-table lead-table-active", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "lead-table-checkbox", children: _jsx("input", { type: "checkbox", checked: filteredActiveItems.length > 0 && filteredActiveItems.every((item) => selectedLeads.has(item.id)), onChange: (event) => {
                                                                    if (event.target.checked) {
                                                                        setSelectedLeads((current) => new Set([...current, ...filteredActiveItems.map((item) => item.id)]));
                                                                        return;
                                                                    }
                                                                    setSelectedLeads((current) => {
                                                                        const next = new Set(current);
                                                                        filteredActiveItems.forEach((item) => next.delete(item.id));
                                                                        return next;
                                                                    });
                                                                } }) }), _jsx("th", { children: "Comision cierre" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Prospecto" }), _jsx("th", { children: "No. Cotizacion" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Total" }), _jsx("th", { children: "Canal" }), _jsx("th", { children: "Ultima" }), _jsx("th", { children: "Fecha" }), _jsx("th", { children: "Siguiente" }), _jsx("th", { children: "Fecha" }), _jsx("th", { children: "Notas" }), _jsx("th", { children: "Accion" }), _jsx("th", { children: "Borrar" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 16, className: "centered-inline-message", children: "Cargando leads..." }) })) : filteredActiveItems.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 16, className: "centered-inline-message", children: hasActiveFilters ? "No hay leads que coincidan con la busqueda." : "No hay leads activos." }) })) : (filteredActiveItems.map((item) => {
                                                    const rowState = evaluateLeadRow(item);
                                                    const linkedQuote = findQuoteByNumber(item.quoteNumber);
                                                    return (_jsxs("tr", { className: [
                                                            rowState.tone === "danger" ? "lead-row-danger" : "",
                                                            rowState.tone === "next-business" ? "lead-row-next-business" : "",
                                                            selectedLeads.has(item.id) ? "lead-row-selected" : ""
                                                        ].join(" ").trim(), title: rowState.title, children: [_jsx("td", { className: "lead-table-checkbox", children: _jsx("input", { type: "checkbox", checked: selectedLeads.has(item.id), onChange: (event) => {
                                                                        const next = new Set(selectedLeads);
                                                                        if (event.target.checked)
                                                                            next.add(item.id);
                                                                        else
                                                                            next.delete(item.id);
                                                                        setSelectedLeads(next);
                                                                    } }) }), _jsx("td", { children: _jsxs("select", { className: "lead-cell-input", value: item.commissionAssignee ?? "", onChange: (event) => {
                                                                        const updated = updateActiveLeadLocal(item.id, (lead) => ({
                                                                            ...lead,
                                                                            commissionAssignee: event.target.value
                                                                        }));
                                                                        if (updated)
                                                                            void persistLead(updated);
                                                                    }, children: [_jsx("option", { value: "", children: "Seleccionar" }), commissionOptions.map((shortName) => (_jsx("option", { value: shortName, children: shortName }, shortName)))] }) }), _jsxs("td", { children: [_jsx("input", { className: `lead-cell-input ${item.quoteNumber ? "is-readonly" : ""}`, value: item.clientName, readOnly: Boolean(item.quoteNumber), list: `lead-clients-${item.id}`, onChange: (event) => handleLeadFieldChange(item.id, "clientName", event.target.value), onBlur: () => handleLeadBlur(item.id), title: item.quoteNumber ? "Campo bloqueado por cotizacion vinculada." : "Escribe o elige un cliente." }), _jsx("datalist", { id: `lead-clients-${item.id}`, children: uniqueClients.map((clientName) => (_jsx("option", { value: clientName }, clientName))) })] }), _jsx("td", { children: _jsx("input", { className: `lead-cell-input ${item.quoteNumber ? "is-readonly" : ""}`, value: item.prospectName ?? "", readOnly: Boolean(item.quoteNumber), onChange: (event) => handleLeadFieldChange(item.id, "prospectName", event.target.value), onBlur: () => handleLeadBlur(item.id) }) }), _jsx("td", { children: _jsxs("select", { className: "lead-cell-input", value: item.quoteNumber ?? "", onChange: (event) => handleLeadFieldChange(item.id, "quoteNumber", event.target.value), children: [_jsx("option", { value: "", children: "Manual (Sin cot.)" }), quotes
                                                                            .filter((quote) => !normalizeText(item.clientName) || normalizeText(quote.clientName) === normalizeText(item.clientName))
                                                                            .map((quote) => (_jsxs("option", { value: quote.quoteNumber, children: [quote.quoteNumber, " - ", quote.subject] }, quote.id)))] }) }), _jsx("td", { children: _jsx("span", { className: `lead-type-pill ${linkedQuote?.quoteType === "RETAINER" ? "is-retainer" : ""}`, children: getQuoteTypeLabel(linkedQuote) }) }), _jsx("td", { children: _jsx("input", { className: `lead-cell-input ${item.quoteNumber ? "is-readonly" : ""}`, value: item.subject, readOnly: Boolean(item.quoteNumber), onChange: (event) => handleLeadFieldChange(item.id, "subject", event.target.value), onBlur: () => handleLeadBlur(item.id) }) }), _jsx("td", { children: _jsx("input", { className: `lead-cell-input lead-cell-input-number ${item.quoteNumber ? "is-readonly" : ""}`, type: "number", min: "0", step: "0.01", value: Number(item.amountMxn || 0), readOnly: Boolean(item.quoteNumber), onChange: (event) => handleLeadFieldChange(item.id, "amountMxn", event.target.value), onBlur: () => handleLeadBlur(item.id) }) }), _jsx("td", { children: _jsx("select", { className: "lead-cell-input", value: item.communicationChannel, onChange: (event) => {
                                                                        const updated = updateActiveLeadLocal(item.id, (lead) => ({
                                                                            ...lead,
                                                                            communicationChannel: event.target.value
                                                                        }));
                                                                        if (updated)
                                                                            void persistLead(updated);
                                                                    }, children: CHANNEL_OPTIONS.map((channel) => (_jsx("option", { value: channel.value, children: channel.label }, channel.value))) }) }), _jsx("td", { children: _jsx("input", { className: "lead-cell-input", value: item.lastInteractionLabel ?? "", onChange: (event) => handleLeadFieldChange(item.id, "lastInteractionLabel", event.target.value), onBlur: () => handleLeadBlur(item.id) }) }), _jsx("td", { children: _jsx("input", { className: "lead-cell-input", type: "date", value: toDateInput(item.lastInteraction), onChange: (event) => handleLeadFieldChange(item.id, "lastInteraction", event.target.value), onBlur: () => handleLeadBlur(item.id) }) }), _jsx("td", { children: _jsx("input", { className: "lead-cell-input", value: item.nextInteractionLabel ?? "", onChange: (event) => handleLeadFieldChange(item.id, "nextInteractionLabel", event.target.value), onBlur: () => handleLeadBlur(item.id) }) }), _jsx("td", { children: _jsx("input", { className: "lead-cell-input", type: "date", value: toDateInput(item.nextInteraction), onChange: (event) => handleLeadFieldChange(item.id, "nextInteraction", event.target.value), onBlur: () => handleLeadBlur(item.id) }) }), _jsx("td", { children: _jsx("input", { className: "lead-cell-input", value: item.notes ?? "", onChange: (event) => handleLeadFieldChange(item.id, "notes", event.target.value), onBlur: () => handleLeadBlur(item.id) }) }), _jsx("td", { children: _jsxs("div", { className: "lead-action-stack", children: [_jsx("button", { type: "button", className: "primary-button lead-action-button", disabled: Boolean(item.sentToClientAt), onClick: () => void handleMarkSentToClient(item.id), children: item.sentToClientAt ? "Ya enviada" : "Enviada a cliente" }), _jsx("button", { type: "button", className: "secondary-button lead-action-button", onClick: () => void handleSendToMatters(item.id), children: "Enviar a asuntos activos" })] }) }), _jsx("td", { children: _jsx("button", { type: "button", className: "danger-button lead-delete-button", onClick: () => void handleDelete(item.id), children: "Borrar" }) })] }, item.id));
                                                })) })] }) }) })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "2. Historial (Enviados a Asuntos Activos)" }), _jsxs("span", { children: [filteredHistoryItems.length, " registros"] })] }), _jsx("p", { className: "muted lead-panel-copy", children: "Los registros enviados se ocultan automaticamente despues de 30 dias." }), _jsx("div", { className: "lead-table-shell", children: _jsx("div", { className: "lead-table-wrapper", children: _jsxs("table", { className: "lead-table lead-table-history", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Comision cierre" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Prospecto" }), _jsx("th", { children: "No. Cotizacion" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Total" }), _jsx("th", { children: "Canal" }), _jsx("th", { children: "Ultima interaccion" }), _jsx("th", { children: "Fecha de envio" }), _jsx("th", { children: "Notas" }), _jsx("th", { children: "Accion" }), _jsx("th", { children: "Borrar" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 13, className: "centered-inline-message", children: "Cargando historial..." }) })) : filteredHistoryItems.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 13, className: "centered-inline-message", children: hasActiveFilters ? "No hay registros en historial con ese criterio." : "No hay historial reciente." }) })) : (filteredHistoryItems.map((item) => {
                                                    const linkedQuote = findQuoteByNumber(item.quoteNumber);
                                                    return (_jsxs("tr", { children: [_jsx("td", { children: item.commissionAssignee ?? "-" }), _jsx("td", { children: item.clientName || "-" }), _jsx("td", { children: item.prospectName || "-" }), _jsx("td", { children: item.quoteNumber || "-" }), _jsx("td", { children: _jsx("span", { className: `lead-type-pill ${linkedQuote?.quoteType === "RETAINER" ? "is-retainer" : ""}`, children: getQuoteTypeLabel(linkedQuote) }) }), _jsx("td", { children: item.subject || "-" }), _jsx("td", { children: formatCurrency(Number(item.amountMxn || 0)) }), _jsx("td", { children: channelLabel(item.communicationChannel) }), _jsx("td", { children: item.lastInteractionLabel || "-" }), _jsx("td", { children: formatDate(item.sentToMattersAt) }), _jsx("td", { children: item.notes || "-" }), _jsx("td", { children: _jsx("button", { type: "button", className: "secondary-button", onClick: () => void handleReturnToActive(item.id), children: "Regresar" }) }), _jsx("td", { children: _jsx("button", { type: "button", className: "danger-button lead-delete-button", onClick: () => void handleDelete(item.id), children: "Borrar" }) })] }, item.id));
                                                })) })] }) }) })] })] })) : (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel lead-month-toolbar", children: [_jsxs("div", { className: "lead-month-filters", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Ano" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: selectedYearOptions.map((year) => (_jsx("option", { value: year, children: year }, year))) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: MONTH_NAMES.map((monthName, index) => (_jsx("option", { value: index + 1, children: monthName }, monthName))) })] })] }), _jsxs("div", { className: "matters-filters leads-search-filters", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Buscar por palabra" }), _jsx("input", { type: "text", value: searchTerm, onChange: (event) => setSearchTerm(event.target.value), placeholder: "Cotizacion, asunto, nota, canal..." })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Buscador por cliente" }), _jsx("input", { type: "text", value: clientSearch, onChange: (event) => setClientSearch(event.target.value), placeholder: "Buscar palabra del cliente..." })] })] }), _jsxs("div", { className: "lead-summary-grid", children: [_jsxs("article", { className: "lead-summary-card is-sent", children: [_jsx("span", { children: "Total Enviado (Mes)" }), _jsx("strong", { children: formatCurrency(sentMonthlyTotal) })] }), _jsxs("article", { className: "lead-summary-card is-contracted", children: [_jsx("span", { children: "Total Contratadas (Mes)" }), _jsx("strong", { children: formatCurrency(contractedMonthlyTotal) })] })] })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("h2", { children: ["Cotizaciones enviadas en ", MONTH_NAMES[selectedMonth - 1]] }), _jsxs("span", { children: [filteredMonthlyItems.length, " registros"] })] }), _jsx("div", { className: "lead-table-shell", children: _jsx("div", { className: "lead-table-wrapper", children: _jsxs("table", { className: "lead-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Comision cierre" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "No. Cotizacion" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Total" }), _jsx("th", { children: "Fecha de envio" }), _jsx("th", { children: "Estatus" }), _jsx("th", { children: "Borrar" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "centered-inline-message", children: "Cargando vista mensual..." }) })) : filteredMonthlyItems.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "centered-inline-message", children: hasActiveFilters ? "No hay cotizaciones mensuales con ese criterio." : "No hay cotizaciones enviadas este mes." }) })) : (filteredMonthlyItems.map((item) => (_jsxs("tr", { className: item.status === "MOVED_TO_MATTERS" ? "lead-row-contracted" : "", children: [_jsx("td", { children: item.commissionAssignee || "-" }), _jsx("td", { children: item.clientName || item.prospectName || "-" }), _jsx("td", { className: "lead-table-emphasis", children: item.quoteNumber || "-" }), _jsx("td", { children: item.subject || "-" }), _jsx("td", { children: formatCurrency(Number(item.amountMxn || 0)) }), _jsx("td", { children: formatDate(item.sentToClientAt) }), _jsx("td", { children: _jsx("span", { className: `lead-status-pill ${item.status === "MOVED_TO_MATTERS" ? "is-success" : "is-pending"}`, children: item.status === "MOVED_TO_MATTERS" ? "Contratada" : "Pendiente / Activa" }) }), _jsx("td", { children: _jsx("button", { type: "button", className: "danger-button lead-delete-button", onClick: () => void handleDelete(item.id), children: "Borrar" }) })] }, item.id)))) })] }) }) })] })] }))] }));
}
