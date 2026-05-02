import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { TEAM_OPTIONS } from "@sige/contracts";
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
const IVA_RATE = 0.16;
const QUOTE_TEAM_OPTIONS = [
    { key: "LITIGATION", label: "Litigio" },
    { key: "CORPORATE_LABOR", label: "Corporativo-compliance laboral" },
    { key: "SETTLEMENTS", label: "Convenios y contratos" },
    { key: "FINANCIAL_LAW", label: "Derecho financiero" },
    { key: "TAX_COMPLIANCE", label: "Compliance fiscal" }
];
function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}
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
function matchesAllSearchWords(haystack, searchWords) {
    if (searchWords.length === 0) {
        return true;
    }
    const normalizedHaystack = normalizeComparableText(haystack);
    return searchWords.every((word) => normalizedHaystack.includes(word));
}
const SPANISH_TO_ENGLISH_TERMS = [
    ["prestacion de servicios", "provision of services"],
    ["prestación de servicios", "provision of services"],
    ["momento de pago", "time of payment"],
    ["asunto unico", "one-time matter"],
    ["asunto único", "one-time matter"],
    ["porcentaje de exito", "success fee"],
    ["porcentaje de éxito", "success fee"],
    ["honorarios", "fees"],
    ["servicios", "services"],
    ["servicio", "service"],
    ["cotizacion", "quotation"],
    ["cotización", "quotation"],
    ["conceptos", "concepts"],
    ["concepto", "concept"],
    ["monto", "amount"],
    ["fijo", "fixed"],
    ["variable", "variable"],
    ["notas", "notes"],
    ["nota", "note"],
    ["pago", "payment"],
    ["pagos", "payments"],
    ["anticipo", "advance payment"],
    ["contra entrega", "upon delivery"],
    ["firma", "signature"],
    ["entrega", "delivery"],
    ["cierre", "closing"],
    ["aprobacion", "approval"],
    ["aprobación", "approval"],
    ["contratacion", "engagement"],
    ["contratación", "engagement"],
    ["cliente", "client"],
    ["clientes", "clients"],
    ["despacho", "firm"],
    ["demanda", "lawsuit"],
    ["juicio", "proceeding"],
    ["procedimiento", "proceeding"],
    ["mediacion", "mediation"],
    ["mediación", "mediation"],
    ["contrato", "agreement"],
    ["contratos", "agreements"],
    ["convenio", "agreement"],
    ["convenios", "agreements"],
    ["cumplimiento", "compliance"],
    ["laboral", "labor"],
    ["fiscal", "tax"],
    ["financiero", "financial"],
    ["corporativo", "corporate"],
    ["litigio", "litigation"],
    ["asesoria", "advisory"],
    ["asesoría", "advisory"],
    ["revision", "review"],
    ["revisión", "review"],
    ["redaccion", "drafting"],
    ["redacción", "drafting"],
    ["elaboracion", "preparation"],
    ["elaboración", "preparation"],
    ["negociacion", "negotiation"],
    ["negociación", "negotiation"],
    ["acompanamiento", "support"],
    ["acompañamiento", "support"],
    ["tramite", "filing"],
    ["trámite", "filing"],
    ["tramites", "filings"],
    ["trámites", "filings"],
    ["mensual", "monthly"],
    ["recuperado", "recovered"],
    ["recuperacion", "recovery"],
    ["recuperación", "recovery"],
    ["redes sociales", "social media"],
    ["impuestos", "taxes"],
    ["derechos", "government fees"],
    ["gastos", "expenses"],
    ["copias", "copies"],
    ["transportacion", "transportation"],
    ["transportación", "transportation"],
    ["ciudad de mexico", "Mexico City"],
    ["Ciudad de Mexico", "Mexico City"],
    ["Ciudad de México", "Mexico City"],
    ["sin titulo", "untitled"],
    ["sin título", "untitled"],
    ["sin definir", "to be defined"],
    ["y", "and"],
    ["o", "or"],
    ["con", "with"],
    ["para", "for"],
    ["por", "by"],
    ["del", "of the"],
    ["de", "of"],
    ["la", "the"],
    ["el", "the"],
    ["los", "the"],
    ["las", "the"]
];
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function matchReplacementCase(original, replacement) {
    if (original === original.toUpperCase()) {
        return replacement.toUpperCase();
    }
    if (original[0] === original[0]?.toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
}
function replaceSpanishTerm(source, spanish, english) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(spanish)})(?=$|[^\\p{L}\\p{N}])`, "giu");
    return source.replace(pattern, (_match, prefix, term) => `${prefix}${matchReplacementCase(term, english)}`);
}
function translateTextToEnglish(value) {
    let translated = normalizeText(value);
    if (!translated) {
        return "";
    }
    SPANISH_TO_ENGLISH_TERMS.forEach(([spanish, english]) => {
        translated = replaceSpanishTerm(translated, spanish, english);
    });
    return translated.replace(/\s+/g, " ").trim();
}
function translateTemplateCellToEnglish(cell) {
    return {
        ...cell,
        value: translateTextToEnglish(cell.value)
    };
}
function translateTemplateRowsToEnglish(rows) {
    return structuredClone(rows).map((row) => ({
        ...row,
        conceptDescription: translateTextToEnglish(row.conceptDescription),
        amountCells: row.amountCells.map(translateTemplateCellToEnglish),
        paymentMoment: translateTemplateCellToEnglish(row.paymentMoment),
        notesCell: translateTemplateCellToEnglish(row.notesCell)
    }));
}
function translateQuoteTemplateToEnglish(template) {
    return {
        ...template,
        name: translateTextToEnglish(template.name) || template.name,
        subject: translateTextToEnglish(template.subject),
        services: translateTextToEnglish(template.services),
        milestone: template.milestone ? translateTextToEnglish(template.milestone) : undefined,
        notes: template.notes ? translateTextToEnglish(template.notes) : undefined,
        amountColumns: template.amountColumns.map((column) => ({
            ...column,
            title: translateTextToEnglish(column.title) || column.title
        })),
        tableRows: translateTemplateRowsToEnglish(template.tableRows),
        lineItems: template.lineItems.map((item) => ({
            ...item,
            concept: translateTextToEnglish(item.concept)
        }))
    };
}
function parseAmountInput(value) {
    const parsed = Number.parseFloat(value.replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }
    return parsed;
}
function formatCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2
    }).format(Number(value || 0));
}
function formatDate(value) {
    if (!value) {
        return "-";
    }
    const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const date = dateMatch
        ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))
        : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }
    return date.toLocaleDateString("es-MX");
}
function getTodayDateInputValue() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function toDateInputValue(value) {
    const dateMatch = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
        return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    }
    return getTodayDateInputValue();
}
function getQuoteDisplayDate(quote) {
    return quote.quoteDate ?? quote.createdAt;
}
function downloadBlobFile(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
}
function getQuoteTypeLabel(type) {
    return type === "RETAINER" ? "Iguala" : "Asunto unico";
}
function getTeamLabel(team) {
    return (QUOTE_TEAM_OPTIONS.find((option) => option.key === team)?.label ??
        TEAM_OPTIONS.find((option) => option.key === team)?.label ??
        "Sin equipo");
}
function getTemplateSearchText(template) {
    const rowText = template.tableRows.flatMap((row) => [
        row.conceptDescription,
        ...row.amountCells.map((cell) => cell.value),
        row.paymentMoment.value,
        row.notesCell.value
    ]);
    return [
        template.templateNumber,
        template.name,
        template.subject,
        template.services,
        template.milestone,
        template.notes,
        getTeamLabel(template.team),
        getQuoteTypeLabel(template.quoteType),
        getTemplateAmountPreview(template),
        ...template.amountColumns.flatMap((column) => [column.title, getAmountModeLabel(column.mode)]),
        ...rowText
    ]
        .filter(Boolean)
        .join(" ");
}
function getQuoteSearchText(quote, clientNumber) {
    const tableRows = quote.tableRows ?? [];
    const rowText = tableRows.flatMap((row) => [
        row.conceptDescription,
        ...row.amountCells.map((cell) => cell.value),
        row.paymentMoment.value,
        row.notesCell.value
    ]);
    return [
        clientNumber,
        quote.clientName,
        quote.quoteNumber,
        getQuoteDisplayDate(quote),
        formatDate(getQuoteDisplayDate(quote)),
        getQuoteTypeLabel(quote.quoteType),
        getTeamLabel(quote.responsibleTeam),
        quote.subject,
        quote.milestone,
        quote.notes,
        quote.language,
        formatCurrency(quote.totalMxn),
        ...quote.lineItems.flatMap((item) => [item.concept, String(item.amountMxn)]),
        ...rowText
    ]
        .filter(Boolean)
        .join(" ");
}
function filterTemplatesForSearch(templates, wordSearch, teamSearch) {
    const wordSearchWords = getSearchWords(wordSearch);
    const teamSearchWords = getSearchWords(teamSearch);
    return templates.filter((template) => {
        const templateText = getTemplateSearchText(template);
        const teamText = `${template.team} ${getTeamLabel(template.team)}`;
        return matchesAllSearchWords(templateText, wordSearchWords) && matchesAllSearchWords(teamText, teamSearchWords);
    });
}
function filterQuotesForSearch(quotes, clients, wordSearch, clientSearch) {
    const wordSearchWords = getSearchWords(wordSearch);
    const clientSearchWords = getSearchWords(clientSearch);
    const clientNumberById = new Map(clients.map((client) => [client.id, client.clientNumber]));
    const clientNumberByName = new Map(clients.map((client) => [normalizeComparableText(client.name), client.clientNumber]));
    return quotes.filter((quote) => {
        const clientNumber = clientNumberById.get(quote.clientId) ?? clientNumberByName.get(normalizeComparableText(quote.clientName));
        const quoteText = getQuoteSearchText(quote, clientNumber);
        const clientText = [clientNumber, quote.clientName].filter(Boolean).join(" ");
        return matchesAllSearchWords(quoteText, wordSearchWords) && matchesAllSearchWords(clientText, clientSearchWords);
    });
}
function resolveDefaultTeam(userTeam) {
    return QUOTE_TEAM_OPTIONS.some((option) => option.key === userTeam) ? userTeam : "";
}
function createEditableLineItem(concept = "", amountMxn = "") {
    return {
        id: createId("quote-line"),
        concept,
        amountMxn
    };
}
function toEditableLineItems(items) {
    if (!items || items.length === 0) {
        return [createEditableLineItem()];
    }
    return items.map((item) => createEditableLineItem(item.concept, String(item.amountMxn)));
}
function createTemplateCell(value = "") {
    return {
        value,
        rowSpan: 1,
        hidden: false
    };
}
function createTemplateRow() {
    return {
        id: createId("template-row"),
        conceptDescription: "",
        amountCells: [createTemplateCell(), createTemplateCell()],
        paymentMoment: createTemplateCell(),
        notesCell: createTemplateCell()
    };
}
function getDefaultAmountColumnTitle(index, language = "es") {
    const amountLabel = language === "en" ? "Amount" : "Monto";
    return `${amountLabel} ${index + 1}`;
}
function createDefaultAmountColumns(language = "es") {
    return [
        { id: "primary", title: getDefaultAmountColumnTitle(0, language), enabled: true, mode: "FIXED" },
        { id: "secondary", title: getDefaultAmountColumnTitle(1, language), enabled: false, mode: "FIXED" }
    ];
}
function buildEmptyTemplateForm(defaultTeam) {
    return {
        team: resolveDefaultTeam(defaultTeam),
        quoteType: "ONE_TIME",
        milestone: "",
        services: "",
        amountColumns: createDefaultAmountColumns(),
        tableRows: [createTemplateRow()]
    };
}
function buildEmptyQuoteForm(defaultTeam, language = "es") {
    return {
        clientId: "",
        clientName: "",
        responsibleTeam: resolveDefaultTeam(defaultTeam),
        status: "DRAFT",
        quoteType: "ONE_TIME",
        language,
        quoteDate: getTodayDateInputValue(),
        subject: "",
        milestone: "",
        notes: "",
        lineItems: [createEditableLineItem()]
    };
}
function buildEmptyQuoteTemplateDraft(language = "es") {
    return {
        amountColumns: createDefaultAmountColumns(language),
        tableRows: [createTemplateRow()]
    };
}
function buildTemplateFormFromTemplate(template) {
    return {
        team: template.team,
        quoteType: template.quoteType,
        milestone: template.milestone ?? "",
        services: template.services,
        amountColumns: structuredClone(template.amountColumns),
        tableRows: structuredClone(template.tableRows)
    };
}
function buildQuoteTemplateDraftFromTemplate(template) {
    return {
        amountColumns: structuredClone(template.amountColumns),
        tableRows: structuredClone(template.tableRows)
    };
}
function buildQuoteTemplateDraftFromQuote(quote) {
    if (quote.amountColumns?.length && quote.tableRows?.length) {
        return {
            amountColumns: structuredClone(quote.amountColumns),
            tableRows: structuredClone(quote.tableRows)
        };
    }
    if (!quote.lineItems.length) {
        return buildEmptyQuoteTemplateDraft(quote.language ?? "es");
    }
    return {
        amountColumns: createDefaultAmountColumns(quote.language ?? "es"),
        tableRows: quote.lineItems.map((item, index) => ({
            id: `quote-row-${index + 1}`,
            conceptDescription: item.concept,
            amountCells: [
                createTemplateCell(String(item.amountMxn)),
                createTemplateCell("")
            ],
            paymentMoment: createTemplateCell(""),
            notesCell: createTemplateCell("")
        }))
    };
}
function buildQuoteFormFromTemplate(template, defaultTeam, language = "es") {
    return {
        clientId: "",
        clientName: "",
        responsibleTeam: resolveDefaultTeam(template.team ?? defaultTeam),
        status: "DRAFT",
        quoteType: template.quoteType,
        language,
        quoteDate: getTodayDateInputValue(),
        subject: normalizeText(template.subject) || normalizeText(template.services).slice(0, 120),
        milestone: template.milestone ?? "",
        notes: normalizeText(template.services),
        lineItems: toEditableLineItems(template.lineItems)
    };
}
function buildQuoteFormFromQuote(quote) {
    return {
        clientId: quote.clientId,
        clientName: quote.clientName,
        responsibleTeam: quote.responsibleTeam ?? "",
        status: quote.status,
        quoteType: quote.quoteType,
        language: quote.language ?? "es",
        quoteDate: toDateInputValue(quote.quoteDate ?? quote.createdAt),
        subject: quote.subject,
        milestone: quote.milestone ?? "",
        notes: quote.notes ?? "",
        lineItems: toEditableLineItems(quote.lineItems)
    };
}
function buildTemplatePayload(form) {
    return {
        team: form.team,
        quoteType: form.quoteType,
        services: normalizeText(form.services),
        amountColumns: form.amountColumns,
        tableRows: form.tableRows,
        milestone: normalizeText(form.milestone) || undefined
    };
}
function buildLineItemsPayload(items) {
    const populated = items.filter((item) => normalizeText(item.concept) || normalizeText(item.amountMxn));
    if (populated.length === 0) {
        throw new Error("Agrega al menos un concepto a la cotizacion.");
    }
    return populated.map((item) => {
        const concept = normalizeText(item.concept);
        if (concept.length < 2) {
            throw new Error("Cada concepto debe tener al menos 2 caracteres.");
        }
        return {
            concept,
            amountMxn: parseAmountInput(item.amountMxn)
        };
    });
}
function buildLineItemsFromTemplateDraft(draft) {
    const enabledColumns = draft.amountColumns
        .map((column, index) => ({ ...column, index }))
        .filter((column) => column.enabled && column.mode === "FIXED");
    const lineItems = draft.tableRows.flatMap((row, rowIndex) => enabledColumns.flatMap((column) => {
        const cell = row.amountCells[column.index];
        if (!cell || cell.hidden) {
            return [];
        }
        const amountMxn = parseAmountInput(String(cell.value ?? ""));
        if (amountMxn <= 0) {
            return [];
        }
        const conceptBase = normalizeText(row.conceptDescription) || getTemplateRowLabel(rowIndex);
        const concept = enabledColumns.length > 1 ? `${conceptBase} (${column.title})` : conceptBase;
        return [{ concept, amountMxn }];
    }));
    if (lineItems.length === 0) {
        throw new Error("La cotizacion tipo necesita al menos un monto fijo mayor a 0 para poder guardarse.");
    }
    return lineItems;
}
function sortQuotes(items) {
    return [...items].sort((left, right) => {
        const quoteDateDelta = getQuoteDisplayDate(right).localeCompare(getQuoteDisplayDate(left));
        if (quoteDateDelta !== 0) {
            return quoteDateDelta;
        }
        const createdDelta = (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
        if (createdDelta !== 0) {
            return createdDelta;
        }
        return right.quoteNumber.localeCompare(left.quoteNumber, "es-MX", { numeric: true });
    });
}
function getQuoteSequence(quoteNumber) {
    const match = normalizeText(quoteNumber).match(/^E-(\d+)$/i);
    if (!match) {
        return 0;
    }
    const value = Number.parseInt(match[1] ?? "", 10);
    return Number.isFinite(value) ? value : 0;
}
function buildNextQuoteNumber(quotes) {
    const maxSequence = quotes.reduce((currentMax, quote) => Math.max(currentMax, getQuoteSequence(quote.quoteNumber)), 0);
    const nextSequence = Math.max(maxSequence, quotes.length) + 1;
    return `E-${String(nextSequence).padStart(3, "0")}`;
}
function getTemplateSequence(templateNumber) {
    const match = normalizeText(templateNumber).match(/^T-(\d+)$/i);
    if (!match) {
        return 0;
    }
    const value = Number.parseInt(match[1] ?? "", 10);
    return Number.isFinite(value) ? value : 0;
}
function sortTemplates(items) {
    const teamOrder = new Map(QUOTE_TEAM_OPTIONS.map((option, index) => [option.key, index]));
    return [...items].sort((left, right) => {
        const teamDelta = (teamOrder.get(left.team) ?? 999) - (teamOrder.get(right.team) ?? 999);
        if (teamDelta !== 0) {
            return teamDelta;
        }
        return getTemplateSequence(right.templateNumber) - getTemplateSequence(left.templateNumber);
    });
}
function buildNextTemplateNumber(templates) {
    const maxSequence = templates.reduce((currentMax, template) => Math.max(currentMax, getTemplateSequence(template.templateNumber)), 0);
    return `T-${String(maxSequence + 1).padStart(3, "0")}`;
}
function groupTemplatesByTeam(templates) {
    const grouped = new Map();
    sortTemplates(templates).forEach((template) => {
        const current = grouped.get(template.team) ?? [];
        current.push(template);
        grouped.set(template.team, current);
    });
    return Array.from(grouped.entries()).map(([team, items]) => ({
        team,
        label: getTeamLabel(team),
        items
    }));
}
function groupQuotesByClient(quotes, clients) {
    const clientNumberById = new Map(clients.map((client) => [client.id, client.clientNumber]));
    const clientNumberByName = new Map(clients.map((client) => [normalizeComparableText(client.name), client.clientNumber]));
    const grouped = new Map();
    sortQuotes(quotes).forEach((quote) => {
        const key = quote.clientId || normalizeComparableText(quote.clientName);
        const current = grouped.get(key) ?? {
            clientId: quote.clientId,
            clientName: quote.clientName,
            clientNumber: clientNumberById.get(quote.clientId) ??
                clientNumberByName.get(normalizeComparableText(quote.clientName)),
            items: []
        };
        current.items.push(quote);
        grouped.set(key, current);
    });
    return Array.from(grouped.values())
        .sort((left, right) => left.clientName.localeCompare(right.clientName, "es-MX"))
        .map((group) => ({
        ...group,
        totalMxn: group.items.reduce((sum, item) => sum + item.totalMxn, 0)
    }));
}
function summarizeTemplateServices(services, maxLength = 180) {
    const compact = normalizeText(services).replace(/\s+/g, " ");
    if (!compact) {
        return "Sin descripcion de servicios.";
    }
    if (compact.length <= maxLength) {
        return compact;
    }
    return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
function getTemplateAmountPreview(template) {
    const hasFixedColumn = template.amountColumns.some((column) => column.enabled && column.mode === "FIXED");
    return hasFixedColumn ? formatCurrency(template.totalMxn) : "Monto variable";
}
function getCellFromRow(row, kind, amountIndex = 0) {
    if (kind === "payment") {
        return row.paymentMoment;
    }
    if (kind === "notes") {
        return row.notesCell;
    }
    return row.amountCells[amountIndex];
}
function findMasterRowIndex(rows, rowIndex, kind, amountIndex = 0) {
    for (let index = rowIndex; index >= 0; index -= 1) {
        const candidate = getCellFromRow(rows[index], kind, amountIndex);
        if (!candidate.hidden && index + candidate.rowSpan > rowIndex) {
            return index;
        }
    }
    return rowIndex;
}
function mergeTemplateCellDown(rows, rowIndex, kind, amountIndex = 0) {
    const nextRows = structuredClone(rows);
    const sourceCell = getCellFromRow(nextRows[rowIndex], kind, amountIndex);
    if (sourceCell.hidden) {
        return nextRows;
    }
    const nextIndex = rowIndex + sourceCell.rowSpan;
    if (nextIndex >= nextRows.length) {
        return nextRows;
    }
    const nextCell = getCellFromRow(nextRows[nextIndex], kind, amountIndex);
    if (nextCell.hidden) {
        return nextRows;
    }
    sourceCell.rowSpan += nextCell.rowSpan;
    nextCell.hidden = true;
    nextCell.rowSpan = 1;
    return nextRows;
}
function mergeTemplateCellUp(rows, rowIndex, kind, amountIndex = 0) {
    if (rowIndex <= 0) {
        return rows;
    }
    for (let index = rowIndex - 1; index >= 0; index -= 1) {
        const candidate = getCellFromRow(rows[index], kind, amountIndex);
        if (candidate.hidden) {
            continue;
        }
        if (index + candidate.rowSpan === rowIndex) {
            return mergeTemplateCellDown(rows, index, kind, amountIndex);
        }
        break;
    }
    return rows;
}
function unmergeTemplateCell(rows, rowIndex, kind, amountIndex = 0) {
    const nextRows = structuredClone(rows);
    const sourceCell = getCellFromRow(nextRows[rowIndex], kind, amountIndex);
    if (sourceCell.hidden || sourceCell.rowSpan <= 1) {
        return nextRows;
    }
    const coveredRows = sourceCell.rowSpan;
    sourceCell.rowSpan = 1;
    for (let offset = 1; offset < coveredRows; offset += 1) {
        const targetIndex = rowIndex + offset;
        if (targetIndex >= nextRows.length) {
            break;
        }
        const targetCell = getCellFromRow(nextRows[targetIndex], kind, amountIndex);
        targetCell.hidden = false;
        targetCell.rowSpan = 1;
    }
    return nextRows;
}
function insertTemplateRowAfter(rows, rowIndex) {
    const nextRows = structuredClone(rows);
    nextRows.splice(rowIndex + 1, 0, createTemplateRow());
    return nextRows;
}
function removeTemplateRow(rows, rowIndex) {
    if (rows.length === 1) {
        return [createTemplateRow()];
    }
    const nextRows = structuredClone(rows);
    const targets = [
        { kind: "amount", amountIndex: 0 },
        { kind: "amount", amountIndex: 1 },
        { kind: "payment" },
        { kind: "notes" }
    ];
    targets.forEach((target) => {
        const cell = getCellFromRow(nextRows[rowIndex], target.kind, target.amountIndex ?? 0);
        if (cell.hidden) {
            const masterIndex = findMasterRowIndex(nextRows, rowIndex, target.kind, target.amountIndex ?? 0);
            const masterCell = getCellFromRow(nextRows[masterIndex], target.kind, target.amountIndex ?? 0);
            masterCell.rowSpan = Math.max(1, masterCell.rowSpan - 1);
            return;
        }
        if (cell.rowSpan > 1) {
            const coveredRows = cell.rowSpan;
            cell.rowSpan = 1;
            for (let offset = 1; offset < coveredRows; offset += 1) {
                const targetIndex = rowIndex + offset;
                if (targetIndex >= nextRows.length) {
                    break;
                }
                const targetCell = getCellFromRow(nextRows[targetIndex], target.kind, target.amountIndex ?? 0);
                targetCell.hidden = false;
                targetCell.rowSpan = 1;
            }
        }
    });
    nextRows.splice(rowIndex, 1);
    return nextRows;
}
function resetSecondaryAmountColumn(rows) {
    return rows.map((row) => ({
        ...row,
        amountCells: [
            row.amountCells[0],
            {
                value: row.amountCells[1]?.value ?? "",
                rowSpan: 1,
                hidden: false
            }
        ]
    }));
}
function getAmountColumnSummary(rows, column, amountIndex) {
    if (!column.enabled || column.mode === "VARIABLE") {
        return null;
    }
    const subtotal = rows.reduce((sum, row) => {
        const cell = row.amountCells[amountIndex];
        if (!cell || cell.hidden) {
            return sum;
        }
        return sum + parseAmountInput(cell.value);
    }, 0);
    const iva = subtotal * IVA_RATE;
    return {
        subtotal,
        iva,
        total: subtotal + iva
    };
}
function getTemplateRowLabel(index) {
    return `Concepto ${index + 1}`;
}
function getAmountModeLabel(mode) {
    return mode === "VARIABLE" ? "Variable" : "Fijo";
}
function getMergedCaption(rows, rowIndex, kind, amountIndex = 0) {
    const masterIndex = findMasterRowIndex(rows, rowIndex, kind, amountIndex);
    return `Fusionado con ${getTemplateRowLabel(masterIndex)}`;
}
function getEnabledAmountColumns(amountColumns) {
    return amountColumns
        .map((column, amountIndex) => ({ column, amountIndex: amountIndex }))
        .filter(({ column }) => column.enabled);
}
function getPreviewCellValue(cell, amountMode) {
    const cleanValue = normalizeText(cell.value);
    if (!cleanValue) {
        return "Sin definir";
    }
    if (amountMode === "FIXED") {
        return formatCurrency(parseAmountInput(cleanValue));
    }
    return cleanValue;
}
function LineItemsEditor(props) {
    const total = props.items.reduce((sum, item) => sum + parseAmountInput(item.amountMxn), 0);
    function updateLineItem(itemId, field, value) {
        props.onChange(props.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)));
    }
    function addLineItem() {
        props.onChange([...props.items, createEditableLineItem()]);
    }
    function removeLineItem(itemId) {
        if (props.items.length === 1) {
            props.onChange([createEditableLineItem()]);
            return;
        }
        props.onChange(props.items.filter((item) => item.id !== itemId));
    }
    return (_jsxs("div", { className: "quotes-line-editor", children: [_jsxs("div", { className: "panel-header quotes-line-editor-header", children: [_jsx("h3", { children: props.title }), _jsx("span", { children: formatCurrency(total) })] }), _jsx("div", { className: "quotes-line-editor-body", children: props.items.map((item, index) => (_jsxs("div", { className: "quotes-line-item-row", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: getTemplateRowLabel(index) }), _jsx("input", { type: "text", value: item.concept, onChange: (event) => updateLineItem(item.id, "concept", event.target.value), placeholder: "Honorarios, anticipo, tramite, etc." })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Monto MXN" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: item.amountMxn, onChange: (event) => updateLineItem(item.id, "amountMxn", event.target.value), placeholder: "0.00" })] }), _jsxs("div", { className: "quotes-line-item-actions", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: addLineItem, children: "+ Concepto" }), _jsx("button", { type: "button", className: "danger-button", onClick: () => removeLineItem(item.id), children: "Quitar" })] })] }, item.id))) })] }));
}
function TemplateAmountColumnConfig(props) {
    return (_jsxs("div", { className: "quote-template-amount-config", children: [_jsxs("div", { className: "quote-template-amount-config-head", children: [_jsx("strong", { children: props.column.title }), props.secondary ? (_jsxs("label", { className: "quote-template-checkbox", children: [_jsx("input", { type: "checkbox", checked: props.column.enabled, onChange: (event) => props.onToggleSecondary?.(event.target.checked) }), _jsx("span", { children: "Habilitar segunda columna de monto" })] })) : (_jsx("span", { className: "muted", children: "Columna principal obligatoria" }))] }), props.column.enabled ? (_jsxs("div", { className: "quote-template-mode-toggle", children: [_jsxs("label", { className: `quote-template-mode-pill ${props.column.mode === "FIXED" ? "is-active" : ""}`, children: [_jsx("input", { type: "checkbox", checked: props.column.mode === "FIXED", onChange: () => props.onModeChange("FIXED") }), _jsx("span", { children: "Monto fijo" })] }), _jsxs("label", { className: `quote-template-mode-pill ${props.column.mode === "VARIABLE" ? "is-active" : ""}`, children: [_jsx("input", { type: "checkbox", checked: props.column.mode === "VARIABLE", onChange: () => props.onModeChange("VARIABLE") }), _jsx("span", { children: "Monto variable" })] })] })) : (_jsx("p", { className: "muted", children: "Activa esta columna para usar una segunda via de cobro o presupuesto." }))] }));
}
function TemplateCellMergeControls(props) {
    if (props.disabled) {
        return null;
    }
    return (_jsxs("div", { className: "quote-template-merge-controls", children: [_jsx("button", { type: "button", className: "secondary-button", disabled: !props.canMergeUp, onClick: props.onMergeUp, children: "Fusionar arriba" }), _jsx("button", { type: "button", className: "secondary-button", disabled: !props.canMergeDown, onClick: props.onMergeDown, children: "Fusionar abajo" }), _jsx("button", { type: "button", className: "danger-button", disabled: !props.canUnmerge, onClick: props.onUnmerge, children: "Deshacer" })] }));
}
function TemplateSummaryGrid(props) {
    return (_jsx("div", { className: "quote-template-summary-grid", children: props.amountColumns
            .map((column, amountIndex) => ({
            column,
            amountIndex: amountIndex,
            summary: getAmountColumnSummary(props.tableRows, column, amountIndex)
        }))
            .filter(({ column }) => column.enabled)
            .map(({ column, amountIndex, summary }) => (_jsxs("article", { className: "quote-template-summary-card", children: [_jsxs("div", { className: "quote-template-summary-head", children: [_jsx("strong", { children: column.title }), _jsx("span", { children: getAmountModeLabel(column.mode) })] }), summary ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "quote-template-summary-row", children: [_jsx("span", { children: "Sin IVA" }), _jsx("strong", { children: formatCurrency(summary.subtotal) })] }), _jsxs("div", { className: "quote-template-summary-row", children: [_jsx("span", { children: "IVA" }), _jsx("strong", { children: formatCurrency(summary.iva) })] }), _jsxs("div", { className: "quote-template-summary-row quote-template-summary-total", children: [_jsx("span", { children: "Total con IVA" }), _jsx("strong", { children: formatCurrency(summary.total) })] })] })) : (_jsx("p", { className: "muted", children: "Esta columna usa monto variable, asi que no se calcula sumatoria final." })), amountIndex === 0 ? null : _jsx("small", { className: "muted", children: "Resumen independiente por columna." })] }, column.id))) }));
}
function TemplateVisualPreview(props) {
    const enabledAmountColumns = getEnabledAmountColumns(props.amountColumns);
    const servicesLabel = props.servicesLabel ?? "Servicios";
    const emptyServicesText = props.emptyServicesText ?? "Sin servicios capturados.";
    return (_jsxs("section", { className: "quote-template-visual-preview", children: [_jsxs("div", { className: "quote-template-visual-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: props.heading }), _jsx("h3", { children: props.templateNumber })] }), _jsxs("div", { className: "quote-template-visual-meta", children: [_jsx("span", { children: getTeamLabel(props.team) }), _jsx("span", { children: getQuoteTypeLabel(props.quoteType) }), _jsxs("span", { children: ["Hito: ", normalizeText(props.milestone) || "-"] })] })] }), _jsxs("div", { className: "quotes-template-services", children: [_jsx("strong", { children: servicesLabel }), _jsx("p", { children: normalizeText(props.services) || emptyServicesText })] }), _jsx("div", { className: "quote-template-preview-table-shell", children: _jsxs("table", { className: "quote-template-preview-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Sin titulo" }), _jsx("th", { children: "Conceptos" }), enabledAmountColumns.map(({ column }) => (_jsxs("th", { children: [column.title, _jsx("small", { children: getAmountModeLabel(column.mode) })] }, column.id))), _jsx("th", { children: "Momento de pago" }), _jsx("th", { children: "Notas" })] }) }), _jsx("tbody", { children: props.tableRows.map((row, rowIndex) => (_jsxs("tr", { children: [_jsx("td", { className: "quote-template-preview-index", children: _jsx("div", { className: "quote-template-preview-cell-content", children: _jsx("span", { children: getTemplateRowLabel(rowIndex) }) }) }), _jsx("td", { children: _jsx("div", { className: "quote-template-preview-cell-content", children: normalizeText(row.conceptDescription) || "Sin descripcion" }) }), enabledAmountColumns.map(({ column, amountIndex }) => {
                                        const cell = row.amountCells[amountIndex];
                                        if (cell.hidden) {
                                            return null;
                                        }
                                        return (_jsx("td", { rowSpan: cell.rowSpan, className: cell.rowSpan > 1 ? "quote-template-preview-merged-cell" : undefined, children: _jsx("div", { className: "quote-template-preview-cell-content", children: getPreviewCellValue(cell, column.mode) }) }, column.id));
                                    }), row.paymentMoment.hidden ? null : (_jsx("td", { rowSpan: row.paymentMoment.rowSpan, className: row.paymentMoment.rowSpan > 1 ? "quote-template-preview-merged-cell" : undefined, children: _jsx("div", { className: "quote-template-preview-cell-content", children: getPreviewCellValue(row.paymentMoment) }) })), row.notesCell.hidden ? null : (_jsx("td", { rowSpan: row.notesCell.rowSpan, className: row.notesCell.rowSpan > 1 ? "quote-template-preview-merged-cell" : undefined, children: _jsx("div", { className: "quote-template-preview-cell-content", children: getPreviewCellValue(row.notesCell) }) }))] }, row.id))) })] }) }), _jsx(TemplateSummaryGrid, { amountColumns: props.amountColumns, tableRows: props.tableRows })] }));
}
function TemplateConceptCard(props) {
    function renderAmountField(amountIndex) {
        const column = props.amountColumns[amountIndex];
        if (!column.enabled) {
            return null;
        }
        const cell = props.row.amountCells[amountIndex];
        const masterIndex = findMasterRowIndex(props.rows, props.rowIndex, "amount", amountIndex);
        const isMaster = !cell.hidden;
        return (_jsxs("div", { className: "quote-template-field", children: [_jsxs("div", { className: "quote-template-field-head", children: [_jsx("span", { children: column.title }), _jsx("small", { children: getAmountModeLabel(column.mode) })] }), isMaster ? (_jsxs(_Fragment, { children: [column.mode === "FIXED" ? (_jsx("input", { type: "number", min: "0", step: "0.01", value: cell.value, disabled: props.readOnly, onChange: (event) => props.onRowChange?.(props.rowIndex, (row) => ({
                                ...row,
                                amountCells: row.amountCells.map((amountCell, index) => index === amountIndex ? { ...amountCell, value: event.target.value } : amountCell)
                            })), placeholder: "0.00" })) : (_jsx("input", { type: "text", value: cell.value, disabled: props.readOnly, onChange: (event) => props.onRowChange?.(props.rowIndex, (row) => ({
                                ...row,
                                amountCells: row.amountCells.map((amountCell, index) => index === amountIndex ? { ...amountCell, value: event.target.value } : amountCell)
                            })), placeholder: "Texto variable" })), cell.rowSpan > 1 ? (_jsxs("span", { className: "quote-template-merge-badge", children: ["Abarca ", cell.rowSpan, " conceptos"] })) : null, _jsx(TemplateCellMergeControls, { disabled: props.readOnly, canMergeUp: props.rowIndex > 0, canMergeDown: props.rowIndex < props.rows.length - 1, canUnmerge: cell.rowSpan > 1, onMergeUp: () => props.onMerge?.("up", "amount", props.rowIndex, amountIndex), onMergeDown: () => props.onMerge?.("down", "amount", props.rowIndex, amountIndex), onUnmerge: () => props.onUnmerge?.("amount", props.rowIndex, amountIndex) })] })) : (_jsx("div", { className: "quote-template-merged-note", children: getMergedCaption(props.rows, props.rowIndex, "amount", amountIndex) }))] }, column.id));
    }
    const paymentCell = props.row.paymentMoment;
    const paymentIsMaster = !paymentCell.hidden;
    const notesCell = props.row.notesCell;
    const notesIsMaster = !notesCell.hidden;
    return (_jsxs("article", { className: "quote-template-row-card", children: [_jsxs("div", { className: "quote-template-row-head", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Sin titulo" }), _jsx("h3", { children: getTemplateRowLabel(props.rowIndex) })] }), _jsx("div", { className: "quote-template-row-actions", children: !props.readOnly ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => props.onInsertAfter?.(props.rowIndex), children: "+ Concepto" }), _jsx("button", { type: "button", className: "danger-button", onClick: () => props.onRemove?.(props.rowIndex), children: "Quitar" })] })) : null })] }), _jsxs("div", { className: "quote-template-row-grid", children: [_jsxs("label", { className: "form-field quote-template-field quote-template-field-wide", children: [_jsx("span", { children: "Conceptos" }), _jsx("textarea", { rows: 3, value: props.row.conceptDescription, readOnly: props.readOnly, onChange: (event) => props.onRowChange?.(props.rowIndex, (row) => ({
                                    ...row,
                                    conceptDescription: event.target.value
                                })), placeholder: "Describe el alcance o concepto de este servicio" })] }), renderAmountField(0), renderAmountField(1), _jsxs("div", { className: "quote-template-field", children: [_jsxs("div", { className: "quote-template-field-head", children: [_jsx("span", { children: "Momento de pago" }), _jsx("small", { children: "Fusionable" })] }), paymentIsMaster ? (_jsxs(_Fragment, { children: [_jsx("textarea", { rows: 3, value: paymentCell.value, readOnly: props.readOnly, onChange: (event) => props.onRowChange?.(props.rowIndex, (row) => ({
                                            ...row,
                                            paymentMoment: {
                                                ...row.paymentMoment,
                                                value: event.target.value
                                            }
                                        })), placeholder: "Ej. Anticipo, contra entrega, parcialidad" }), paymentCell.rowSpan > 1 ? (_jsxs("span", { className: "quote-template-merge-badge", children: ["Abarca ", paymentCell.rowSpan, " conceptos"] })) : null, _jsx(TemplateCellMergeControls, { disabled: props.readOnly, canMergeUp: props.rowIndex > 0, canMergeDown: props.rowIndex < props.rows.length - 1, canUnmerge: paymentCell.rowSpan > 1, onMergeUp: () => props.onMerge?.("up", "payment", props.rowIndex), onMergeDown: () => props.onMerge?.("down", "payment", props.rowIndex), onUnmerge: () => props.onUnmerge?.("payment", props.rowIndex) })] })) : (_jsx("div", { className: "quote-template-merged-note", children: getMergedCaption(props.rows, props.rowIndex, "payment") }))] }), _jsxs("div", { className: "quote-template-field", children: [_jsxs("div", { className: "quote-template-field-head", children: [_jsx("span", { children: "Notas" }), _jsx("small", { children: "Fusionable" })] }), notesIsMaster ? (_jsxs(_Fragment, { children: [_jsx("textarea", { rows: 3, value: notesCell.value, readOnly: props.readOnly, onChange: (event) => props.onRowChange?.(props.rowIndex, (row) => ({
                                            ...row,
                                            notesCell: {
                                                ...row.notesCell,
                                                value: event.target.value
                                            }
                                        })), placeholder: "Texto libre" }), notesCell.rowSpan > 1 ? (_jsxs("span", { className: "quote-template-merge-badge", children: ["Abarca ", notesCell.rowSpan, " conceptos"] })) : null, _jsx(TemplateCellMergeControls, { disabled: props.readOnly, canMergeUp: props.rowIndex > 0, canMergeDown: props.rowIndex < props.rows.length - 1, canUnmerge: notesCell.rowSpan > 1, onMergeUp: () => props.onMerge?.("up", "notes", props.rowIndex), onMergeDown: () => props.onMerge?.("down", "notes", props.rowIndex), onUnmerge: () => props.onUnmerge?.("notes", props.rowIndex) })] })) : (_jsx("div", { className: "quote-template-merged-note", children: getMergedCaption(props.rows, props.rowIndex, "notes") }))] })] })] }));
}
export function QuotesPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState("new-template");
    const [sourceMode, setSourceMode] = useState("template");
    const [quotes, setQuotes] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [savingQuote, setSavingQuote] = useState(false);
    const [exportingFormat, setExportingFormat] = useState(null);
    const [savedQuoteDownload, setSavedQuoteDownload] = useState(null);
    const [deletingQuoteId, setDeletingQuoteId] = useState(null);
    const [deletingTemplateId, setDeletingTemplateId] = useState(null);
    const [translatingTemplateId, setTranslatingTemplateId] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [flash, setFlash] = useState(null);
    const [editingQuoteId, setEditingQuoteId] = useState(null);
    const [expandedTemplateId, setExpandedTemplateId] = useState(null);
    const [editingTemplateId, setEditingTemplateId] = useState(null);
    const [viewingQuote, setViewingQuote] = useState(null);
    const [quotePendingDelete, setQuotePendingDelete] = useState(null);
    const [templatePendingDelete, setTemplatePendingDelete] = useState(null);
    const [preparedQuote, setPreparedQuote] = useState(null);
    const [selectedTemplateId, setSelectedTemplateId] = useState("");
    const [templateForm, setTemplateForm] = useState(() => buildEmptyTemplateForm(user?.team));
    const [quoteForm, setQuoteForm] = useState(() => buildEmptyQuoteForm(user?.team));
    const [quoteTemplateDraft, setQuoteTemplateDraft] = useState(null);
    const [templateWordSearch, setTemplateWordSearch] = useState("");
    const [templateTeamSearch, setTemplateTeamSearch] = useState("");
    const [quoteWordSearch, setQuoteWordSearch] = useState("");
    const [quoteClientSearch, setQuoteClientSearch] = useState("");
    useEffect(() => {
        void loadBoard();
    }, []);
    async function loadBoard() {
        setLoading(true);
        setErrorMessage(null);
        try {
            const [quoteRows, templateRows, clientRows] = await Promise.all([
                apiGet("/quotes"),
                apiGet("/quotes/templates"),
                apiGet("/clients")
            ]);
            setQuotes(sortQuotes(quoteRows));
            setTemplates(sortTemplates(templateRows));
            setClients([...clientRows].sort((left, right) => left.name.localeCompare(right.name, "es-MX")));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    function updateTemplateRow(rowIndex, updater) {
        setTemplateForm((current) => ({
            ...current,
            tableRows: current.tableRows.map((row, index) => (index === rowIndex ? updater(row) : row))
        }));
    }
    function updateQuoteForm(next) {
        setPreparedQuote(null);
        setQuoteForm((current) => (typeof next === "function" ? next(current) : next));
    }
    function updateQuoteTemplateDraft(next) {
        setPreparedQuote(null);
        setQuoteTemplateDraft((current) => {
            if (typeof next !== "function") {
                return next;
            }
            if (!current) {
                return current;
            }
            return next(current);
        });
    }
    function resetQuoteComposer(nextMode = sourceMode) {
        const template = nextMode === "template" ? templates.find((item) => item.id === selectedTemplateId) : undefined;
        setEditingQuoteId(null);
        setPreparedQuote(null);
        setQuoteForm(template ? buildQuoteFormFromTemplate(template, user?.team) : buildEmptyQuoteForm(user?.team));
        setQuoteTemplateDraft(nextMode === "generic"
            ? buildEmptyQuoteTemplateDraft()
            : template
                ? buildQuoteTemplateDraftFromTemplate(template)
                : null);
    }
    function startNewTemplate() {
        setFlash(null);
        setEditingTemplateId(null);
        setTemplateForm(buildEmptyTemplateForm(user?.team));
        setActiveTab("new-template");
    }
    function applyTemplateToQuoteForm(template, language = "es") {
        setSourceMode("template");
        setSelectedTemplateId(template.id);
        updateQuoteForm(buildQuoteFormFromTemplate(template, user?.team, language));
        updateQuoteTemplateDraft(buildQuoteTemplateDraftFromTemplate(template));
    }
    async function handleTemplateUse(template, language) {
        setFlash(null);
        setEditingQuoteId(null);
        setPreparedQuote(null);
        if (language === "en") {
            setTranslatingTemplateId(template.id);
            try {
                const response = await apiPost("/quotes/templates/translate", { template });
                window.alert("La plantilla fue traducida exitosamente.");
                applyTemplateToQuoteForm(response.template, "en");
                setActiveTab("new-quote-template");
            }
            catch (error) {
                window.alert("La plantilla no pudo ser traducida.");
                setFlash({
                    tone: "error",
                    text: `La plantilla no pudo ser traducida. ${toErrorMessage(error)}`
                });
            }
            finally {
                setTranslatingTemplateId(null);
            }
            return;
        }
        applyTemplateToQuoteForm(template, language);
        setActiveTab("new-quote-template");
    }
    function handleTemplateEdit(template) {
        setFlash(null);
        setEditingTemplateId(template.id);
        setTemplateForm(buildTemplateFormFromTemplate(template));
        setActiveTab("new-template");
    }
    function handleTemplateDeleteRequest(template) {
        setFlash(null);
        setTemplatePendingDelete(template);
    }
    function handleQuoteView(quote) {
        setViewingQuote(quote);
    }
    function handleQuoteEdit(quote) {
        setFlash(null);
        setEditingQuoteId(quote.id);
        setPreparedQuote(null);
        setSourceMode("generic");
        setSelectedTemplateId("");
        setQuoteForm(buildQuoteFormFromQuote(quote));
        setQuoteTemplateDraft(buildQuoteTemplateDraftFromQuote(quote));
        setActiveTab("new-quote-generic");
    }
    function handleQuoteDeleteRequest(quote) {
        setFlash(null);
        setQuotePendingDelete(quote);
    }
    async function handleQuoteDeleteConfirm() {
        if (!quotePendingDelete) {
            return;
        }
        const quoteId = quotePendingDelete.id;
        const quoteNumber = quotePendingDelete.quoteNumber;
        setDeletingQuoteId(quoteId);
        try {
            await apiDelete(`/quotes/${quoteId}`);
            setQuotes((current) => current.filter((quote) => quote.id !== quoteId));
            setViewingQuote((current) => (current?.id === quoteId ? null : current));
            if (editingQuoteId === quoteId) {
                setEditingQuoteId(null);
                setPreparedQuote(null);
                setQuoteForm(buildEmptyQuoteForm(user?.team));
                setQuoteTemplateDraft(null);
            }
            if (preparedQuote?.id === quoteId) {
                setPreparedQuote(null);
            }
            setQuotePendingDelete(null);
            setFlash({
                tone: "success",
                text: `La cotizacion ${quoteNumber} fue eliminada correctamente.`
            });
        }
        catch (error) {
            setFlash({
                tone: "error",
                text: toErrorMessage(error)
            });
        }
        finally {
            setDeletingQuoteId(null);
        }
    }
    async function handleTemplateDeleteConfirm() {
        if (!templatePendingDelete) {
            return;
        }
        const templateId = templatePendingDelete.id;
        const templateNumber = templatePendingDelete.templateNumber;
        setDeletingTemplateId(templateId);
        try {
            await apiDelete(`/quotes/templates/${templateId}`);
            setTemplates((current) => current.filter((template) => template.id !== templateId));
            setExpandedTemplateId((current) => (current === templateId ? null : current));
            setSelectedTemplateId((current) => (current === templateId ? "" : current));
            if (editingTemplateId === templateId) {
                setEditingTemplateId(null);
                setTemplateForm(buildEmptyTemplateForm(user?.team));
            }
            setTemplatePendingDelete(null);
            setFlash({
                tone: "success",
                text: `La cotizacion tipo ${templateNumber} fue eliminada correctamente.`
            });
        }
        catch (error) {
            setFlash({
                tone: "error",
                text: toErrorMessage(error)
            });
        }
        finally {
            setDeletingTemplateId(null);
        }
    }
    function handleSourceModeChange(nextMode) {
        setSourceMode(nextMode);
        setFlash(null);
        setEditingQuoteId(null);
        setPreparedQuote(null);
        if (nextMode === "generic") {
            setSelectedTemplateId("");
            setQuoteForm(buildEmptyQuoteForm(user?.team));
            setQuoteTemplateDraft(buildEmptyQuoteTemplateDraft());
            return;
        }
        if (!selectedTemplateId) {
            setQuoteForm(buildEmptyQuoteForm(user?.team));
            setQuoteTemplateDraft(null);
            return;
        }
        const template = templates.find((item) => item.id === selectedTemplateId);
        if (!template) {
            setQuoteForm(buildEmptyQuoteForm(user?.team));
            setQuoteTemplateDraft(null);
            return;
        }
        setQuoteForm(buildQuoteFormFromTemplate(template, user?.team));
        setQuoteTemplateDraft(buildQuoteTemplateDraftFromTemplate(template));
    }
    function handleQuoteComposerTab(nextMode) {
        handleSourceModeChange(nextMode);
        setActiveTab(nextMode === "template" ? "new-quote-template" : "new-quote-generic");
    }
    function handleGenericQuoteLanguageChange(language) {
        updateQuoteForm((current) => ({
            ...current,
            language
        }));
    }
    function handleTemplateSelection(templateId) {
        setSelectedTemplateId(templateId);
        setEditingQuoteId(null);
        setPreparedQuote(null);
        const template = templates.find((item) => item.id === templateId);
        if (!template) {
            setQuoteForm(buildEmptyQuoteForm(user?.team));
            setQuoteTemplateDraft(null);
            return;
        }
        setQuoteForm(buildQuoteFormFromTemplate(template, user?.team));
        setQuoteTemplateDraft(buildQuoteTemplateDraftFromTemplate(template));
    }
    function handleClientSelection(clientId) {
        const client = clients.find((item) => item.id === clientId);
        updateQuoteForm((current) => ({
            ...current,
            clientId,
            clientName: client?.name ?? ""
        }));
    }
    function updateQuoteTemplateRow(rowIndex, updater) {
        updateQuoteTemplateDraft((current) => ({
            ...current,
            tableRows: current.tableRows.map((row, index) => (index === rowIndex ? updater(row) : row))
        }));
    }
    function handleQuoteTemplateMerge(direction, kind, rowIndex, amountIndex) {
        updateQuoteTemplateDraft((current) => ({
            ...current,
            tableRows: direction === "up"
                ? mergeTemplateCellUp(current.tableRows, rowIndex, kind, amountIndex ?? 0)
                : mergeTemplateCellDown(current.tableRows, rowIndex, kind, amountIndex ?? 0)
        }));
    }
    function handleQuoteTemplateUnmerge(kind, rowIndex, amountIndex) {
        updateQuoteTemplateDraft((current) => ({
            ...current,
            tableRows: unmergeTemplateCell(current.tableRows, rowIndex, kind, amountIndex ?? 0)
        }));
    }
    function handleMerge(direction, kind, rowIndex, amountIndex) {
        setTemplateForm((current) => ({
            ...current,
            tableRows: direction === "up"
                ? mergeTemplateCellUp(current.tableRows, rowIndex, kind, amountIndex ?? 0)
                : mergeTemplateCellDown(current.tableRows, rowIndex, kind, amountIndex ?? 0)
        }));
    }
    function handleUnmerge(kind, rowIndex, amountIndex) {
        setTemplateForm((current) => ({
            ...current,
            tableRows: unmergeTemplateCell(current.tableRows, rowIndex, kind, amountIndex ?? 0)
        }));
    }
    async function persistQuoteIfNeeded() {
        if (!quoteForm.clientId) {
            throw new Error("Selecciona el cliente para guardar la cotizacion.");
        }
        const client = clients.find((entry) => entry.id === quoteForm.clientId);
        if (!client) {
            throw new Error("No se encontro el cliente seleccionado.");
        }
        if (sourceMode === "template" && !quoteTemplateDraft) {
            throw new Error("Selecciona una cotizacion tipo para generar esta cotizacion.");
        }
        const lineItems = quoteTemplateDraft
            ? buildLineItemsFromTemplateDraft(quoteTemplateDraft)
            : buildLineItemsPayload(quoteForm.lineItems);
        const payload = {
            clientId: client.id,
            clientName: client.name,
            responsibleTeam: quoteForm.responsibleTeam || undefined,
            subject: normalizeText(quoteForm.subject),
            status: quoteForm.status,
            quoteType: quoteForm.quoteType,
            language: quoteForm.language,
            quoteDate: quoteForm.quoteDate || getTodayDateInputValue(),
            amountColumns: quoteTemplateDraft?.amountColumns,
            tableRows: quoteTemplateDraft?.tableRows,
            lineItems,
            milestone: normalizeText(quoteForm.milestone) || undefined,
            notes: normalizeText(quoteForm.notes) || undefined
        };
        if (payload.subject.length < 3) {
            throw new Error("El asunto debe tener al menos 3 caracteres.");
        }
        if (editingQuoteId) {
            const updatedQuote = await apiPatch(`/quotes/${editingQuoteId}`, payload);
            setQuotes((current) => sortQuotes(current.map((quote) => (quote.id === updatedQuote.id ? updatedQuote : quote))));
            setViewingQuote((current) => (current?.id === updatedQuote.id ? updatedQuote : current));
            return updatedQuote;
        }
        if (preparedQuote) {
            return preparedQuote;
        }
        const createdQuote = await apiPost("/quotes", payload);
        setQuotes((current) => sortQuotes([createdQuote, ...current]));
        setEditingQuoteId(createdQuote.id);
        setPreparedQuote(createdQuote);
        return createdQuote;
    }
    async function handleTemplateSubmit(event) {
        event.preventDefault();
        setSavingTemplate(true);
        setFlash(null);
        try {
            if (!templateForm.team) {
                throw new Error("Selecciona el equipo al que pertenece la cotizacion tipo.");
            }
            if (normalizeText(templateForm.services).length < 2) {
                throw new Error("Agrega el texto libre de servicios para la cotizacion tipo.");
            }
            if (templateForm.tableRows.length === 0) {
                throw new Error("Agrega al menos un concepto a la tabla de la cotizacion tipo.");
            }
            const payload = buildTemplatePayload(templateForm);
            const savedTemplate = editingTemplateId
                ? await apiPatch(`/quotes/templates/${editingTemplateId}`, payload)
                : await apiPost("/quotes/templates", payload);
            setTemplates((current) => sortTemplates(editingTemplateId
                ? current.map((template) => (template.id === savedTemplate.id ? savedTemplate : template))
                : [savedTemplate, ...current]));
            if (selectedTemplateId === savedTemplate.id && sourceMode === "template") {
                applyTemplateToQuoteForm(savedTemplate);
            }
            setEditingTemplateId(null);
            setExpandedTemplateId(savedTemplate.id);
            setTemplateForm(buildEmptyTemplateForm(user?.team));
            setFlash({
                tone: "success",
                text: editingTemplateId
                    ? `La cotizacion tipo ${savedTemplate.templateNumber} se actualizo correctamente.`
                    : `La cotizacion tipo ${savedTemplate.templateNumber} ya quedo guardada y disponible para reutilizarse.`
            });
            setActiveTab("templates");
        }
        catch (error) {
            setFlash({
                tone: "error",
                text: toErrorMessage(error)
            });
        }
        finally {
            setSavingTemplate(false);
        }
    }
    async function handleQuoteSubmit(event) {
        event.preventDefault();
        setSavingQuote(true);
        setFlash(null);
        try {
            const isEditing = Boolean(editingQuoteId);
            const savedQuote = await persistQuoteIfNeeded();
            const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
            setEditingQuoteId(null);
            setPreparedQuote(null);
            setQuoteForm(sourceMode === "template" && selectedTemplate
                ? buildQuoteFormFromTemplate(selectedTemplate, user?.team)
                : buildEmptyQuoteForm(user?.team));
            setQuoteTemplateDraft(sourceMode === "template" && selectedTemplate
                ? buildQuoteTemplateDraftFromTemplate(selectedTemplate)
                : buildEmptyQuoteTemplateDraft());
            setFlash({
                tone: "success",
                text: isEditing
                    ? `La cotizacion ${savedQuote.quoteNumber} se actualizo correctamente.`
                    : `La cotizacion ${savedQuote.quoteNumber} ya quedo guardada para ${savedQuote.clientName}.`
            });
            setActiveTab("quotes");
        }
        catch (error) {
            setFlash({
                tone: "error",
                text: toErrorMessage(error)
            });
        }
        finally {
            setSavingQuote(false);
        }
    }
    async function handleQuoteDownload(format) {
        setExportingFormat(format);
        setFlash(null);
        try {
            const quote = await persistQuoteIfNeeded();
            const { blob, filename } = await apiDownload(`/quotes/${quote.id}/export/${format}`);
            downloadBlobFile(blob, filename ?? `${quote.quoteNumber}.${format === "pdf" ? "pdf" : "docx"}`);
            setFlash({
                tone: "success",
                text: `La cotizacion ${quote.quoteNumber} se descargo en ${format === "pdf" ? "PDF" : "Word"}.`
            });
        }
        catch (error) {
            setFlash({
                tone: "error",
                text: toErrorMessage(error)
            });
        }
        finally {
            setExportingFormat(null);
        }
    }
    async function handleSavedQuoteDownload(quote, format) {
        setSavedQuoteDownload({ quoteId: quote.id, format });
        setFlash(null);
        try {
            const { blob, filename } = await apiDownload(`/quotes/${quote.id}/export/${format}`);
            downloadBlobFile(blob, filename ?? `${quote.quoteNumber}.${format === "pdf" ? "pdf" : "docx"}`);
            setFlash({
                tone: "success",
                text: `La cotizacion ${quote.quoteNumber} se descargo en ${format === "pdf" ? "PDF" : "Word"}.`
            });
        }
        catch (error) {
            setFlash({
                tone: "error",
                text: toErrorMessage(error)
            });
        }
        finally {
            setSavedQuoteDownload(null);
        }
    }
    const filteredTemplates = filterTemplatesForSearch(templates, templateWordSearch, templateTeamSearch);
    const filteredQuotes = filterQuotesForSearch(quotes, clients, quoteWordSearch, quoteClientSearch);
    const templateGroups = groupTemplatesByTeam(filteredTemplates);
    const quoteGroups = groupQuotesByClient(filteredQuotes, clients);
    const editingQuote = quotes.find((item) => item.id === editingQuoteId);
    const selectedTemplate = templates.find((item) => item.id === selectedTemplateId);
    const editingTemplate = templates.find((item) => item.id === editingTemplateId);
    const viewingQuoteDraft = viewingQuote ? buildQuoteTemplateDraftFromQuote(viewingQuote) : null;
    const suggestedQuoteNumber = editingQuote?.quoteNumber ?? preparedQuote?.quoteNumber ?? buildNextQuoteNumber(quotes);
    const suggestedTemplateNumber = buildNextTemplateNumber(templates);
    const templateFormNumber = editingTemplate?.templateNumber ?? suggestedTemplateNumber;
    return (_jsxs("section", { className: "page-stack quotes-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Cot" }), _jsx("div", { children: _jsx("h2", { children: "Cotizaciones" }) })] }), _jsx("p", { className: "muted", children: "El modulo ahora separa cotizaciones tipo por equipo, permite guardarlas como plantillas reutilizables y mantiene la consulta de cotizaciones guardadas por cliente." })] }), _jsx("section", { className: "panel", children: _jsxs("div", { className: "leads-tabs", role: "tablist", "aria-label": "Vistas de cotizaciones", children: [_jsx("button", { type: "button", className: `lead-tab ${activeTab === "new-template" ? "is-active" : ""}`, onClick: startNewTemplate, children: "1. Guardar nueva tipo" }), _jsx("button", { type: "button", className: `lead-tab ${activeTab === "templates" ? "is-active" : ""}`, onClick: () => setActiveTab("templates"), children: "2. Cotizaciones tipo" }), _jsx("button", { type: "button", className: `lead-tab ${activeTab === "quotes" ? "is-active" : ""}`, onClick: () => setActiveTab("quotes"), children: "3. Cotizaciones por cliente" }), _jsx("button", { type: "button", className: `lead-tab ${activeTab === "new-quote-template" ? "is-active" : ""}`, onClick: () => handleQuoteComposerTab("template"), children: "4. Generar nueva desde plantilla" }), _jsx("button", { type: "button", className: `lead-tab ${activeTab === "new-quote-generic" ? "is-active" : ""}`, onClick: () => handleQuoteComposerTab("generic"), children: "5. Generar nueva desde plantilla en blanco (no se guarda la plantilla)" })] }) }), flash ? _jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text }) : null, errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, loading ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "Cargando modulo de cotizaciones..." }) })) : null, !loading && activeTab === "templates" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Cotizaciones tipo" }), _jsxs("span", { children: [filteredTemplates.length, " plantillas"] })] }), _jsxs("div", { className: "matters-toolbar execution-search-toolbar", children: [_jsxs("div", { className: "matters-filters leads-search-filters matters-active-search-filters execution-search-filters", children: [_jsxs("label", { className: "form-field matters-search-field", children: [_jsx("span", { children: "Buscar por palabra" }), _jsx("input", { type: "text", value: templateWordSearch, onChange: (event) => setTemplateWordSearch(event.target.value), placeholder: "No., servicios, concepto, hito..." })] }), _jsxs("label", { className: "form-field matters-search-field", children: [_jsx("span", { children: "Buscador por equipo" }), _jsx("input", { type: "text", value: templateTeamSearch, onChange: (event) => setTemplateTeamSearch(event.target.value), placeholder: "Buscar palabra del equipo..." })] })] }), _jsx("div", { className: "matters-toolbar-actions", children: _jsx("span", { className: "muted", children: "Filtra por equipo o por contenido para encontrar una plantilla reutilizable." }) })] })] }), templates.length === 0 ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "Aun no hay cotizaciones tipo guardadas." }) })) : templateGroups.length === 0 ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "No hay cotizaciones tipo que coincidan con la busqueda." }) })) : (templateGroups.map((group) => (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: group.label }), _jsxs("span", { children: [group.items.length, " plantillas"] })] }), _jsx("div", { className: "quotes-template-list", children: group.items.map((template) => {
                                    const isExpanded = expandedTemplateId === template.id;
                                    return (_jsxs("article", { className: `quotes-template-list-item ${isExpanded ? "is-expanded" : ""}`, children: [_jsxs("div", { className: "quotes-template-list-row", children: [_jsxs("div", { className: "quotes-template-list-main", children: [_jsxs("div", { className: "quotes-template-list-head", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Cotizacion tipo" }), _jsx("h3", { children: template.templateNumber })] }), _jsx("span", { className: `lead-type-pill ${template.quoteType === "RETAINER" ? "is-retainer" : ""}`, children: getQuoteTypeLabel(template.quoteType) })] }), _jsx("p", { className: "quotes-template-list-subject", children: normalizeText(template.subject) || "Sin titulo" }), _jsx("p", { className: "quotes-template-list-summary", children: summarizeTemplateServices(template.services) }), _jsxs("div", { className: "quotes-template-list-meta", children: [_jsxs("span", { children: [template.tableRows.length, " conceptos"] }), _jsxs("span", { children: ["Total: ", getTemplateAmountPreview(template)] }), _jsxs("span", { children: ["Hito: ", template.milestone || "-"] }), _jsxs("span", { children: ["Actualizada: ", formatDate(template.updatedAt)] })] })] }), _jsxs("div", { className: "quotes-template-list-actions", children: [_jsx("button", { type: "button", className: "secondary-button", "aria-expanded": isExpanded, "aria-controls": `template-preview-${template.id}`, onClick: () => setExpandedTemplateId((current) => (current === template.id ? null : template.id)), children: isExpanded ? "Ocultar" : "Ver" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => handleTemplateEdit(template), children: "Editar" }), _jsx("button", { type: "button", className: "danger-button", disabled: deletingTemplateId === template.id, onClick: () => handleTemplateDeleteRequest(template), children: "Borrar" }), _jsx("button", { type: "button", className: "primary-button", disabled: translatingTemplateId === template.id, onClick: () => void handleTemplateUse(template, "es"), children: "Usar plantilla en espa\u00F1ol" }), _jsx("button", { type: "button", className: "secondary-button", disabled: translatingTemplateId === template.id, onClick: () => void handleTemplateUse(template, "en"), children: translatingTemplateId === template.id ? "Traduciendo..." : "Usar plantilla en inglés" })] })] }), isExpanded ? (_jsx("div", { id: `template-preview-${template.id}`, className: "quotes-template-detail", children: _jsx(TemplateVisualPreview, { heading: "Vista previa", templateNumber: template.templateNumber, team: template.team, quoteType: template.quoteType, milestone: template.milestone, services: template.services, amountColumns: template.amountColumns, tableRows: template.tableRows }) })) : null] }, template.id));
                                }) })] }, group.team))))] })) : null, !loading && activeTab === "new-template" ? (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: editingTemplate ? `Editar cotizacion tipo ${editingTemplate.templateNumber}` : "Guardar nueva cotizacion tipo" }), editingTemplate ? _jsx("p", { className: "muted", children: "Los cambios se guardaran sobre la plantilla existente." }) : null] }), _jsx("button", { type: "button", className: "secondary-button", onClick: startNewTemplate, children: editingTemplate ? "Cancelar edicion" : "Limpiar formulario" })] }), _jsxs("form", { className: "quotes-form", onSubmit: handleTemplateSubmit, children: [_jsxs("div", { className: "quotes-form-grid quote-template-meta-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Equipo" }), _jsxs("select", { value: templateForm.team, onChange: (event) => setTemplateForm((current) => ({ ...current, team: event.target.value })), children: [_jsx("option", { value: "", children: "Seleccionar..." }), QUOTE_TEAM_OPTIONS.map((team) => (_jsx("option", { value: team.key, children: team.label }, team.key)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Numero de cotizacion" }), _jsx("input", { type: "text", value: templateFormNumber, readOnly: true })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Tipo de cotizacion" }), _jsxs("select", { value: templateForm.quoteType, onChange: (event) => setTemplateForm((current) => ({ ...current, quoteType: event.target.value })), children: [_jsx("option", { value: "ONE_TIME", children: "Asunto unico" }), _jsx("option", { value: "RETAINER", children: "Iguala" })] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Hito de conclusion" }), _jsx("input", { type: "text", value: templateForm.milestone, onChange: (event) => setTemplateForm((current) => ({ ...current, milestone: event.target.value })), placeholder: "Ej. Firma, entrega, cierre, aprobacion" })] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Servicios" }), _jsx("textarea", { rows: 4, value: templateForm.services, onChange: (event) => setTemplateForm((current) => ({ ...current, services: event.target.value })), placeholder: "Texto libre para describir el servicio o alcance de la cotizacion tipo" })] }), _jsxs("section", { className: "quote-template-sheet", children: [_jsx("div", { className: "panel-header quote-template-sheet-head", children: _jsxs("div", { children: [_jsx("h3", { children: "Sin titulo" }), _jsx("p", { className: "muted", children: "Los conceptos se capturan como bloques independientes. Puedes fusionar monto, momento de pago y notas entre conceptos contiguos." })] }) }), _jsxs("div", { className: "quote-template-amount-config-grid", children: [_jsx(TemplateAmountColumnConfig, { column: templateForm.amountColumns[0], onModeChange: (mode) => setTemplateForm((current) => ({
                                                    ...current,
                                                    amountColumns: [{ ...current.amountColumns[0], mode }, current.amountColumns[1]]
                                                })) }), _jsx(TemplateAmountColumnConfig, { column: templateForm.amountColumns[1], secondary: true, onToggleSecondary: (enabled) => setTemplateForm((current) => ({
                                                    ...current,
                                                    amountColumns: [
                                                        current.amountColumns[0],
                                                        { ...current.amountColumns[1], enabled }
                                                    ],
                                                    tableRows: enabled ? current.tableRows : resetSecondaryAmountColumn(current.tableRows)
                                                })), onModeChange: (mode) => setTemplateForm((current) => ({
                                                    ...current,
                                                    amountColumns: [current.amountColumns[0], { ...current.amountColumns[1], mode }]
                                                })) })] }), _jsx("div", { className: "quote-template-rows-shell", children: templateForm.tableRows.map((row, rowIndex) => (_jsx(TemplateConceptCard, { row: row, rowIndex: rowIndex, rows: templateForm.tableRows, amountColumns: templateForm.amountColumns, onRowChange: updateTemplateRow, onInsertAfter: (index) => setTemplateForm((current) => ({
                                                ...current,
                                                tableRows: insertTemplateRowAfter(current.tableRows, index)
                                            })), onRemove: (index) => setTemplateForm((current) => ({
                                                ...current,
                                                tableRows: removeTemplateRow(current.tableRows, index)
                                            })), onMerge: handleMerge, onUnmerge: handleUnmerge }, row.id))) }), _jsx(TemplateSummaryGrid, { amountColumns: templateForm.amountColumns, tableRows: templateForm.tableRows })] }), _jsx(TemplateVisualPreview, { heading: "Preview visual", templateNumber: templateFormNumber, team: templateForm.team, quoteType: templateForm.quoteType, milestone: templateForm.milestone, services: templateForm.services, amountColumns: templateForm.amountColumns, tableRows: templateForm.tableRows }), _jsx("div", { className: "form-actions", children: _jsx("button", { type: "submit", className: "primary-button", disabled: savingTemplate, children: savingTemplate ? "Guardando..." : editingTemplate ? "Guardar cambios" : "Guardar cotizacion tipo" }) })] })] })) : null, !loading && activeTab === "quotes" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Cotizaciones por cliente" }), _jsxs("span", { children: [filteredQuotes.length, " registros"] })] }), _jsxs("div", { className: "matters-toolbar execution-search-toolbar", children: [_jsxs("div", { className: "matters-filters leads-search-filters matters-active-search-filters execution-search-filters", children: [_jsxs("label", { className: "form-field matters-search-field", children: [_jsx("span", { children: "Buscar por palabra" }), _jsx("input", { type: "text", value: quoteWordSearch, onChange: (event) => setQuoteWordSearch(event.target.value), placeholder: "No., asunto, equipo, hito, concepto..." })] }), _jsxs("label", { className: "form-field matters-search-field", children: [_jsx("span", { children: "Buscador por cliente" }), _jsx("input", { type: "text", value: quoteClientSearch, onChange: (event) => setQuoteClientSearch(event.target.value), placeholder: "Buscar palabra del cliente..." })] })] }), _jsx("div", { className: "matters-toolbar-actions", children: _jsx("span", { className: "muted", children: "Filtra por cliente y por contenido de la cotizacion antes de abrirla o descargarla." }) })] })] }), quotes.length === 0 ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "Todavia no hay cotizaciones guardadas." }) })) : quoteGroups.length === 0 ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "No hay cotizaciones que coincidan con la busqueda." }) })) : (quoteGroups.map((group) => (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: group.clientName }), _jsx("p", { className: "muted", children: group.clientNumber ? `No. cliente ${group.clientNumber}` : "Cliente sin numero ligado" })] }), _jsxs("span", { children: [group.items.length, " cotizaciones | ", formatCurrency(group.totalMxn)] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No. cotizacion" }), _jsx("th", { children: "Fecha" }), _jsx("th", { children: "Tipo de cotizacion" }), _jsx("th", { children: "Equipo" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Total" }), _jsx("th", { children: "Hito de conclusion" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: group.items.map((quote) => {
                                                const isDownloadingSavedQuote = savedQuoteDownload?.quoteId === quote.id;
                                                return (_jsxs("tr", { children: [_jsx("td", { children: quote.quoteNumber }), _jsx("td", { children: formatDate(getQuoteDisplayDate(quote)) }), _jsx("td", { children: getQuoteTypeLabel(quote.quoteType) }), _jsx("td", { children: getTeamLabel(quote.responsibleTeam) }), _jsx("td", { children: quote.subject }), _jsx("td", { children: formatCurrency(quote.totalMxn) }), _jsx("td", { children: quote.milestone || "-" }), _jsx("td", { children: _jsxs("div", { className: "quotes-table-actions", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => handleQuoteView(quote), children: "Ver" }), _jsx("button", { type: "button", className: "secondary-button", disabled: isDownloadingSavedQuote, onClick: () => void handleSavedQuoteDownload(quote, "pdf"), children: savedQuoteDownload?.quoteId === quote.id && savedQuoteDownload.format === "pdf" ? "PDF..." : "PDF" }), _jsx("button", { type: "button", className: "secondary-button", disabled: isDownloadingSavedQuote, onClick: () => void handleSavedQuoteDownload(quote, "word"), children: savedQuoteDownload?.quoteId === quote.id && savedQuoteDownload.format === "word" ? "Word..." : "Word" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => handleQuoteEdit(quote), children: "Editar" }), _jsx("button", { type: "button", className: "danger-button", disabled: deletingQuoteId === quote.id, onClick: () => handleQuoteDeleteRequest(quote), children: "Borrar" })] }) })] }, quote.id));
                                            }) })] }) })] }, group.clientId ?? group.clientName))))] })) : null, !loading && (activeTab === "new-quote-template" || activeTab === "new-quote-generic") ? (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: editingQuote
                                            ? `Editar cotizacion ${editingQuote.quoteNumber}`
                                            : sourceMode === "template"
                                                ? "Generar nueva desde plantilla"
                                                : "Generar nueva desde plantilla en blanco" }), editingQuote ? _jsx("p", { className: "muted", children: "Los cambios se guardaran sobre la cotizacion existente." }) : null] }), editingQuote ? (_jsx("button", { type: "button", className: "secondary-button", onClick: () => {
                                    setEditingQuoteId(null);
                                    setPreparedQuote(null);
                                    setSourceMode("template");
                                    setSelectedTemplateId("");
                                    setQuoteForm(buildEmptyQuoteForm(user?.team));
                                    setQuoteTemplateDraft(null);
                                    setActiveTab("quotes");
                                }, children: "Cancelar edicion" })) : (_jsx("button", { type: "button", className: "secondary-button", onClick: () => resetQuoteComposer(), children: "Reiniciar captura" }))] }), sourceMode === "template" ? (_jsxs("div", { className: "quotes-template-picker", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Cotizacion tipo base" }), _jsxs("select", { value: selectedTemplateId, onChange: (event) => handleTemplateSelection(event.target.value), children: [_jsx("option", { value: "", children: "Seleccionar plantilla..." }), templates.map((template) => (_jsxs("option", { value: template.id, children: [template.templateNumber, " - ", getTeamLabel(template.team)] }, template.id)))] })] }), _jsx("p", { className: "muted", children: selectedTemplate
                                    ? "La tabla editable de esta cotizacion tipo aparece debajo de los campos de captura."
                                    : "Selecciona una cotizacion tipo para precargar el layout y mostrar su tabla editable debajo de los campos." })] })) : (_jsx("p", { className: "muted", children: "El layout generico empieza en blanco para capturar una propuesta desde cero." })), _jsxs("form", { className: "quotes-form", onSubmit: handleQuoteSubmit, children: [_jsxs("div", { className: "quotes-form-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Cliente" }), _jsxs("select", { value: quoteForm.clientId, onChange: (event) => handleClientSelection(event.target.value), children: [_jsx("option", { value: "", children: "Seleccionar cliente..." }), clients.map((client) => (_jsxs("option", { value: client.id, children: [client.clientNumber, " - ", client.name] }, client.id)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Equipo responsable" }), _jsxs("select", { value: quoteForm.responsibleTeam, onChange: (event) => updateQuoteForm((current) => ({ ...current, responsibleTeam: event.target.value })), children: [_jsx("option", { value: "", children: "Sin equipo" }), QUOTE_TEAM_OPTIONS.map((team) => (_jsx("option", { value: team.key, children: team.label }, team.key)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Tipo de cotizacion" }), _jsxs("select", { value: quoteForm.quoteType, onChange: (event) => updateQuoteForm((current) => ({ ...current, quoteType: event.target.value })), children: [_jsx("option", { value: "ONE_TIME", children: "Asunto unico" }), _jsx("option", { value: "RETAINER", children: "Iguala" })] })] }), sourceMode === "generic" ? (_jsxs("div", { className: "form-field quote-language-field", children: [_jsx("span", { children: "Idioma de la cotizaci\u00F3n" }), _jsxs("label", { className: "quote-language-checkbox", children: [_jsx("input", { type: "checkbox", checked: quoteForm.language === "en", onChange: (event) => handleGenericQuoteLanguageChange(event.target.checked ? "en" : "es") }), _jsx("span", { children: quoteForm.language === "en" ? "Inglés" : "Español" })] }), _jsx("small", { children: "Desmarcado: espa\u00F1ol. Marcado: ingl\u00E9s." })] })) : null, _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Numero de cotizacion" }), _jsx("input", { type: "text", value: suggestedQuoteNumber, readOnly: true })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha" }), _jsx("input", { type: "date", value: quoteForm.quoteDate, onChange: (event) => updateQuoteForm((current) => ({ ...current, quoteDate: event.target.value })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Asunto" }), _jsx("input", { type: "text", value: quoteForm.subject, onChange: (event) => updateQuoteForm((current) => ({ ...current, subject: event.target.value })), placeholder: "Describe el alcance de la propuesta" })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Hito de conclusion" }), _jsx("input", { type: "text", value: quoteForm.milestone, onChange: (event) => updateQuoteForm((current) => ({ ...current, milestone: event.target.value })), placeholder: "Ej. Firma, entrega, cierre, aprobacion" })] })] }), sourceMode === "template" && !selectedTemplate ? (_jsx("section", { className: "quote-template-editor-shell", children: _jsx("div", { className: "panel-header quotes-line-editor-header", children: _jsxs("div", { children: [_jsx("h3", { children: "Tabla de cotizacion tipo" }), _jsx("p", { className: "muted", children: "Selecciona una cotizacion tipo base para cargar aqui su tabla editable." })] }) }) })) : null, quoteTemplateDraft ? (_jsxs("section", { className: "quote-template-editor-shell", children: [_jsx("div", { className: "panel-header quotes-line-editor-header", children: _jsxs("div", { children: [_jsx("h3", { children: sourceMode === "template" ? "Tabla de cotizacion tipo" : "Tabla de cotizacion" }), _jsx("p", { className: "muted", children: sourceMode === "template"
                                                        ? "Puedes editar la misma tabla de la plantilla antes de guardar la cotizacion."
                                                        : "Configura desde cero la cotizacion del cliente usando la misma tabla avanzada de las cotizaciones tipo." })] }) }), _jsxs("div", { className: "quote-template-amount-config-grid", children: [_jsx(TemplateAmountColumnConfig, { column: quoteTemplateDraft.amountColumns[0], onModeChange: (mode) => updateQuoteTemplateDraft((current) => ({
                                                    ...current,
                                                    amountColumns: [{ ...current.amountColumns[0], mode }, current.amountColumns[1]]
                                                })) }), _jsx(TemplateAmountColumnConfig, { column: quoteTemplateDraft.amountColumns[1], secondary: true, onToggleSecondary: (enabled) => updateQuoteTemplateDraft((current) => ({
                                                    ...current,
                                                    amountColumns: [
                                                        current.amountColumns[0],
                                                        { ...current.amountColumns[1], enabled }
                                                    ],
                                                    tableRows: enabled ? current.tableRows : resetSecondaryAmountColumn(current.tableRows)
                                                })), onModeChange: (mode) => updateQuoteTemplateDraft((current) => ({
                                                    ...current,
                                                    amountColumns: [current.amountColumns[0], { ...current.amountColumns[1], mode }]
                                                })) })] }), _jsx("div", { className: "quote-template-rows", children: quoteTemplateDraft.tableRows.map((row, rowIndex) => (_jsx(TemplateConceptCard, { row: row, rowIndex: rowIndex, rows: quoteTemplateDraft.tableRows, amountColumns: quoteTemplateDraft.amountColumns, onRowChange: updateQuoteTemplateRow, onInsertAfter: (index) => updateQuoteTemplateDraft((current) => ({
                                                ...current,
                                                tableRows: insertTemplateRowAfter(current.tableRows, index)
                                            })), onRemove: (index) => updateQuoteTemplateDraft((current) => ({
                                                ...current,
                                                tableRows: removeTemplateRow(current.tableRows, index)
                                            })), onMerge: handleQuoteTemplateMerge, onUnmerge: handleQuoteTemplateUnmerge }, row.id))) }), _jsx(TemplateSummaryGrid, { amountColumns: quoteTemplateDraft.amountColumns, tableRows: quoteTemplateDraft.tableRows })] })) : null, _jsxs("div", { className: "form-actions", children: [_jsx("button", { type: "submit", className: "primary-button", disabled: savingQuote || Boolean(exportingFormat), children: savingQuote ? "Guardando..." : editingQuote ? "Guardar cambios" : "Guardar cotizacion" }), _jsx("button", { type: "button", className: "secondary-button", disabled: savingQuote || Boolean(exportingFormat), onClick: () => void handleQuoteDownload("pdf"), children: exportingFormat === "pdf" ? "Generando PDF..." : "Descargar en PDF" }), _jsx("button", { type: "button", className: "secondary-button", disabled: savingQuote || Boolean(exportingFormat), onClick: () => void handleQuoteDownload("word"), children: exportingFormat === "word" ? "Generando Word..." : "Descargar en Word" })] })] })] })) : null, viewingQuote ? (_jsx("div", { className: "finance-modal-backdrop", role: "presentation", onClick: () => setViewingQuote(null), children: _jsxs("div", { className: "finance-modal finance-modal-wide quotes-detail-modal", role: "dialog", "aria-modal": "true", "aria-label": "Detalle de cotizacion guardada", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Cotizacion guardada" }), _jsx("h3", { children: viewingQuote.quoteNumber })] }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => setViewingQuote(null), children: "Cerrar" })] }), _jsxs("div", { className: "quotes-detail-grid", children: [_jsxs("div", { className: "quotes-detail-block", children: [_jsx("strong", { children: "Cliente" }), _jsx("p", { children: viewingQuote.clientName })] }), _jsxs("div", { className: "quotes-detail-block", children: [_jsx("strong", { children: "Fecha" }), _jsx("p", { children: formatDate(getQuoteDisplayDate(viewingQuote)) })] }), _jsxs("div", { className: "quotes-detail-block", children: [_jsx("strong", { children: "Tipo" }), _jsx("p", { children: getQuoteTypeLabel(viewingQuote.quoteType) })] }), _jsxs("div", { className: "quotes-detail-block", children: [_jsx("strong", { children: "Equipo" }), _jsx("p", { children: getTeamLabel(viewingQuote.responsibleTeam) })] }), _jsxs("div", { className: "quotes-detail-block", children: [_jsx("strong", { children: "Hito" }), _jsx("p", { children: normalizeText(viewingQuote.milestone) || "-" })] })] }), viewingQuoteDraft ? (_jsx(TemplateVisualPreview, { heading: "Preview visual", templateNumber: viewingQuote.quoteNumber, team: viewingQuote.responsibleTeam, quoteType: viewingQuote.quoteType, milestone: viewingQuote.milestone, services: viewingQuote.subject, servicesLabel: "Asunto", emptyServicesText: "Sin asunto capturado.", amountColumns: viewingQuoteDraft.amountColumns, tableRows: viewingQuoteDraft.tableRows })) : null] }) })) : null, quotePendingDelete ? (_jsx("div", { className: "finance-modal-backdrop", role: "presentation", onClick: () => (deletingQuoteId ? undefined : setQuotePendingDelete(null)), children: _jsxs("div", { className: "finance-modal", role: "dialog", "aria-modal": "true", "aria-label": "Confirmar borrado de cotizacion guardada", onClick: (event) => event.stopPropagation(), children: [_jsx("h3", { children: "Borrar cotizacion guardada" }), _jsxs("p", { children: ["Vas a borrar ", _jsx("strong", { children: quotePendingDelete.quoteNumber }), ". Esta cotizacion dejara de aparecer en el historial del cliente."] }), _jsx("p", { className: "muted", children: normalizeText(quotePendingDelete.subject) || "Sin asunto capturado." }), _jsxs("div", { className: "finance-modal-actions", children: [_jsx("button", { className: "secondary-button", type: "button", disabled: Boolean(deletingQuoteId), onClick: () => setQuotePendingDelete(null), children: "Cancelar" }), _jsx("button", { className: "danger-button", type: "button", disabled: Boolean(deletingQuoteId), onClick: () => void handleQuoteDeleteConfirm(), children: deletingQuoteId ? "Borrando..." : "Confirmar borrado" })] })] }) })) : null, templatePendingDelete ? (_jsx("div", { className: "finance-modal-backdrop", role: "presentation", onClick: () => (deletingTemplateId ? undefined : setTemplatePendingDelete(null)), children: _jsxs("div", { className: "finance-modal", role: "dialog", "aria-modal": "true", "aria-label": "Confirmar borrado de cotizacion tipo", onClick: (event) => event.stopPropagation(), children: [_jsx("h3", { children: "Borrar cotizacion tipo" }), _jsxs("p", { children: ["Vas a borrar ", _jsx("strong", { children: templatePendingDelete.templateNumber }), ". Esta plantilla dejara de estar disponible para reutilizarse."] }), _jsx("p", { className: "muted", children: summarizeTemplateServices(templatePendingDelete.services, 120) }), _jsxs("div", { className: "finance-modal-actions", children: [_jsx("button", { className: "secondary-button", type: "button", disabled: Boolean(deletingTemplateId), onClick: () => setTemplatePendingDelete(null), children: "Cancelar" }), _jsx("button", { className: "danger-button", type: "button", disabled: Boolean(deletingTemplateId), onClick: () => void handleTemplateDeleteConfirm(), children: deletingTemplateId ? "Borrando..." : "Confirmar borrado" })] })] }) })) : null] }));
}
