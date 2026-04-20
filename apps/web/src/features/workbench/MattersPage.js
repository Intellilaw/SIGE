import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { TEAM_OPTIONS } from "@sige/contracts";
import { apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
const CHANNEL_OPTIONS = [
    { value: "WHATSAPP", label: "WhatsApp" },
    { value: "TELEGRAM", label: "Telegram" },
    { value: "WECHAT", label: "WeChat" },
    { value: "EMAIL", label: "Correo-e" },
    { value: "PHONE", label: "Telefono" }
];
const RF_OPTIONS = [
    { value: "NO", label: "No" },
    { value: "YES", label: "Si" },
    { value: "NOT_REQUIRED", label: "No es necesario" }
];
const EXECUTION_TEAM_KEYS = new Set([
    "LITIGATION",
    "CORPORATE_LABOR",
    "SETTLEMENTS",
    "FINANCIAL_LAW",
    "TAX_COMPLIANCE"
]);
const EXECUTION_MODULE_BY_TEAM = {
    LITIGATION: "litigation",
    CORPORATE_LABOR: "corporate-labor",
    SETTLEMENTS: "settlements",
    FINANCIAL_LAW: "financial-law",
    TAX_COMPLIANCE: "tax-compliance"
};
const EXECUTION_TEAM_OPTIONS = TEAM_OPTIONS.filter((option) => EXECUTION_TEAM_KEYS.has(option.key));
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
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function parseDateOnly(value) {
    const dateValue = toDateInput(value);
    if (!dateValue) {
        return null;
    }
    const [year, month, day] = dateValue.split("-").map(Number);
    if (!year || !month || !day) {
        return null;
    }
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return date;
}
function isPastOrToday(value) {
    const dueDate = parseDateOnly(value);
    if (!dueDate) {
        return false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate.getTime() <= today.getTime();
}
function formatCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2
    }).format(Number(value || 0));
}
function getTeamLabel(team) {
    return TEAM_OPTIONS.find((option) => option.key === team)?.label ?? "-";
}
function getChannelLabel(channel) {
    return CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? "WhatsApp";
}
function getRfLabel(value) {
    return RF_OPTIONS.find((option) => option.value === value)?.label ?? "No";
}
function getMatterTypeLabel(type) {
    return type === "RETAINER" ? "Iguala" : "Unico";
}
function sortQuotes(items) {
    return [...items].sort((left, right) => right.quoteNumber.localeCompare(left.quoteNumber, "es-MX", { numeric: true }));
}
function findQuoteByNumber(quotes, quoteNumber) {
    const cleanQuoteNumber = normalizeText(quoteNumber);
    if (!cleanQuoteNumber) {
        return undefined;
    }
    return quotes.find((quote) => normalizeText(quote.quoteNumber) === cleanQuoteNumber);
}
function findClientMatch(clients, clientName) {
    const normalizedClientName = normalizeComparableText(clientName);
    if (!normalizedClientName) {
        return undefined;
    }
    return clients.find((client) => normalizeComparableText(client.name) === normalizedClientName);
}
function getEffectiveMatterType(matter, quotes) {
    const linkedQuote = findQuoteByNumber(quotes, matter.quoteNumber);
    if (linkedQuote?.quoteType === "RETAINER") {
        return "RETAINER";
    }
    return matter.matterType ?? "ONE_TIME";
}
function getEffectiveClientNumber(matter, clients) {
    return findClientMatch(clients, matter.clientName)?.clientNumber ?? normalizeText(matter.clientNumber);
}
function buildTrackLabelMap(modules) {
    const labels = new Map();
    modules.forEach((module) => {
        module.tracks.forEach((track) => {
            labels.set(`${module.id}:${track.id}`, track.label);
        });
    });
    return labels;
}
function buildMatterReflectionMap(tasks, modules) {
    const trackLabels = buildTrackLabelMap(modules);
    const reflections = new Map();
    const activeTasks = tasks.filter((task) => task.state !== "COMPLETED");
    activeTasks
        .slice()
        .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
        .forEach((task) => {
        const keys = [normalizeText(task.matterId), normalizeText(task.matterNumber)].filter(Boolean);
        const trackLabel = trackLabels.get(`${task.moduleId}:${task.trackId}`) ?? task.trackId;
        const source = `${task.moduleId} / ${trackLabel}`;
        keys.forEach((key) => {
            if (!reflections.has(key)) {
                reflections.set(key, {
                    nextAction: trackLabel,
                    nextActionDueAt: task.dueDate,
                    nextActionSource: source
                });
            }
        });
    });
    return reflections;
}
function getMatterReflection(matter, reflections) {
    return (reflections.get(normalizeText(matter.id)) ??
        reflections.get(normalizeText(matter.matterNumber)) ?? {
        nextAction: matter.nextAction,
        nextActionDueAt: matter.nextActionDueAt,
        nextActionSource: matter.nextActionSource
    });
}
function sortActiveMatters(items, clients) {
    return [...items].sort((left, right) => {
        const leftNumber = Number.parseInt(getEffectiveClientNumber(left, clients), 10);
        const rightNumber = Number.parseInt(getEffectiveClientNumber(right, clients), 10);
        if (Number.isNaN(leftNumber) && Number.isNaN(rightNumber)) {
            return left.createdAt.localeCompare(right.createdAt);
        }
        if (Number.isNaN(leftNumber)) {
            return 1;
        }
        if (Number.isNaN(rightNumber)) {
            return -1;
        }
        if (leftNumber !== rightNumber) {
            return leftNumber - rightNumber;
        }
        return left.createdAt.localeCompare(right.createdAt);
    });
}
function sortDeletedMatters(items) {
    return [...items].sort((left, right) => (right.deletedAt ?? right.updatedAt).localeCompare(left.deletedAt ?? left.updatedAt));
}
function replaceMatter(items, updated) {
    return items.map((item) => (item.id === updated.id ? updated : item));
}
function upsertMatter(items, updated) {
    const exists = items.some((item) => item.id === updated.id);
    return exists ? replaceMatter(items, updated) : [...items, updated];
}
function removeMatter(items, matterId) {
    return items.filter((item) => item.id !== matterId);
}
function isMatterLinked(matter) {
    if (!normalizeText(matter.matterIdentifier) || !matter.responsibleTeam) {
        return false;
    }
    const expectedModule = EXECUTION_MODULE_BY_TEAM[matter.responsibleTeam];
    if (!expectedModule) {
        return false;
    }
    return matter.executionLinkedModule === expectedModule && Boolean(matter.executionLinkedAt);
}
function evaluateMatterRow(matter, quotes, clients, reflection) {
    const matterType = getEffectiveMatterType(matter, quotes);
    const effectiveClientNumber = getEffectiveClientNumber(matter, clients);
    if (matterType === "RETAINER") {
        const requiredFields = [
            { label: "Numero de cliente", value: effectiveClientNumber },
            { label: "Cliente", value: matter.clientName },
            { label: "Numero de cotizacion", value: matter.quoteNumber },
            { label: "Asunto", value: matter.subject },
            { label: "Proceso especifico", value: matter.specificProcess }
        ];
        const missingField = requiredFields.find((field) => !normalizeText(field.value));
        if (missingField) {
            return `Falta: ${missingField.label}`;
        }
        if (!isMatterLinked(matter)) {
            return "No vinculado con ID Asunto valido";
        }
        const requiredChecks = [
            { value: matter.r1InternalCreated, label: "R1 Interno" },
            { value: matter.telegramBotLinked, label: "Bot Telegram" },
            { value: matter.rdCreated, label: "RD Creado" },
            { value: matter.r1ExternalCreated, label: "R1 Externo" },
            { value: matter.billingChatCreated, label: "Chat Facturacion" }
        ];
        const missingCheck = requiredChecks.find((check) => !check.value);
        if (missingCheck) {
            return `Falta Check: ${missingCheck.label}`;
        }
        if (isPastOrToday(reflection.nextActionDueAt)) {
            return "Fecha de siguiente tarea vencida o programada para hoy";
        }
        return null;
    }
    const requiredFields = [
        { label: "Numero de cliente", value: effectiveClientNumber },
        { label: "Cliente", value: matter.clientName },
        { label: "Asunto", value: matter.subject },
        { label: "ID Asunto", value: matter.matterIdentifier },
        { label: "Numero de cotizacion", value: matter.quoteNumber }
    ];
    const missingField = requiredFields.find((field) => !normalizeText(field.value));
    if (missingField) {
        return `Falta: ${missingField.label}`;
    }
    if (!matter.communicationChannel) {
        return "Falta: Canal de comunicacion";
    }
    if (!matter.responsibleTeam) {
        return "Falta: Equipo responsable";
    }
    if (!matter.rfCreated || matter.rfCreated === "NO") {
        return "Falta: RF Creado (o seleccionado)";
    }
    const requiredChecks = [
        { value: matter.r1InternalCreated, label: "R1 Interno" },
        { value: matter.telegramBotLinked, label: "Bot Telegram" },
        { value: matter.rdCreated, label: "RD Creado" },
        { value: matter.r1ExternalCreated, label: "R1 Externo" },
        { value: matter.billingChatCreated, label: "Chat Facturacion" }
    ];
    const missingCheck = requiredChecks.find((check) => !check.value);
    if (missingCheck) {
        return `Falta Check: ${missingCheck.label}`;
    }
    if (!isMatterLinked(matter)) {
        return "No vinculado con ID Asunto valido";
    }
    if (!normalizeText(reflection.nextAction) || !toDateInput(reflection.nextActionDueAt)) {
        return "Falta: Siguiente accion / Fecha";
    }
    if (isPastOrToday(reflection.nextActionDueAt)) {
        return "Fecha de siguiente tarea vencida o programada para hoy";
    }
    if (!normalizeText(matter.milestone)) {
        return "Falta: Hito de conclusion";
    }
    return null;
}
function buildMatterPatch(matter) {
    return {
        clientId: matter.clientId ?? null,
        clientNumber: normalizeText(matter.clientNumber) ? matter.clientNumber ?? null : null,
        clientName: matter.clientName,
        quoteId: matter.quoteId ?? null,
        quoteNumber: normalizeText(matter.quoteNumber) ? matter.quoteNumber ?? null : null,
        commissionAssignee: normalizeText(matter.commissionAssignee) ? matter.commissionAssignee ?? null : null,
        matterType: matter.matterType,
        subject: matter.subject,
        specificProcess: normalizeText(matter.specificProcess) ? matter.specificProcess ?? null : null,
        totalFeesMxn: Number(matter.totalFeesMxn || 0),
        responsibleTeam: normalizeText(matter.responsibleTeam) ? matter.responsibleTeam ?? null : null,
        communicationChannel: matter.communicationChannel,
        r1InternalCreated: Boolean(matter.r1InternalCreated),
        telegramBotLinked: Boolean(matter.telegramBotLinked),
        rdCreated: Boolean(matter.rdCreated),
        rfCreated: matter.rfCreated,
        r1ExternalCreated: Boolean(matter.r1ExternalCreated),
        billingChatCreated: Boolean(matter.billingChatCreated),
        matterIdentifier: normalizeText(matter.matterIdentifier) ? matter.matterIdentifier ?? null : null,
        executionLinkedModule: normalizeText(matter.executionLinkedModule) ? matter.executionLinkedModule ?? null : null,
        executionLinkedAt: matter.executionLinkedAt ?? null,
        nextAction: normalizeText(matter.nextAction) ? matter.nextAction ?? null : null,
        nextActionDueAt: toDateInput(matter.nextActionDueAt) || null,
        nextActionSource: normalizeText(matter.nextActionSource) ? matter.nextActionSource ?? null : null,
        milestone: normalizeText(matter.milestone) ? matter.milestone ?? null : null,
        concluded: Boolean(matter.concluded),
        stage: matter.stage,
        origin: matter.origin,
        notes: normalizeText(matter.notes) ? matter.notes ?? null : null,
        deletedAt: matter.deletedAt ?? null
    };
}
function MatterTable({ items, loading, quotes, clients, reflections, commissionOptions, selectedIds, readOnly, variant, canDeleteReadOnlyRows, onToggleSelection, onToggleAll, onLocalChange, onImmediateChange, onQuoteChange, onBlur, onGenerateIdentifier, onSendToExecution, onTrash }) {
    const isRetainerTable = variant === "retainer";
    const allSelected = !readOnly && items.length > 0 && items.every((item) => selectedIds.has(item.id));
    return (_jsx("div", { className: "lead-table-shell", children: _jsx("div", { className: "lead-table-wrapper", children: _jsxs("table", { className: `lead-table matters-table ${isRetainerTable ? "matters-table-retainer" : "matters-table-unique"}`, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "lead-table-checkbox", children: _jsx("input", { type: "checkbox", checked: allSelected, disabled: readOnly, onChange: () => onToggleAll(items) }) }), _jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "No. Cotizacion" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Asunto" }), !isRetainerTable ? _jsx("th", { children: "Proceso especifico" }) : null, _jsx("th", { children: "Total" }), _jsx("th", { children: "Comision cierre" }), !isRetainerTable ? _jsx("th", { children: "Canal" }) : null, !isRetainerTable ? _jsx("th", { children: "R1 Int" }) : null, !isRetainerTable ? _jsx("th", { children: "Bot TG" }) : null, !isRetainerTable ? _jsx("th", { children: "RD" }) : null, !isRetainerTable ? _jsx("th", { children: "RF" }) : null, !isRetainerTable ? _jsx("th", { children: "R1 Ext" }) : null, !isRetainerTable ? _jsx("th", { children: "Chat Fac" }) : null, !isRetainerTable ? _jsx("th", { children: "Notas" }) : null, !isRetainerTable ? _jsx("th", { children: "ID Asunto" }) : null, !isRetainerTable ? _jsx("th", { children: "Generar" }) : null, !isRetainerTable ? _jsx("th", { children: "Vinculado" }) : null, !isRetainerTable ? _jsx("th", { children: "Equipo" }) : null, !isRetainerTable ? _jsx("th", { children: "Enviar" }) : null, !isRetainerTable ? _jsx("th", { children: "Siguiente tarea" }) : null, !isRetainerTable ? _jsx("th", { children: "Fecha sig." }) : null, !isRetainerTable ? _jsx("th", { children: "Origen" }) : null, !isRetainerTable ? _jsx("th", { children: "Hito conclusion" }) : null, !isRetainerTable ? _jsx("th", { children: "Concluyo?" }) : null, _jsx("th", { children: "Borrar" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: isRetainerTable ? 9 : 28, className: "centered-inline-message", children: "Cargando asuntos..." }) })) : items.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: isRetainerTable ? 9 : 28, className: "centered-inline-message", children: "No hay asuntos." }) })) : (items.map((item) => {
                            const linkedQuote = findQuoteByNumber(quotes, item.quoteNumber);
                            const matterType = getEffectiveMatterType(item, quotes);
                            const reflection = getMatterReflection(item, reflections);
                            const rowReason = evaluateMatterRow(item, quotes, clients, reflection);
                            const isSelected = selectedIds.has(item.id);
                            const clientMatch = findClientMatch(clients, item.clientName);
                            const effectiveClientNumber = clientMatch?.clientNumber ?? normalizeText(item.clientNumber);
                            const isClientLocked = Boolean(clientMatch);
                            const isQuoteLocked = Boolean(normalizeText(item.quoteNumber));
                            const isSpecificProcessEditable = !readOnly && matterType === "RETAINER";
                            const isLinked = isMatterLinked(item);
                            const sendLabel = matterType === "RETAINER" ? "-> Ejecucion" : "-> Ejec + Fin";
                            const sendTone = matterType === "RETAINER" ? "secondary-button" : "primary-button";
                            const rowClassName = [
                                rowReason && !isSelected ? "matter-row-danger" : "",
                                isSelected ? "matter-row-selected" : ""
                            ].join(" ").trim();
                            return (_jsxs("tr", { className: rowClassName, title: rowReason ?? "", children: [_jsx("td", { className: "lead-table-checkbox", children: _jsx("input", { type: "checkbox", checked: !readOnly && isSelected, disabled: readOnly, onChange: () => onToggleSelection(item.id) }) }), _jsx("td", { children: _jsx("input", { className: `lead-cell-input ${isClientLocked ? "matter-cell-derived" : ""}`, value: effectiveClientNumber, disabled: readOnly, readOnly: readOnly || isClientLocked, onChange: (event) => onLocalChange(item.id, "clientNumber", event.target.value), onBlur: () => onBlur(item.id), title: isClientLocked ? "Obtenido del catalogo de clientes" : "Editar manualmente" }) }), _jsx("td", { children: _jsx("input", { className: `lead-cell-input ${isQuoteLocked ? "matter-cell-readonly" : ""}`, value: item.clientName || "", disabled: readOnly, readOnly: readOnly || isQuoteLocked, onChange: (event) => onLocalChange(item.id, "clientName", event.target.value), onBlur: () => onBlur(item.id) }) }), _jsx("td", { children: _jsxs("select", { className: "lead-cell-input", value: item.quoteNumber || "", disabled: readOnly, onChange: (event) => void onQuoteChange(item.id, event.target.value), children: [_jsx("option", { value: "", children: "Manual (Sin cot.)" }), quotes
                                                    .filter((quote) => {
                                                    if (!normalizeText(item.clientName)) {
                                                        return true;
                                                    }
                                                    return normalizeComparableText(quote.clientName) === normalizeComparableText(item.clientName);
                                                })
                                                    .map((quote) => (_jsxs("option", { value: quote.quoteNumber, children: [quote.quoteNumber, " - ", quote.clientName] }, quote.id)))] }) }), _jsx("td", { children: _jsx("span", { className: `matter-type-pill ${matterType === "RETAINER" ? "is-retainer" : ""}`, children: getMatterTypeLabel(matterType) }) }), _jsx("td", { children: _jsx("input", { className: `lead-cell-input ${isQuoteLocked ? "matter-cell-readonly" : ""}`, value: item.subject || "", disabled: readOnly, readOnly: readOnly || isQuoteLocked, onChange: (event) => onLocalChange(item.id, "subject", event.target.value), onBlur: () => onBlur(item.id) }) }), !isRetainerTable ? (_jsx("td", { children: _jsx("input", { className: `lead-cell-input ${!isSpecificProcessEditable ? "matter-cell-readonly" : ""}`, value: item.specificProcess || "", disabled: readOnly, readOnly: !isSpecificProcessEditable, onChange: (event) => onLocalChange(item.id, "specificProcess", event.target.value), onBlur: () => onBlur(item.id), title: isSpecificProcessEditable ? "Editable" : "Solo editable para igualas" }) })) : null, _jsx("td", { children: _jsx("input", { className: "lead-cell-input lead-cell-input-number", type: "number", min: "0", step: "0.01", disabled: readOnly || Boolean(linkedQuote), readOnly: readOnly || Boolean(linkedQuote), value: Number(item.totalFeesMxn || 0), onChange: (event) => onLocalChange(item.id, "totalFeesMxn", Number(event.target.value || 0)), onBlur: () => onBlur(item.id) }) }), _jsx("td", { children: _jsxs("select", { className: "lead-cell-input", value: item.commissionAssignee || "", disabled: readOnly, onChange: (event) => void onImmediateChange(item.id, "commissionAssignee", event.target.value), children: [_jsx("option", { value: "", children: "Sel..." }), commissionOptions.map((option) => (_jsx("option", { value: option, children: option }, option)))] }) }), !isRetainerTable ? (_jsx("td", { children: _jsx("select", { className: "lead-cell-input", value: item.communicationChannel, disabled: readOnly, onChange: (event) => void onImmediateChange(item.id, "communicationChannel", event.target.value), children: CHANNEL_OPTIONS.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }) })) : null, !isRetainerTable ? (_jsx("td", { className: "matter-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: Boolean(item.r1InternalCreated), disabled: readOnly, onChange: (event) => void onImmediateChange(item.id, "r1InternalCreated", event.target.checked) }) })) : null, !isRetainerTable ? (_jsx("td", { className: "matter-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: Boolean(item.telegramBotLinked), disabled: readOnly, onChange: (event) => void onImmediateChange(item.id, "telegramBotLinked", event.target.checked) }) })) : null, !isRetainerTable ? (_jsx("td", { className: "matter-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: Boolean(item.rdCreated), disabled: readOnly, onChange: (event) => void onImmediateChange(item.id, "rdCreated", event.target.checked) }) })) : null, !isRetainerTable ? (_jsx("td", { children: _jsx("select", { className: "lead-cell-input", value: item.rfCreated, disabled: readOnly, onChange: (event) => void onImmediateChange(item.id, "rfCreated", event.target.value), children: RF_OPTIONS.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }) })) : null, !isRetainerTable ? (_jsx("td", { className: "matter-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: Boolean(item.r1ExternalCreated), disabled: readOnly, onChange: (event) => void onImmediateChange(item.id, "r1ExternalCreated", event.target.checked) }) })) : null, !isRetainerTable ? (_jsx("td", { className: "matter-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: Boolean(item.billingChatCreated), disabled: readOnly, onChange: (event) => void onImmediateChange(item.id, "billingChatCreated", event.target.checked) }) })) : null, !isRetainerTable ? (_jsx("td", { children: _jsx("input", { className: "lead-cell-input", value: item.notes || "", disabled: readOnly, onChange: (event) => onLocalChange(item.id, "notes", event.target.value), onBlur: () => onBlur(item.id) }) })) : null, !isRetainerTable ? (_jsx("td", { children: _jsx("input", { className: "lead-cell-input", value: item.matterIdentifier || "", disabled: readOnly, onChange: (event) => onLocalChange(item.id, "matterIdentifier", event.target.value), onBlur: () => onBlur(item.id) }) })) : null, !isRetainerTable ? (_jsx("td", { children: !readOnly ? (_jsx("button", { type: "button", className: "secondary-button matter-inline-button", onClick: () => void onGenerateIdentifier(item.id), children: "Generar" })) : (_jsx("span", { className: "matter-cell-muted", children: "-" })) })) : null, !isRetainerTable ? (_jsx("td", { children: _jsx("span", { className: `matter-link-pill ${isLinked ? "is-linked" : "is-unlinked"}`, children: isLinked ? "Si" : "No" }) })) : null, !isRetainerTable ? (_jsx("td", { children: _jsxs("select", { className: "lead-cell-input", value: item.responsibleTeam || "", disabled: readOnly, onChange: (event) => void onImmediateChange(item.id, "responsibleTeam", event.target.value), children: [_jsx("option", { value: "", children: "Seleccionar..." }), EXECUTION_TEAM_OPTIONS.map((option) => (_jsx("option", { value: option.key, children: option.label }, option.key)))] }) })) : null, !isRetainerTable ? (_jsx("td", { children: !readOnly ? (_jsx("button", { type: "button", className: `${sendTone} matter-inline-button`, onClick: () => void onSendToExecution(item.id), children: sendLabel })) : (_jsx("span", { className: "matter-cell-muted", children: "-" })) })) : null, !isRetainerTable ? (_jsx("td", { children: _jsx("div", { className: "matter-reflection-card", children: normalizeText(reflection.nextAction) ? reflection.nextAction : _jsx("span", { className: "matter-cell-muted", children: "Sin tareas" }) }) })) : null, !isRetainerTable ? (_jsx("td", { children: _jsx("div", { className: "matter-reflection-card", children: toDateInput(reflection.nextActionDueAt) || "-" }) })) : null, !isRetainerTable ? (_jsx("td", { className: "matter-checkbox-cell", children: normalizeText(reflection.nextActionSource) ? (_jsx("span", { className: "matter-origin-indicator", title: reflection.nextActionSource, children: "i" })) : (_jsx("span", { className: "matter-cell-muted", children: "-" })) })) : null, !isRetainerTable ? (_jsx("td", { children: _jsx("input", { className: "lead-cell-input", value: item.milestone || "", disabled: readOnly, onChange: (event) => onLocalChange(item.id, "milestone", event.target.value), onBlur: () => onBlur(item.id) }) })) : null, !isRetainerTable ? (_jsx("td", { className: "matter-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: Boolean(item.concluded), disabled: true }) })) : null, _jsx("td", { children: !readOnly || canDeleteReadOnlyRows ? (_jsx("button", { type: "button", className: "danger-button matter-inline-button", onClick: () => void onTrash(item.id), children: "Borrar" })) : (_jsx("span", { className: "matter-cell-muted", children: "-" })) })] }, item.id));
                        })) })] }) }) }));
}
export function MattersPage() {
    const { user } = useAuth();
    const [activeItems, setActiveItems] = useState([]);
    const [deletedItems, setDeletedItems] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [clients, setClients] = useState([]);
    const [taskItems, setTaskItems] = useState([]);
    const [taskModules, setTaskModules] = useState([]);
    const [commissionShortNames, setCommissionShortNames] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const [teamFilter, setTeamFilter] = useState("Todos");
    const [clientSearch, setClientSearch] = useState("");
    const canDeleteReadOnlyRows = user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN";
    const commissionOptions = useMemo(() => [...new Set([
            ...commissionShortNames,
            normalizeText(user?.shortName).toUpperCase()
        ].filter(Boolean))].sort(), [commissionShortNames, user?.shortName]);
    async function loadBoard() {
        setLoading(true);
        setErrorMessage(null);
        try {
            const [loadedMatters, loadedDeleted, loadedQuotes, loadedClients, loadedTaskItems, loadedTaskModules, shortNames] = await Promise.all([
                apiGet("/matters"),
                apiGet("/matters/recycle-bin"),
                apiGet("/quotes"),
                apiGet("/clients"),
                apiGet("/tasks/items"),
                apiGet("/tasks/modules"),
                apiGet("/matters/short-names")
            ]);
            setQuotes(sortQuotes(loadedQuotes));
            setClients(loadedClients);
            setTaskItems(loadedTaskItems);
            setTaskModules(loadedTaskModules);
            setCommissionShortNames(shortNames);
            setActiveItems(sortActiveMatters(loadedMatters, loadedClients));
            setDeletedItems(sortDeletedMatters(loadedDeleted));
            setSelectedIds(new Set());
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadBoard();
    }, []);
    function syncMatterAcrossViews(updated) {
        setActiveItems((items) => {
            const next = updated.deletedAt ? removeMatter(items, updated.id) : upsertMatter(items, updated);
            return sortActiveMatters(next, clients);
        });
        setDeletedItems((items) => {
            const next = updated.deletedAt ? upsertMatter(items, updated) : removeMatter(items, updated.id);
            return sortDeletedMatters(next);
        });
        setSelectedIds((items) => {
            const next = new Set(items);
            if (updated.deletedAt) {
                next.delete(updated.id);
            }
            return next;
        });
    }
    function updateMatterLocal(matterId, updater) {
        const current = activeItems.find((item) => item.id === matterId);
        if (!current) {
            return null;
        }
        const updated = updater({ ...current });
        setActiveItems((items) => sortActiveMatters(replaceMatter(items, updated), clients));
        return updated;
    }
    async function persistMatter(matter) {
        try {
            const updated = await apiPatch(`/matters/${matter.id}`, buildMatterPatch(matter));
            syncMatterAcrossViews(updated);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
            await loadBoard();
        }
    }
    function handleLocalChange(matterId, field, value) {
        updateMatterLocal(matterId, (matter) => {
            const draft = matter;
            draft[field] = value;
            return matter;
        });
    }
    async function handleImmediateChange(matterId, field, value) {
        const updated = updateMatterLocal(matterId, (matter) => {
            const draft = matter;
            draft[field] = value;
            return matter;
        });
        if (updated) {
            await persistMatter(updated);
        }
    }
    async function handleQuoteChange(matterId, quoteNumber) {
        const updated = updateMatterLocal(matterId, (matter) => {
            const cleanQuoteNumber = normalizeText(quoteNumber);
            const linkedQuote = findQuoteByNumber(quotes, cleanQuoteNumber);
            matter.quoteNumber = cleanQuoteNumber || undefined;
            matter.quoteId = linkedQuote?.id;
            if (linkedQuote) {
                const clientMatch = clients.find((client) => client.id === linkedQuote.clientId);
                matter.clientId = linkedQuote.clientId;
                matter.clientNumber = clientMatch?.clientNumber;
                matter.clientName = linkedQuote.clientName;
                matter.subject = linkedQuote.subject;
                matter.totalFeesMxn = linkedQuote.totalMxn;
                matter.milestone = linkedQuote.milestone;
            }
            else if (!cleanQuoteNumber) {
                matter.quoteId = undefined;
                matter.clientId = undefined;
                matter.clientName = "";
                matter.subject = "";
                matter.totalFeesMxn = 0;
                matter.milestone = undefined;
                matter.matterType = "ONE_TIME";
            }
            return matter;
        });
        if (updated) {
            await persistMatter(updated);
        }
    }
    function handleBlur(matterId) {
        const matter = activeItems.find((item) => item.id === matterId);
        if (!matter) {
            return;
        }
        void persistMatter(matter);
    }
    async function handleAddRow() {
        try {
            const created = await apiPost("/matters", {});
            setActiveItems((items) => sortActiveMatters([...items, created], clients));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleTrash(matterId) {
        if (!window.confirm("Mover este asunto a la papelera?")) {
            return;
        }
        try {
            const updated = await apiPost(`/matters/${matterId}/trash`, {});
            syncMatterAcrossViews(updated);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleBulkTrash() {
        if (selectedIds.size === 0) {
            return;
        }
        if (!window.confirm(`Mover ${selectedIds.size} asuntos seleccionados a la papelera?`)) {
            return;
        }
        try {
            await apiPost("/matters/bulk-trash", { ids: Array.from(selectedIds) });
            setActiveItems((items) => sortActiveMatters(items.filter((item) => !selectedIds.has(item.id)), clients));
            setSelectedIds(new Set());
            await loadBoard();
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleRestore(matterId) {
        if (!window.confirm("Restaurar este asunto a activos?")) {
            return;
        }
        try {
            const updated = await apiPost(`/matters/${matterId}/restore`, {});
            syncMatterAcrossViews(updated);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleGenerateIdentifier(matterId) {
        const matter = activeItems.find((item) => item.id === matterId);
        if (!matter) {
            return;
        }
        if (normalizeText(matter.matterIdentifier) && !window.confirm("Este asunto ya tiene un ID. Deseas generar uno nuevo?")) {
            return;
        }
        try {
            const updated = await apiPost(`/matters/${matterId}/generate-identifier`, {});
            syncMatterAcrossViews(updated);
            window.alert(`ID generado exitosamente: ${updated.matterIdentifier}`);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleSendToExecution(matterId) {
        const matter = activeItems.find((item) => item.id === matterId);
        if (!matter) {
            return;
        }
        if (!matter.responsibleTeam) {
            window.alert("Selecciona primero un equipo responsable.");
            return;
        }
        const matterType = getEffectiveMatterType(matter, quotes);
        const moduleName = getTeamLabel(matter.responsibleTeam);
        const confirmMessage = matterType === "RETAINER"
            ? `Enviar copia a ${moduleName}?`
            : `Enviar copia a ${moduleName} y dejarlo visible en Finanzas / Asuntos Activos?`;
        if (!window.confirm(confirmMessage)) {
            return;
        }
        try {
            const updated = await apiPost(`/matters/${matterId}/send-to-execution`, {});
            syncMatterAcrossViews(updated);
            if (matterType === "RETAINER") {
                window.alert(`Enviado a ${moduleName} correctamente. (Iguala: no se envia a Finanzas / Ver Mes)`);
            }
            else {
                window.alert(`Enviado a ${moduleName} correctamente. (El registro ya es visible en Finanzas / Asuntos Activos)`);
            }
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    function toggleSelection(matterId) {
        setSelectedIds((items) => {
            const next = new Set(items);
            if (next.has(matterId)) {
                next.delete(matterId);
            }
            else {
                next.add(matterId);
            }
            return next;
        });
    }
    function toggleAll(items) {
        setSelectedIds((current) => {
            const next = new Set(current);
            const allSelected = items.length > 0 && items.every((item) => next.has(item.id));
            if (allSelected) {
                items.forEach((item) => next.delete(item.id));
            }
            else {
                items.forEach((item) => next.add(item.id));
            }
            return next;
        });
    }
    const searchQuery = normalizeComparableText(clientSearch);
    const filteredItems = useMemo(() => activeItems.filter((item) => {
        const teamMatches = teamFilter === "Todos" || item.responsibleTeam === teamFilter;
        const clientMatches = !searchQuery || normalizeComparableText(item.clientName).includes(searchQuery);
        return teamMatches && clientMatches;
    }), [activeItems, searchQuery, teamFilter]);
    const filteredUniqueItems = useMemo(() => filteredItems.filter((item) => item.matterType !== "RETAINER"), [filteredItems]);
    const filteredRetainerItems = useMemo(() => filteredItems.filter((item) => item.matterType === "RETAINER"), [filteredItems]);
    const reflections = useMemo(() => buildMatterReflectionMap(taskItems, taskModules), [taskItems, taskModules]);
    return (_jsxs("section", { className: "page-stack matters-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Asuntos" }), _jsx("div", { children: _jsx("h2", { children: "Asuntos Activos" }) })] }), _jsx("p", { className: "muted", children: "Replica funcional del modulo legado: tabla operativa de asuntos, separacion entre unicos e igualas, papelera, autollenado desde cotizaciones y validacion visual en rojo cuando falta informacion clave." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "1. Asuntos Activos" }), _jsxs("span", { children: [filteredUniqueItems.length + filteredRetainerItems.length, " registros"] })] }), _jsxs("div", { className: "matters-toolbar", children: [_jsxs("div", { className: "matters-toolbar-actions", children: [_jsx("button", { type: "button", className: "primary-button", onClick: () => void handleAddRow(), children: "+ Agregar fila" }), selectedIds.size > 0 ? (_jsxs("button", { type: "button", className: "danger-button", onClick: () => void handleBulkTrash(), children: ["Borrar (", selectedIds.size, ")"] })) : null] }), _jsxs("div", { className: "matters-filters", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Equipo" }), _jsxs("select", { value: teamFilter, onChange: (event) => setTeamFilter(event.target.value), children: [_jsx("option", { value: "Todos", children: "Todos" }), EXECUTION_TEAM_OPTIONS.map((option) => (_jsx("option", { value: option.key, children: option.label }, option.key)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Cliente" }), _jsx("input", { type: "text", value: clientSearch, onChange: (event) => setClientSearch(event.target.value), placeholder: "Buscar cliente..." })] }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => void loadBoard(), children: "Refrescar" })] })] })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "1. Asuntos Activos" }), _jsxs("span", { children: [filteredUniqueItems.length, " unicos"] })] }), _jsx(MatterTable, { items: filteredUniqueItems, loading: loading, quotes: quotes, clients: clients, reflections: reflections, commissionOptions: commissionOptions, selectedIds: selectedIds, readOnly: false, variant: "unique", canDeleteReadOnlyRows: canDeleteReadOnlyRows, onToggleSelection: toggleSelection, onToggleAll: toggleAll, onLocalChange: handleLocalChange, onImmediateChange: handleImmediateChange, onQuoteChange: handleQuoteChange, onBlur: handleBlur, onGenerateIdentifier: handleGenerateIdentifier, onSendToExecution: handleSendToExecution, onTrash: handleTrash })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "2. Igualas por asuntos varios" }), _jsxs("span", { children: [filteredRetainerItems.length, " registros"] })] }), _jsx("p", { className: "muted matter-table-caption", children: "Vista de solo lectura, como en la referencia. Los renglones siguen mostrando rojo cuando falta informacion operativa o no estan vinculados a ejecucion." }), _jsx(MatterTable, { items: filteredRetainerItems, loading: loading, quotes: quotes, clients: clients, reflections: reflections, commissionOptions: commissionOptions, selectedIds: new Set(), readOnly: true, variant: "retainer", canDeleteReadOnlyRows: canDeleteReadOnlyRows, onToggleSelection: () => undefined, onToggleAll: () => undefined, onLocalChange: handleLocalChange, onImmediateChange: handleImmediateChange, onQuoteChange: handleQuoteChange, onBlur: handleBlur, onGenerateIdentifier: handleGenerateIdentifier, onSendToExecution: handleSendToExecution, onTrash: handleTrash })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Papelera de Reciclaje" }), _jsxs("span", { children: [deletedItems.length, " registros"] })] }), _jsx("p", { className: "muted matter-table-caption", children: "Los asuntos eliminados desaparecen definitivamente despues de 30 dias, igual que en Intranet." }), _jsx("div", { className: "lead-table-shell", children: _jsx("div", { className: "lead-table-wrapper", children: _jsxs("table", { className: "lead-table matters-table matters-table-recycle", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Comision cierre" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "No. Cotizacion" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Total" }), _jsx("th", { children: "Canal" }), _jsx("th", { children: "Equipo" }), _jsx("th", { children: "R1 Int" }), _jsx("th", { children: "Bot TG" }), _jsx("th", { children: "RD" }), _jsx("th", { children: "RF" }), _jsx("th", { children: "R1 Ext" }), _jsx("th", { children: "Chat Fac" }), _jsx("th", { children: "Hito conclusion" }), _jsx("th", { children: "Concluyo?" }), _jsx("th", { children: "Notas" }), _jsx("th", { children: "Accion" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 18, className: "centered-inline-message", children: "Cargando papelera..." }) })) : deletedItems.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 18, className: "centered-inline-message", children: "Papelera vacia." }) })) : (deletedItems.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: getEffectiveClientNumber(item, clients) || "-" }), _jsx("td", { children: item.commissionAssignee || "-" }), _jsx("td", { children: item.clientName || "-" }), _jsx("td", { children: item.quoteNumber || "-" }), _jsx("td", { children: item.subject || "-" }), _jsx("td", { children: formatCurrency(Number(item.totalFeesMxn || 0)) }), _jsx("td", { children: getChannelLabel(item.communicationChannel) }), _jsx("td", { children: getTeamLabel(item.responsibleTeam) }), _jsx("td", { children: item.r1InternalCreated ? "Si" : "No" }), _jsx("td", { children: item.telegramBotLinked ? "Si" : "No" }), _jsx("td", { children: item.rdCreated ? "Si" : "No" }), _jsx("td", { children: getRfLabel(item.rfCreated) }), _jsx("td", { children: item.r1ExternalCreated ? "Si" : "No" }), _jsx("td", { children: item.billingChatCreated ? "Si" : "No" }), _jsx("td", { children: item.milestone || "-" }), _jsx("td", { children: item.concluded ? "Si" : "No" }), _jsx("td", { children: item.notes || "-" }), _jsx("td", { children: _jsx("button", { type: "button", className: "secondary-button matter-inline-button", onClick: () => void handleRestore(item.id), children: "Regresar" }) })] }, item.id)))) })] }) }) })] })] }));
}
