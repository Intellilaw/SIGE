import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canReadModule, canWriteModule } from "../auth/permissions";
const MODULE_TITLE = "Minka";
const CONTRACT_SECTION_LABEL = "Contratos de arrendamiento";
const INPC_SECTION_LABEL = "INPC";
const FORMAT_SCOPE_ORIGINAL = "original";
const DEFAULT_RENEWAL_DOCUMENT_KIND = "NEW_CONTRACT_OR_AGREEMENT";
const initialFormState = {
    title: "",
    clientId: "",
    propertyAddress: "",
    landlordName: "",
    tenantName: "",
    leaseStartDate: "",
    leaseEndDate: "",
    monthlyRentMxn: "",
    status: "ACTIVE",
    notes: "",
    renewals: [],
    milestones: []
};
const initialManualAlertFormState = {
    title: "",
    dueDate: "",
    description: ""
};
const initialRentUpdateFormatFormState = {
    effectiveDate: "",
    previousRentMxn: "",
    basePeriod: "",
    targetPeriod: "",
    useRoundedRent: false,
    roundedRentMxn: ""
};
const formatTemplateLabels = {
    "rent-increase": "Formato de aumento de renta",
    "property-delivery": "Carta de entrega recepcion de inmueble",
    "termination-agreement": "Convenio de rescision"
};
const renewalDocumentKindLabels = {
    NEW_CONTRACT_OR_AGREEMENT: "Nuevo contrato o convenio",
    RENT_UPDATE_FORMAT: "Formato de actualizaci\u00f3n de renta"
};
const renewalDocumentKindOptions = [
    { value: "NEW_CONTRACT_OR_AGREEMENT", label: renewalDocumentKindLabels.NEW_CONTRACT_OR_AGREEMENT },
    { value: "RENT_UPDATE_FORMAT", label: renewalDocumentKindLabels.RENT_UPDATE_FORMAT }
];
const initialRentCalculatorState = {
    rentMxn: "",
    basePeriod: "",
    targetPeriod: ""
};
const renewalOrdinalLabels = [
    "Primera renovación",
    "Segunda renovación",
    "Tercera renovación",
    "Cuarta renovación",
    "Quinta renovación",
    "Sexta renovación",
    "Séptima renovación",
    "Octava renovación",
    "Novena renovación",
    "Décima renovación"
];
function createEmptyRenewal() {
    return {
        documentKind: DEFAULT_RENEWAL_DOCUMENT_KIND,
        renewalDate: "",
        leaseStartDate: "",
        leaseEndDate: "",
        monthlyRentMxn: "",
        rentIncreasePct: "",
        inpcBasePeriod: "",
        inpcTargetPeriod: "",
        notes: ""
    };
}
function renewalLabel(index) {
    return renewalOrdinalLabels[index] ?? `Renovacion ${index + 1}`;
}
function dateInputValue(date) {
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}
function toErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "Ocurrio un error inesperado.";
}
function normalizeSearchValue(value) {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}
function formatDate(value) {
    if (!value) {
        return "-";
    }
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleDateString("es-MX");
}
function formatLongDate(value) {
    if (!value) {
        return "fecha pendiente";
    }
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleDateString("es-MX", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}
function formatCurrency(value) {
    if (!value) {
        return "-";
    }
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2
    }).format(value);
}
function formatPercent(value) {
    if (!value) {
        return "-";
    }
    return `${value.toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`;
}
function formatSignedPercent(value) {
    if (value === undefined || !Number.isFinite(value)) {
        return "-";
    }
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toLocaleString("es-MX", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}%`;
}
function formatInpcValue(value) {
    if (value === undefined || !Number.isFinite(value)) {
        return "-";
    }
    return value.toLocaleString("es-MX", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 6
    });
}
function formatInpcPeriod(record) {
    if (!record) {
        return "-";
    }
    const date = new Date(`${record.periodDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
        return `${record.periodMonth}/${record.periodYear}`;
    }
    return date.toLocaleDateString("es-MX", {
        month: "long",
        year: "numeric"
    });
}
function inpcPeriodKey(record) {
    return `${record.periodYear}-${String(record.periodMonth).padStart(2, "0")}`;
}
function sortInpcAsc(items) {
    return [...items].sort((left, right) => left.periodDate.localeCompare(right.periodDate));
}
function sortInpcDesc(items) {
    return [...items].sort((left, right) => right.periodDate.localeCompare(left.periodDate));
}
function getDefaultInpcTargetPeriod(items) {
    return sortInpcDesc(items)[0] ? inpcPeriodKey(sortInpcDesc(items)[0]) : "";
}
function getDefaultInpcBasePeriod(items) {
    const sortedDesc = sortInpcDesc(items);
    const latest = sortedDesc[0];
    if (!latest) {
        return "";
    }
    const annualBase = items.find((record) => record.periodYear === latest.periodYear - 1 && record.periodMonth === latest.periodMonth);
    return annualBase ? inpcPeriodKey(annualBase) : inpcPeriodKey(sortInpcAsc(items)[0]);
}
function calculateRentIncreaseFromInpc(items, state) {
    const rent = Number(state.rentMxn);
    if (!Number.isFinite(rent) || rent <= 0) {
        return null;
    }
    const base = items.find((record) => inpcPeriodKey(record) === state.basePeriod);
    const target = items.find((record) => inpcPeriodKey(record) === state.targetPeriod);
    if (!base || !target || base.value <= 0) {
        return null;
    }
    const factor = target.value / base.value;
    const updatedRentMxn = Math.round(rent * factor * 100) / 100;
    return {
        basePeriod: state.basePeriod,
        targetPeriod: state.targetPeriod,
        originalRentMxn: rent,
        updatedRentMxn,
        increaseMxn: Math.round((updatedRentMxn - rent) * 100) / 100,
        increasePct: (factor - 1) * 100,
        factor
    };
}
function roundMoney(value) {
    return Math.round(value * 100) / 100;
}
function numberToInputValue(value) {
    if (value === undefined || value === null || !Number.isFinite(value)) {
        return "";
    }
    return String(value);
}
function parseEditableNumber(value) {
    const normalized = value.trim();
    if (!normalized) {
        return undefined;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
function getBaseRentForRenewal(contract, renewal) {
    const previousRenewal = contract.renewals.find((entry) => entry.sequence === renewal.sequence - 1);
    return renewal.monthlyRentMxn ?? previousRenewal?.monthlyRentMxn ?? contract.monthlyRentMxn;
}
function dateToInpcPeriodKey(value) {
    if (!isValidDateKey(value)) {
        return "";
    }
    return value.slice(0, 7);
}
function resolveInpcRecord(inpcRecords, periodKey, fallbackToLatest = false) {
    const exact = inpcRecords.find((record) => inpcPeriodKey(record) === periodKey);
    if (exact || !fallbackToLatest) {
        return exact;
    }
    return sortInpcDesc(inpcRecords)[0];
}
function resolveInpcRecordOnOrBefore(inpcRecords, periodKey) {
    const sorted = sortInpcAsc(inpcRecords);
    const previous = sorted.filter((record) => inpcPeriodKey(record) <= periodKey).at(-1);
    return previous ?? sorted[0];
}
function resolveRentUpdateBaseInpc(inpcRecords, renewal, desiredBasePeriod, selectedBasePeriod) {
    if (selectedBasePeriod) {
        return resolveInpcRecord(inpcRecords, selectedBasePeriod);
    }
    const renewalTargetInpc = renewal.inpcTargetPeriod
        ? resolveInpcRecord(inpcRecords, renewal.inpcTargetPeriod)
        : undefined;
    if (renewalTargetInpc) {
        return renewalTargetInpc;
    }
    const desiredBaseInpc = resolveInpcRecord(inpcRecords, desiredBasePeriod);
    return desiredBaseInpc ?? resolveInpcRecordOnOrBefore(inpcRecords, desiredBasePeriod);
}
function buildRentUpdateFormatPreview(contract, renewal, documentDate, inpcRecords, overrides = {}) {
    const baseEffectiveDate = renewal.leaseStartDate || renewal.renewalDate || documentDate;
    const effectiveDate = isValidDateKey(overrides.effectiveDate) ? overrides.effectiveDate : addYearsDateKey(baseEffectiveDate, 1);
    const desiredBasePeriod = dateToInpcPeriodKey(baseEffectiveDate);
    const desiredTargetPeriod = dateToInpcPeriodKey(effectiveDate);
    const selectedTargetPeriod = overrides.targetPeriod || desiredTargetPeriod;
    const baseInpc = resolveRentUpdateBaseInpc(inpcRecords, renewal, desiredBasePeriod, overrides.basePeriod);
    const targetInpc = resolveInpcRecord(inpcRecords, selectedTargetPeriod, !overrides.targetPeriod);
    const previousRentMxn = parseEditableNumber(overrides.previousRentMxn ?? "") ?? getBaseRentForRenewal(contract, renewal);
    const factor = baseInpc && targetInpc && baseInpc.value > 0 ? targetInpc.value / baseInpc.value : undefined;
    const updatedRentMxn = previousRentMxn && factor ? roundMoney(previousRentMxn * factor) : undefined;
    const increaseMxn = previousRentMxn && updatedRentMxn ? roundMoney(updatedRentMxn - previousRentMxn) : undefined;
    const increasePct = factor
        ? (factor - 1) * 100
        : previousRentMxn && increaseMxn ? (increaseMxn / previousRentMxn) * 100 : undefined;
    const roundedRentMxn = overrides.useRoundedRent ? parseEditableNumber(overrides.roundedRentMxn ?? "") : undefined;
    const presentedRentMxn = roundedRentMxn ?? updatedRentMxn;
    const presentedIncreaseMxn = previousRentMxn && presentedRentMxn ? roundMoney(presentedRentMxn - previousRentMxn) : undefined;
    const presentedIncreasePct = previousRentMxn && presentedIncreaseMxn ? (presentedIncreaseMxn / previousRentMxn) * 100 : increasePct;
    return {
        baseLabel: `${renewalLabel(renewal.sequence - 1)} - ${formatDate(getRenewalDisplayDate(renewal))}`,
        documentDate,
        effectiveDate,
        previousRentMxn,
        updatedRentMxn,
        increaseMxn,
        increasePct,
        factor,
        useRoundedRent: overrides.useRoundedRent,
        roundedRentMxn,
        presentedRentMxn,
        presentedIncreaseMxn,
        presentedIncreasePct,
        baseInpc,
        targetInpc,
        basePeriod: baseInpc ? inpcPeriodKey(baseInpc) : "",
        targetPeriod: targetInpc ? inpcPeriodKey(targetInpc) : selectedTargetPeriod
    };
}
function formatFileSize(value) {
    if (!value) {
        return "Sin archivo";
    }
    if (value < 1024 * 1024) {
        return `${Math.max(1, Math.round(value / 1024))} KB`;
    }
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
function inferGeneratedDocumentFormat(document) {
    const mimeType = (document.fileMimeType ?? "").toLowerCase();
    const fileName = document.originalFileName.toLowerCase();
    if (mimeType.includes("pdf") || fileName.endsWith(".pdf")) {
        return "pdf";
    }
    if (mimeType.includes("word") || fileName.endsWith(".doc") || fileName.endsWith(".docx")) {
        return "word";
    }
    return "other";
}
function generatedDocumentStem(document) {
    return document.originalFileName
        .trim()
        .replace(/\.[a-z0-9]+$/i, "")
        .toLowerCase();
}
function groupGeneratedDocuments(documents) {
    const groups = new Map();
    documents.forEach((document) => {
        const key = `${document.templateId}:${document.renewalId ?? "original"}:${generatedDocumentStem(document) || document.id}`;
        const group = groups.get(key) ?? {
            key,
            templateTitle: document.templateTitle,
            renewalId: document.renewalId,
            createdAt: document.createdAt
        };
        const format = inferGeneratedDocumentFormat(document);
        if (format === "pdf") {
            group.pdf = document;
        }
        else if (format === "word") {
            group.word = document;
        }
        else {
            group.other = document;
        }
        if (document.createdAt > group.createdAt) {
            group.createdAt = document.createdAt;
        }
        groups.set(key, group);
    });
    return [...groups.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
function getGeneratedDocumentGroupDocuments(group) {
    return [group.word, group.pdf, group.other].filter((document) => Boolean(document));
}
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
        reader.readAsDataURL(file);
    });
}
function downloadBlobFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}
function sortClients(items) {
    return [...items].sort((left, right) => left.name.localeCompare(right.name, "es-MX", { numeric: true, sensitivity: "base" }));
}
function sortContracts(items) {
    return [...items].sort((left, right) => left.contractNumber.localeCompare(right.contractNumber, "es-MX", { numeric: true, sensitivity: "base" }));
}
function groupContractsByClient(items) {
    const groups = new Map();
    sortContracts(items).forEach((contract) => {
        const key = contract.clientId;
        const label = [contract.clientNumber, contract.clientName].filter(Boolean).join(" - ") || "Cliente sin nombre";
        const existing = groups.get(key);
        if (existing) {
            existing.contracts.push(contract);
            return;
        }
        groups.set(key, { key, label, contracts: [contract] });
    });
    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label, "es-MX", { numeric: true, sensitivity: "base" }));
}
function parseOptionalNumber(value, label) {
    const normalized = value.trim();
    if (!normalized) {
        return null;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`${label} debe ser un numero positivo.`);
    }
    return parsed;
}
function isSupportedContractFile(file) {
    const name = file.name.toLowerCase();
    return (file.type === "application/pdf"
        || file.type === "application/msword"
        || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        || name.endsWith(".pdf")
        || name.endsWith(".doc")
        || name.endsWith(".docx"));
}
function isSupportedContractPrefillFile(file) {
    const name = file.name.toLowerCase();
    const mimeType = file.type.toLowerCase();
    return (mimeType === "application/pdf"
        || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        || name.endsWith(".pdf")
        || name.endsWith(".docx"));
}
function toRenewalDocumentKind(value) {
    return value === "RENT_UPDATE_FORMAT" ? "RENT_UPDATE_FORMAT" : DEFAULT_RENEWAL_DOCUMENT_KIND;
}
function hasRenewalFormContent(renewal) {
    return Boolean(renewal.documentKind
        || renewal.renewalDate.trim()
        || renewal.leaseStartDate.trim()
        || renewal.leaseEndDate.trim()
        || renewal.monthlyRentMxn.trim()
        || renewal.rentIncreasePct.trim()
        || renewal.inpcBasePeriod.trim()
        || renewal.inpcTargetPeriod.trim()
        || renewal.notes.trim());
}
function toRenewalFormState(renewal) {
    return {
        id: renewal.id,
        sequence: renewal.sequence,
        documentKind: toRenewalDocumentKind(renewal.documentKind),
        renewalDate: renewal.renewalDate ?? "",
        leaseStartDate: renewal.leaseStartDate ?? "",
        leaseEndDate: renewal.leaseEndDate ?? "",
        monthlyRentMxn: renewal.monthlyRentMxn ? String(renewal.monthlyRentMxn) : "",
        rentIncreasePct: renewal.rentIncreasePct ? String(renewal.rentIncreasePct) : "",
        inpcBasePeriod: renewal.inpcBasePeriod ?? "",
        inpcTargetPeriod: renewal.inpcTargetPeriod ?? "",
        documents: renewal.documents ?? [],
        notes: renewal.notes ?? ""
    };
}
function toMilestoneFormState(milestone) {
    return {
        id: milestone.id,
        source: milestone.source,
        title: milestone.title,
        dueDate: milestone.dueDate,
        description: milestone.description ?? ""
    };
}
function createExtractedMilestone(date) {
    return {
        source: "EXTRACTED",
        title: date.title,
        dueDate: date.dueDate,
        description: date.description
    };
}
function mergeMilestoneForms(current, incoming) {
    const seen = new Set();
    return [...current, ...incoming].filter((milestone) => {
        const key = `${normalizeSearchValue(milestone.source)}|${normalizeSearchValue(milestone.title)}|${milestone.dueDate}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return Boolean(milestone.title.trim() && milestone.dueDate.trim());
    });
}
function mergePrefillFields(current, fields) {
    return {
        ...current,
        title: fields.title || current.title,
        propertyAddress: fields.propertyAddress || current.propertyAddress,
        landlordName: fields.landlordName || current.landlordName,
        tenantName: fields.tenantName || current.tenantName,
        leaseStartDate: fields.leaseStartDate || current.leaseStartDate,
        leaseEndDate: fields.leaseEndDate || current.leaseEndDate,
        monthlyRentMxn: fields.monthlyRentMxn || current.monthlyRentMxn
    };
}
function mergeRenewalPrefillFields(current, fields) {
    const extractedNotes = fields.notes.trim();
    const leaseEndDate = current.documentKind === "RENT_UPDATE_FORMAT" ? "" : fields.leaseEndDate || current.leaseEndDate;
    return {
        ...current,
        renewalDate: fields.renewalDate || current.renewalDate,
        leaseStartDate: fields.leaseStartDate || current.leaseStartDate,
        leaseEndDate,
        monthlyRentMxn: fields.monthlyRentMxn || current.monthlyRentMxn,
        rentIncreasePct: fields.rentIncreasePct || current.rentIncreasePct,
        notes: extractedNotes ? [current.notes, extractedNotes].filter(Boolean).join("\n") : current.notes
    };
}
function isRentUpdateRenewal(renewal) {
    return renewal.documentKind === "RENT_UPDATE_FORMAT";
}
function getRenewalDateLabel(renewal) {
    return isRentUpdateRenewal(renewal) ? "Fecha de formato" : "Fecha de renovación";
}
function getRenewalStartDateLabel(renewal) {
    return isRentUpdateRenewal(renewal) ? "Inicio de aplicación de nueva renta" : "Inicio de vigencia";
}
function deadlineStatus(value) {
    if (!value) {
        return "none";
    }
    const today = new Date(`${dateInputValue(new Date())}T12:00:00`);
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
        return "overdue";
    }
    if (diffDays <= 30) {
        return "soon";
    }
    return "ok";
}
function valueOrFallback(value, fallback) {
    return value?.trim() || fallback;
}
function getRenewalDisplayDate(renewal) {
    return renewal?.renewalDate || renewal?.leaseStartDate || renewal?.leaseEndDate;
}
function getNextRenewal(contract) {
    const today = dateInputValue(new Date());
    const datedRenewals = contract.renewals
        .map((renewal) => ({ renewal, date: getRenewalDisplayDate(renewal) }))
        .filter((entry) => Boolean(entry.date))
        .sort((left, right) => left.date.localeCompare(right.date));
    return datedRenewals.find((entry) => entry.date >= today)?.renewal ?? datedRenewals.at(-1)?.renewal;
}
function getLatestRenewal(contract) {
    return [...contract.renewals].sort((left, right) => right.sequence - left.sequence)[0];
}
function isValidDateKey(value) {
    return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
function isFutureOrToday(value) {
    return Boolean(isValidDateKey(value) && value >= dateInputValue(new Date()));
}
function addYearsDateKey(value, years) {
    const source = new Date(`${value}T12:00:00`);
    if (Number.isNaN(source.getTime())) {
        return "";
    }
    const next = new Date(source);
    next.setFullYear(source.getFullYear() + years);
    return dateInputValue(next);
}
function nextAnnualDateFrom(value) {
    if (!isValidDateKey(value)) {
        return "";
    }
    let next = value.slice(0, 10);
    const today = dateInputValue(new Date());
    while (next < today) {
        next = addYearsDateKey(next, 1);
    }
    return next;
}
function getLatestRenewalBasisDate(contract) {
    const datedRenewals = contract.renewals
        .map((renewal) => getRenewalDisplayDate(renewal) || renewal.leaseStartDate)
        .filter((value) => isValidDateKey(value))
        .sort((left, right) => right.localeCompare(left));
    return datedRenewals[0] ?? contract.leaseStartDate;
}
function getNextRentIncreaseDate(contract) {
    if (isValidDateKey(contract.rentIncreaseDate)) {
        return nextAnnualDateFrom(contract.rentIncreaseDate);
    }
    const basisDate = getLatestRenewalBasisDate(contract);
    if (!isValidDateKey(basisDate)) {
        return "";
    }
    return nextAnnualDateFrom(addYearsDateKey(basisDate, 1));
}
function baseContractMilestone(contract, dueDate, title, kind, description) {
    return {
        id: `${contract.id}-${kind}-${dueDate}-${normalizeSearchValue(title)}`,
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        contractTitle: contract.title,
        clientName: contract.clientName,
        propertyAddress: contract.propertyAddress ?? "",
        dueDate,
        title,
        description,
        kind,
        source: "AUTOMATIC"
    };
}
function getContractMilestones(contract) {
    const milestones = [];
    if (isFutureOrToday(contract.renewalDate)) {
        milestones.push(baseContractMilestone(contract, contract.renewalDate, "Renovación del contrato", "renewal"));
    }
    contract.renewals.forEach((renewal) => {
        const renewalDate = getRenewalDisplayDate(renewal);
        if (isFutureOrToday(renewalDate)) {
            milestones.push(baseContractMilestone(contract, renewalDate, `${renewalLabel(renewal.sequence - 1)}`, "renewal"));
        }
        if (isFutureOrToday(renewal.leaseEndDate)) {
            milestones.push(baseContractMilestone(contract, renewal.leaseEndDate, `Fin de vigencia - ${renewalLabel(renewal.sequence - 1)}`, "lease-end"));
        }
    });
    if (isFutureOrToday(contract.leaseEndDate)) {
        milestones.push(baseContractMilestone(contract, contract.leaseEndDate, "Fin de vigencia del contrato", "lease-end"));
    }
    const rentIncreaseDate = getNextRentIncreaseDate(contract);
    if (isFutureOrToday(rentIncreaseDate)) {
        milestones.push(baseContractMilestone(contract, rentIncreaseDate, "Próximo aumento de renta", "rent-increase"));
    }
    (contract.milestones ?? []).forEach((milestone) => {
        if (!isFutureOrToday(milestone.dueDate)) {
            return;
        }
        milestones.push({
            id: milestone.id,
            contractId: contract.id,
            contractNumber: contract.contractNumber,
            contractTitle: contract.title,
            clientName: contract.clientName,
            propertyAddress: contract.propertyAddress ?? "",
            dueDate: milestone.dueDate,
            title: milestone.title,
            description: milestone.description,
            kind: milestone.source === "EXTRACTED" ? "extracted" : "manual",
            source: milestone.source
        });
    });
    return mergeContractMilestones(milestones);
}
function mergeContractMilestones(milestones) {
    const grouped = new Map();
    milestones
        .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.title.localeCompare(right.title, "es-MX"))
        .forEach((milestone) => {
        const key = `${milestone.contractId}|${milestone.dueDate}`;
        const existing = grouped.get(key);
        if (!existing) {
            grouped.set(key, milestone);
            return;
        }
        const titleParts = new Set([...existing.title.split(" / "), milestone.title]);
        const descriptions = [existing.description, milestone.description].filter(Boolean);
        grouped.set(key, {
            ...existing,
            id: `${existing.id}-${milestone.id}`,
            title: [...titleParts].join(" / "),
            description: descriptions.length > 0 ? descriptions.join(" ") : undefined,
            kind: existing.kind
        });
    });
    return [...grouped.values()].sort((left, right) => left.dueDate.localeCompare(right.dueDate));
}
function milestoneKindLabel(kind) {
    const labels = {
        renewal: "Renovación",
        "lease-end": "Fin de vigencia",
        "rent-increase": "Aumento de renta",
        manual: "Alerta manual",
        extracted: "Fecha extraída"
    };
    return labels[kind];
}
function buildGeneratedFormat(contract, templateId, documentDate) {
    const todayLabel = formatLongDate(documentDate);
    const property = valueOrFallback(contract.propertyAddress, "el inmueble materia del contrato");
    const landlord = valueOrFallback(contract.landlordName, "el arrendador");
    const tenant = valueOrFallback(contract.tenantName, "el arrendatario");
    const renewal = getLatestRenewal(contract);
    const rent = formatCurrency(renewal?.monthlyRentMxn ?? contract.monthlyRentMxn);
    const increase = formatPercent(renewal?.rentIncreasePct);
    const renewalDate = formatLongDate(getRenewalDisplayDate(renewal));
    if (templateId === "property-delivery") {
        return {
            title: "CARTA DE ENTREGA RECEPCION DE INMUEBLE",
            subtitle: todayLabel,
            paragraphs: [
                `Por medio de la presente, ${tenant} entrega a ${landlord} la posesion material de ${property}, relacionado con el contrato ${contract.contractNumber}.`,
                "Las partes hacen constar que la entrega se realiza con la documentacion, llaves, accesos y condiciones materiales que se describan en los anexos o inventario correspondiente.",
                "La recepcion no implica renuncia a derechos, pagos pendientes, reparaciones, servicios o responsabilidades que deban liquidarse conforme al contrato y la legislacion aplicable."
            ],
            signatures: [tenant, landlord]
        };
    }
    if (templateId === "termination-agreement") {
        return {
            title: "CONVENIO DE RESCISION DE CONTRATO DE ARRENDAMIENTO",
            subtitle: todayLabel,
            paragraphs: [
                `${landlord} y ${tenant} convienen rescindir de comun acuerdo el contrato ${contract.contractNumber}, relativo a ${property}.`,
                `Las partes reconocen como referencia de vigencia contractual el periodo del ${formatLongDate(contract.leaseStartDate)} al ${formatLongDate(contract.leaseEndDate)}.`,
                "Cualquier saldo, deposito, reparacion, servicio, penalidad o entrega documental pendiente debera documentarse en el anexo de cierre que firmen las partes."
            ],
            signatures: [landlord, tenant]
        };
    }
    return {
        title: "FORMATO DE AUMENTO DE RENTA",
        subtitle: todayLabel,
        paragraphs: [
            `Por medio de la presente se informa a ${tenant} que la renta correspondiente a ${property} sera actualizada conforme al contrato ${contract.contractNumber}.`,
            `La renta mensual vigente registrada es ${rent}. El porcentaje de aumento registrado es ${increase}, aplicable a partir del ${renewalDate}.`,
            `La próxima fecha de renovación registrada es ${renewalDate}. Las partes podrán formalizar la actualización mediante addendum, aviso o convenio complementario.`
        ],
        signatures: [landlord, tenant]
    };
}
function formatFilename(value) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "formato";
}
function downloadWordFormat(format, filename) {
    const paragraphs = format.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
    const signatures = format.signatures
        .map((signature) => `<div class="signature"><span></span><strong>${signature}</strong></div>`)
        .join("");
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #111827; line-height: 1.55; margin: 72px; }
    h1 { font-size: 20px; text-align: center; margin-bottom: 18px; }
    .subtitle { text-align: right; margin-bottom: 36px; }
    p { text-align: justify; margin: 0 0 18px; }
    .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 36px; margin-top: 72px; }
    .signature { text-align: center; }
    .signature span { display: block; border-top: 1px solid #111827; margin-bottom: 8px; }
  </style>
</head>
<body>
  <h1>${format.title}</h1>
  <div class="subtitle">${format.subtitle}</div>
  ${paragraphs}
  <div class="signatures">${signatures}</div>
</body>
</html>`;
    downloadBlobFile(new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" }), `${filename}.doc`);
}
async function downloadPdfFormat(format, filename) {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ format: "letter", unit: "pt" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 72;
    const contentWidth = pageWidth - margin * 2;
    let y = 76;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text(format.title, pageWidth / 2, y, { align: "center" });
    y += 34;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text(format.subtitle, pageWidth - margin, y, { align: "right" });
    y += 34;
    format.paragraphs.forEach((paragraph) => {
        const lines = pdf.splitTextToSize(paragraph, contentWidth);
        if (y + lines.length * 16 > pageHeight - margin) {
            pdf.addPage();
            y = margin;
        }
        pdf.text(lines, margin, y, { align: "justify", maxWidth: contentWidth });
        y += lines.length * 16 + 14;
    });
    y = Math.max(y + 34, pageHeight - 150);
    const signatureWidth = (contentWidth - 36) / 2;
    format.signatures.slice(0, 2).forEach((signature, index) => {
        const x = margin + index * (signatureWidth + 36);
        pdf.line(x, y, x + signatureWidth, y);
        pdf.text(signature, x + signatureWidth / 2, y + 18, { align: "center", maxWidth: signatureWidth });
    });
    pdf.save(`${filename}.pdf`);
}
export function ExternalContractsPage() {
    const { user } = useAuth();
    const canRead = canReadModule(user, "external-contracts");
    const canWrite = canWriteModule(user, "external-contracts");
    const [activeSection, setActiveSection] = useState("contracts");
    const [contracts, setContracts] = useState([]);
    const [inpcRecords, setInpcRecords] = useState([]);
    const [clients, setClients] = useState([]);
    const [form, setForm] = useState(initialFormState);
    const [rentCalculator, setRentCalculator] = useState(initialRentCalculatorState);
    const [activeRenewalIndex, setActiveRenewalIndex] = useState(0);
    const [selectedFile, setSelectedFile] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [clientSearch, setClientSearch] = useState("");
    const [query, setQuery] = useState("");
    const [contractClientFilterId, setContractClientFilterId] = useState("");
    const [contractStatusView, setContractStatusView] = useState("active");
    const [selectedContractId, setSelectedContractId] = useState("");
    const [managedRenewals, setManagedRenewals] = useState([]);
    const [manualAlertForm, setManualAlertForm] = useState(initialManualAlertFormState);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingRenewals, setSavingRenewals] = useState(false);
    const [savingManualAlert, setSavingManualAlert] = useState(false);
    const [prefillingContract, setPrefillingContract] = useState(false);
    const [prefillingRenewalKey, setPrefillingRenewalKey] = useState(null);
    const [downloadingId, setDownloadingId] = useState(null);
    const [uploadingRenewalDocumentId, setUploadingRenewalDocumentId] = useState(null);
    const [downloadingRenewalDocumentId, setDownloadingRenewalDocumentId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [fileInputKey, setFileInputKey] = useState(0);
    const [formatContractId, setFormatContractId] = useState("");
    const [formatRenewalId, setFormatRenewalId] = useState(FORMAT_SCOPE_ORIGINAL);
    const [formatTemplateId, setFormatTemplateId] = useState("rent-increase");
    const [formatDateValue, setFormatDateValue] = useState(dateInputValue(new Date()));
    const [rentUpdateFormatForm, setRentUpdateFormatForm] = useState(initialRentUpdateFormatFormState);
    const [generatingFormat, setGeneratingFormat] = useState(false);
    const [downloadingGeneratedDocumentId, setDownloadingGeneratedDocumentId] = useState(null);
    const [deletingGeneratedDocumentGroupKey, setDeletingGeneratedDocumentGroupKey] = useState(null);
    const [contractPrefillNotes, setContractPrefillNotes] = useState([]);
    const [flash, setFlash] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    async function loadModule() {
        setLoading(true);
        setErrorMessage(null);
        try {
            const [contractRows, clientRows, inpcRows] = await Promise.all([
                canRead ? apiGet("/external-contracts") : Promise.resolve([]),
                canWrite ? apiGet("/clients") : Promise.resolve([]),
                canRead ? apiGet("/external-contracts/inpc") : Promise.resolve([])
            ]);
            setContracts(contractRows);
            setInpcRecords(inpcRows);
            setClients(sortClients(clientRows));
            setFormatContractId((current) => current || contractRows[0]?.id || "");
            setSelectedContractId((current) => current || contractRows[0]?.id || "");
            setRentCalculator((current) => ({
                ...current,
                basePeriod: current.basePeriod || getDefaultInpcBasePeriod(inpcRows),
                targetPeriod: current.targetPeriod || getDefaultInpcTargetPeriod(inpcRows)
            }));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        if (!canRead) {
            setLoading(false);
            return;
        }
        void loadModule();
    }, [canRead, canWrite]);
    const leaseContracts = useMemo(() => contracts.filter((contract) => contract.contractType === "LEASE"), [contracts]);
    const activeLeaseCount = useMemo(() => leaseContracts.filter((contract) => contract.status === "ACTIVE").length, [leaseContracts]);
    const archivedLeaseCount = useMemo(() => leaseContracts.filter((contract) => contract.status !== "ACTIVE").length, [leaseContracts]);
    const filteredContracts = useMemo(() => {
        const search = normalizeSearchValue(query);
        const visibleContracts = leaseContracts.filter((contract) => (contractStatusView === "active" ? contract.status === "ACTIVE" : contract.status !== "ACTIVE")
            && (!contractClientFilterId || contract.clientId === contractClientFilterId));
        if (!search) {
            return sortContracts(visibleContracts);
        }
        return sortContracts(visibleContracts.filter((contract) => {
            const haystack = normalizeSearchValue([
                contract.contractNumber,
                contract.title,
                contract.clientNumber,
                contract.clientName,
                contract.propertyAddress,
                contract.landlordName,
                contract.tenantName,
                contract.originalFileName,
                contract.notes,
                ...(contract.generatedDocuments ?? []).flatMap((document) => [
                    document.templateTitle,
                    document.originalFileName
                ]),
                ...(contract.milestones ?? []).flatMap((milestone) => [
                    milestone.title,
                    milestone.dueDate,
                    milestone.description
                ]),
                ...contract.renewals.flatMap((renewal) => [
                    renewalLabel(renewal.sequence - 1),
                    renewal.renewalDate,
                    renewal.leaseStartDate,
                    renewal.leaseEndDate,
                    renewal.monthlyRentMxn ? String(renewal.monthlyRentMxn) : "",
                    renewal.rentIncreasePct ? String(renewal.rentIncreasePct) : "",
                    renewal.inpcBasePeriod,
                    renewal.inpcTargetPeriod,
                    renewal.notes
                ])
            ].filter(Boolean).join(" "));
            return haystack.includes(search);
        }));
    }, [contractClientFilterId, contractStatusView, leaseContracts, query]);
    const groupedContracts = useMemo(() => groupContractsByClient(filteredContracts), [filteredContracts]);
    const selectedManagedContract = useMemo(() => filteredContracts.find((contract) => contract.id === selectedContractId)
        ?? filteredContracts[0], [filteredContracts, selectedContractId]);
    const selectedFormatContract = useMemo(() => selectedManagedContract ?? contracts.find((contract) => contract.id === formatContractId) ?? contracts[0], [contracts, formatContractId, selectedManagedContract]);
    const selectedFormatRenewals = useMemo(() => {
        const storedRenewals = selectedFormatContract?.renewals ?? [];
        if (!selectedFormatContract || selectedFormatContract.id !== selectedManagedContract?.id) {
            return storedRenewals;
        }
        const retainedSavedRenewalIds = new Set(managedRenewals
            .map((renewal) => renewal.id)
            .filter((id) => Boolean(id)));
        return storedRenewals.filter((renewal) => retainedSavedRenewalIds.has(renewal.id));
    }, [managedRenewals, selectedFormatContract, selectedManagedContract?.id]);
    const latestSelectedFormatRenewal = useMemo(() => [...selectedFormatRenewals].sort((left, right) => right.sequence - left.sequence)[0], [selectedFormatRenewals]);
    const selectedFormatRenewal = useMemo(() => formatRenewalId === FORMAT_SCOPE_ORIGINAL
        ? undefined
        : selectedFormatRenewals.find((renewal) => renewal.id === formatRenewalId)
            ?? latestSelectedFormatRenewal, [latestSelectedFormatRenewal, selectedFormatRenewals, formatRenewalId]);
    const inpcRowsAsc = useMemo(() => sortInpcAsc(inpcRecords), [inpcRecords]);
    const inpcRowsDesc = useMemo(() => sortInpcDesc(inpcRecords), [inpcRecords]);
    const latestInpc = inpcRowsDesc[0];
    const previousInpcById = useMemo(() => {
        const recordsById = new Map();
        inpcRowsAsc.forEach((record, index) => {
            const previous = inpcRowsAsc[index - 1];
            if (previous) {
                recordsById.set(record.id, previous);
            }
        });
        return recordsById;
    }, [inpcRowsAsc]);
    const rentIncreaseCalculation = useMemo(() => calculateRentIncreaseFromInpc(inpcRecords, rentCalculator), [inpcRecords, rentCalculator]);
    const allContractMilestones = useMemo(() => contracts.flatMap((contract) => getContractMilestones(contract)), [contracts]);
    useEffect(() => {
        if (filteredContracts.length === 0) {
            setSelectedContractId("");
            return;
        }
        setSelectedContractId((current) => current && filteredContracts.some((contract) => contract.id === current)
            ? current
            : filteredContracts[0].id);
    }, [filteredContracts]);
    useEffect(() => {
        if (!selectedManagedContract) {
            setManagedRenewals([]);
            setActiveRenewalIndex(0);
            setFormatContractId("");
            setFormatRenewalId(FORMAT_SCOPE_ORIGINAL);
            return;
        }
        setManagedRenewals(selectedManagedContract.renewals.map(toRenewalFormState));
        setActiveRenewalIndex(0);
        setFormatContractId(selectedManagedContract.id);
        setFormatRenewalId(getLatestRenewal(selectedManagedContract)?.id ?? FORMAT_SCOPE_ORIGINAL);
    }, [selectedManagedContract]);
    useEffect(() => {
        if (!selectedFormatContract) {
            setFormatRenewalId(FORMAT_SCOPE_ORIGINAL);
            setRentUpdateFormatForm(initialRentUpdateFormatFormState);
            return;
        }
        setFormatRenewalId((current) => {
            if (current === FORMAT_SCOPE_ORIGINAL) {
                return current;
            }
            if (current && selectedFormatRenewals.some((renewal) => renewal.id === current)) {
                return current;
            }
            return latestSelectedFormatRenewal?.id ?? FORMAT_SCOPE_ORIGINAL;
        });
    }, [latestSelectedFormatRenewal, selectedFormatContract, selectedFormatRenewals]);
    useEffect(() => {
        if (!selectedFormatContract || !selectedFormatRenewal) {
            setRentUpdateFormatForm(initialRentUpdateFormatFormState);
            return;
        }
        const preview = buildRentUpdateFormatPreview(selectedFormatContract, selectedFormatRenewal, formatDateValue || dateInputValue(new Date()), inpcRecords);
        const roundedSuggestion = preview.updatedRentMxn
            ? Math.floor(preview.updatedRentMxn / 5) * 5
            : undefined;
        setRentUpdateFormatForm({
            effectiveDate: preview.effectiveDate,
            previousRentMxn: numberToInputValue(preview.previousRentMxn),
            basePeriod: preview.basePeriod ?? "",
            targetPeriod: preview.targetPeriod ?? "",
            useRoundedRent: false,
            roundedRentMxn: numberToInputValue(roundedSuggestion)
        });
    }, [selectedFormatContract?.id, selectedFormatRenewal?.id, inpcRecords]);
    const filteredClients = useMemo(() => {
        const search = normalizeSearchValue(clientSearch);
        if (!search) {
            return clients;
        }
        const selectedClient = clients.find((client) => client.id === form.clientId);
        const matches = clients.filter((client) => normalizeSearchValue(`${client.clientNumber} ${client.name}`).includes(search));
        if (selectedClient && !matches.some((client) => client.id === selectedClient.id)) {
            return [selectedClient, ...matches];
        }
        return matches;
    }, [clientSearch, clients, form.clientId]);
    const activeCount = activeLeaseCount;
    const upcomingCount = allContractMilestones.length;
    function updateForm(key, value) {
        setForm((current) => ({ ...current, [key]: value }));
        setFlash(null);
    }
    function resetForm(clearFlash = true) {
        setForm(initialFormState);
        setSelectedFile(null);
        setEditingId(null);
        setClientSearch("");
        setContractPrefillNotes([]);
        setActiveRenewalIndex(0);
        setManualAlertForm(initialManualAlertFormState);
        setFileInputKey((current) => current + 1);
        if (clearFlash) {
            setFlash(null);
        }
    }
    function handleFileChange(event) {
        const file = event.target.files?.[0] ?? null;
        setSelectedFile(file);
        setContractPrefillNotes([]);
        setFlash(null);
        if (file && isSupportedContractPrefillFile(file)) {
            void handleContractPrefill(file);
        }
    }
    function startEdit(contract) {
        setEditingId(contract.id);
        setForm({
            title: contract.title,
            clientId: contract.clientId,
            propertyAddress: contract.propertyAddress ?? "",
            landlordName: contract.landlordName ?? "",
            tenantName: contract.tenantName ?? "",
            leaseStartDate: contract.leaseStartDate ?? "",
            leaseEndDate: contract.leaseEndDate ?? "",
            monthlyRentMxn: contract.monthlyRentMxn ? String(contract.monthlyRentMxn) : "",
            status: contract.status,
            notes: contract.notes ?? "",
            renewals: contract.renewals.map(toRenewalFormState),
            milestones: (contract.milestones ?? []).map(toMilestoneFormState)
        });
        setClientSearch("");
        setSelectedFile(null);
        setContractPrefillNotes([]);
        setActiveRenewalIndex(0);
        setFileInputKey((current) => current + 1);
        setFlash(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    async function handleContractPrefill(file = selectedFile) {
        if (!canWrite || !file) {
            return;
        }
        if (!isSupportedContractPrefillFile(file)) {
            setFlash({ tone: "error", text: "La extracción con IA acepta PDF o DOCX." });
            return;
        }
        setPrefillingContract(true);
        setFlash(null);
        try {
            const result = await apiPost("/external-contracts/prefill", {
                originalFileName: file.name,
                fileMimeType: file.type || "application/octet-stream",
                fileBase64: await fileToBase64(file)
            });
            setForm((current) => ({
                ...mergePrefillFields(current, result.fields),
                milestones: mergeMilestoneForms(current.milestones, result.importantDates.map(createExtractedMilestone))
            }));
            setContractPrefillNotes(result.notes);
            setFlash({ tone: "success", text: "Datos del contrato extraidos con IA. Revisa y ajusta antes de guardar." });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setPrefillingContract(false);
        }
    }
    function addRenewal() {
        setActiveRenewalIndex(form.renewals.length);
        setForm((current) => ({
            ...current,
            renewals: [...current.renewals, createEmptyRenewal()]
        }));
        setFlash(null);
    }
    function updateRenewal(index, key, value) {
        setForm((current) => ({
            ...current,
            renewals: current.renewals.map((renewal, renewalIndex) => renewalIndex === index ? { ...renewal, [key]: value } : renewal)
        }));
        setFlash(null);
    }
    function removeRenewal(index) {
        if (!window.confirm(`¿Quitar ${renewalLabel(index).toLowerCase()}?`)) {
            return;
        }
        setForm((current) => {
            const renewals = current.renewals.filter((_renewal, renewalIndex) => renewalIndex !== index);
            setActiveRenewalIndex((currentIndex) => Math.min(currentIndex, Math.max(renewals.length - 1, 0)));
            return {
                ...current,
                renewals
            };
        });
        setFlash(null);
    }
    function addManagedRenewal() {
        setManagedRenewals((current) => {
            const nextRenewals = [...current, createEmptyRenewal()];
            setActiveRenewalIndex(nextRenewals.length - 1);
            return nextRenewals;
        });
        setFlash(null);
    }
    function updateManagedRenewal(index, key, value) {
        setManagedRenewals((current) => current.map((renewal, renewalIndex) => renewalIndex === index ? { ...renewal, [key]: value } : renewal));
        setFlash(null);
    }
    async function removeManagedRenewal(index) {
        const renewalToRemove = managedRenewals[index];
        if (!window.confirm(`¿Quitar ${renewalLabel(index).toLowerCase()}? Esta acción eliminará la renovación del sistema.`)) {
            return;
        }
        const nextRenewals = managedRenewals.filter((_renewal, renewalIndex) => renewalIndex !== index);
        if (!selectedManagedContract || !renewalToRemove?.id) {
            setManagedRenewals(nextRenewals);
            setActiveRenewalIndex((currentIndex) => Math.min(currentIndex, Math.max(nextRenewals.length - 1, 0)));
            setFlash(null);
            return;
        }
        setSavingRenewals(true);
        setFlash(null);
        try {
            const updated = await apiPatch(`/external-contracts/${encodeURIComponent(selectedManagedContract.id)}`, { renewals: buildRenewalPayload(nextRenewals) });
            const updatedRenewals = updated.renewals.map(toRenewalFormState);
            setContracts((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
            setManagedRenewals(updatedRenewals);
            setActiveRenewalIndex((currentIndex) => Math.min(currentIndex, Math.max(updatedRenewals.length - 1, 0)));
            setFormatRenewalId((current) => current === renewalToRemove.id
                ? getLatestRenewal(updated)?.id ?? FORMAT_SCOPE_ORIGINAL
                : current);
            setFlash({ tone: "success", text: "Renovación eliminada del contrato." });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSavingRenewals(false);
        }
    }
    function buildRenewalPayload(renewals) {
        return renewals.map((renewal, index) => ({
            id: renewal.id ?? null,
            documentKind: renewal.documentKind,
            renewalDate: renewal.renewalDate || null,
            leaseStartDate: renewal.leaseStartDate || null,
            leaseEndDate: isRentUpdateRenewal(renewal) ? null : renewal.leaseEndDate || null,
            monthlyRentMxn: parseOptionalNumber(renewal.monthlyRentMxn, `El monto de renta de ${renewalLabel(index).toLowerCase()}`),
            rentIncreasePct: parseOptionalNumber(renewal.rentIncreasePct, `El porcentaje de aumento de ${renewalLabel(index).toLowerCase()}`),
            inpcBasePeriod: renewal.inpcBasePeriod || null,
            inpcTargetPeriod: renewal.inpcTargetPeriod || null,
            notes: renewal.notes
        }));
    }
    function buildMilestonePayload(milestones) {
        return milestones
            .filter((milestone) => milestone.title.trim() && milestone.dueDate.trim())
            .map((milestone) => ({
            id: milestone.id ?? null,
            source: milestone.source,
            title: milestone.title.trim(),
            dueDate: milestone.dueDate,
            description: milestone.description.trim() || null
        }));
    }
    function contractMilestonesToForm(contract) {
        return (contract.milestones ?? []).map(toMilestoneFormState);
    }
    async function saveManagedRenewals() {
        if (!canWrite || !selectedManagedContract) {
            return;
        }
        setSavingRenewals(true);
        setFlash(null);
        try {
            const updated = await apiPatch(`/external-contracts/${encodeURIComponent(selectedManagedContract.id)}`, { renewals: buildRenewalPayload(managedRenewals) });
            setContracts((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
            setManagedRenewals(updated.renewals.map(toRenewalFormState));
            setFormatRenewalId(getLatestRenewal(updated)?.id ?? FORMAT_SCOPE_ORIGINAL);
            setFlash({ tone: "success", text: "Renovaciones actualizadas." });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSavingRenewals(false);
        }
    }
    function updateManualAlertForm(key, value) {
        setManualAlertForm((current) => ({ ...current, [key]: value }));
        setFlash(null);
    }
    function updateRentUpdateFormatForm(key, value) {
        setRentUpdateFormatForm((current) => ({ ...current, [key]: value }));
        setFlash(null);
    }
    async function saveManualAlert(contract) {
        if (!canWrite) {
            return;
        }
        if (!manualAlertForm.title.trim() || !manualAlertForm.dueDate.trim()) {
            setFlash({ tone: "error", text: "Escribe el titulo y la fecha de la alerta." });
            return;
        }
        setSavingManualAlert(true);
        setFlash(null);
        try {
            const milestones = [
                ...contractMilestonesToForm(contract),
                {
                    source: "MANUAL",
                    title: manualAlertForm.title,
                    dueDate: manualAlertForm.dueDate,
                    description: manualAlertForm.description
                }
            ];
            const updated = await apiPatch(`/external-contracts/${encodeURIComponent(contract.id)}`, { milestones: buildMilestonePayload(milestones) });
            setContracts((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
            setManualAlertForm(initialManualAlertFormState);
            setFlash({ tone: "success", text: "Alerta agregada al contrato." });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSavingManualAlert(false);
        }
    }
    async function removeContractMilestone(contract, milestoneId) {
        if (!canWrite) {
            return;
        }
        setSavingManualAlert(true);
        setFlash(null);
        try {
            const updated = await apiPatch(`/external-contracts/${encodeURIComponent(contract.id)}`, {
                milestones: buildMilestonePayload(contractMilestonesToForm(contract).filter((milestone) => milestone.id !== milestoneId))
            });
            setContracts((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
            setFlash({ tone: "success", text: "Alerta retirada del contrato." });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSavingManualAlert(false);
        }
    }
    async function handleSubmit(event) {
        event.preventDefault();
        if (!canWrite) {
            setFlash({ tone: "error", text: "Tu perfil no tiene permiso para cargar contratos externos." });
            return;
        }
        if (!form.clientId) {
            setFlash({ tone: "error", text: "Selecciona un cliente del padron." });
            return;
        }
        if (!form.title.trim()) {
            setFlash({ tone: "error", text: "Escribe el nombre del contrato." });
            return;
        }
        if (!editingId && !selectedFile) {
            setFlash({ tone: "error", text: "Carga el contrato del cliente en Word o PDF." });
            return;
        }
        if (selectedFile && !isSupportedContractFile(selectedFile)) {
            setFlash({ tone: "error", text: "El archivo debe ser Word (.doc/.docx) o PDF." });
            return;
        }
        setSaving(true);
        setFlash(null);
        try {
            const fileBase64 = selectedFile ? await fileToBase64(selectedFile) : undefined;
            const payload = {
                title: form.title.trim(),
                contractType: "LEASE",
                status: form.status,
                clientId: form.clientId,
                propertyAddress: form.propertyAddress,
                landlordName: form.landlordName,
                tenantName: form.tenantName,
                leaseStartDate: form.leaseStartDate || null,
                leaseEndDate: form.leaseEndDate || null,
                monthlyRentMxn: parseOptionalNumber(form.monthlyRentMxn, "La renta mensual"),
                notes: form.notes,
                renewals: form.renewals.map((renewal, index) => ({
                    documentKind: renewal.documentKind,
                    renewalDate: renewal.renewalDate || null,
                    leaseStartDate: renewal.leaseStartDate || null,
                    leaseEndDate: isRentUpdateRenewal(renewal) ? null : renewal.leaseEndDate || null,
                    monthlyRentMxn: parseOptionalNumber(renewal.monthlyRentMxn, `El monto de renta de ${renewalLabel(index).toLowerCase()}`),
                    rentIncreasePct: parseOptionalNumber(renewal.rentIncreasePct, `El porcentaje de aumento de ${renewalLabel(index).toLowerCase()}`),
                    inpcBasePeriod: renewal.inpcBasePeriod || null,
                    inpcTargetPeriod: renewal.inpcTargetPeriod || null,
                    notes: renewal.notes
                })),
                milestones: buildMilestonePayload(form.milestones),
                originalFileName: selectedFile?.name,
                fileMimeType: selectedFile?.type || undefined,
                fileBase64
            };
            if (editingId) {
                const updated = await apiPatch(`/external-contracts/${encodeURIComponent(editingId)}`, payload);
                setContracts((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
                setFlash({ tone: "success", text: `Contrato ${updated.contractNumber} actualizado.` });
            }
            else {
                const created = await apiPost("/external-contracts", payload);
                setContracts((current) => [created, ...current]);
                setFormatContractId((current) => current || created.id);
                setSelectedContractId(created.id);
                setFlash({ tone: "success", text: `Contrato ${created.contractNumber} cargado correctamente.` });
            }
            resetForm(false);
            event.currentTarget.reset();
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSaving(false);
        }
    }
    async function handleDownload(contract) {
        setDownloadingId(contract.id);
        setFlash(null);
        try {
            const { blob, filename } = await apiDownload(`/external-contracts/${encodeURIComponent(contract.id)}/document`);
            downloadBlobFile(blob, filename ?? contract.originalFileName ?? `${contract.contractNumber}.bin`);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDownloadingId(null);
        }
    }
    async function handleGeneratedDocumentDownload(contract, document) {
        setDownloadingGeneratedDocumentId(document.id);
        setFlash(null);
        try {
            const { blob, filename } = await apiDownload(`/external-contracts/${encodeURIComponent(contract.id)}/generated-documents/${encodeURIComponent(document.id)}`);
            downloadBlobFile(blob, filename ?? document.originalFileName);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDownloadingGeneratedDocumentId(null);
        }
    }
    async function handleGeneratedDocumentGroupDelete(contract, group) {
        const documents = getGeneratedDocumentGroupDocuments(group);
        if (documents.length === 0) {
            return;
        }
        if (!window.confirm(`Seguro que deseas borrar el formato "${group.templateTitle}"? Se eliminarán sus archivos Word y PDF guardados.`)) {
            return;
        }
        setDeletingGeneratedDocumentGroupKey(group.key);
        setFlash(null);
        try {
            const results = await Promise.allSettled(documents.map((document) => apiDelete(`/external-contracts/${encodeURIComponent(contract.id)}/generated-documents/${encodeURIComponent(document.id)}`)));
            const deletedIds = new Set(documents
                .filter((_, index) => results[index]?.status === "fulfilled")
                .map((document) => document.id));
            const failed = results.find((result) => result.status === "rejected");
            if (deletedIds.size > 0) {
                setContracts((current) => current.map((entry) => entry.id === contract.id
                    ? {
                        ...entry,
                        generatedDocuments: (entry.generatedDocuments ?? []).filter((document) => !deletedIds.has(document.id))
                    }
                    : entry));
            }
            if (failed) {
                setFlash({ tone: "error", text: `No se pudieron borrar todos los archivos del formato. ${toErrorMessage(failed.reason)}` });
                return;
            }
            setFlash({ tone: "success", text: "Formato borrado." });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDeletingGeneratedDocumentGroupKey(null);
        }
    }
    async function uploadRenewalDocument(contract, renewal, file) {
        if (!file || !renewal.id) {
            return null;
        }
        if (!isSupportedContractFile(file)) {
            throw new Error("El documento debe ser Word (.doc/.docx) o PDF.");
        }
        setUploadingRenewalDocumentId(renewal.id);
        try {
            const document = await apiPost(`/external-contracts/${encodeURIComponent(contract.id)}/renewals/${encodeURIComponent(renewal.id)}/documents`, {
                documentType: renewal.documentKind,
                originalFileName: file.name,
                fileMimeType: file.type || "application/octet-stream",
                fileBase64: await fileToBase64(file)
            });
            setContracts((current) => current.map((entry) => entry.id === contract.id
                ? {
                    ...entry,
                    renewals: entry.renewals.map((entryRenewal) => entryRenewal.id === renewal.id
                        ? {
                            ...entryRenewal,
                            documents: [
                                document,
                                ...(entryRenewal.documents ?? []).filter((item) => item.id !== document.id)
                            ]
                        }
                        : entryRenewal)
                }
                : entry));
            setManagedRenewals((current) => current.map((entry) => entry.id === renewal.id
                ? {
                    ...entry,
                    documents: [
                        document,
                        ...(entry.documents ?? []).filter((item) => item.id !== document.id)
                    ]
                }
                : entry));
            return document;
        }
        finally {
            setUploadingRenewalDocumentId(null);
        }
    }
    async function handleRenewalDocumentSelection(source, index, renewal, file, contract) {
        if (!file) {
            return;
        }
        if (!isSupportedContractFile(file)) {
            setFlash({ tone: "error", text: "El documento debe ser Word (.doc/.docx) o PDF." });
            return;
        }
        const renewalKey = `${source}-${renewal.id ?? index}`;
        let uploadedDocument = false;
        setPrefillingRenewalKey(renewalKey);
        setFlash(null);
        try {
            if (contract && renewal.id) {
                uploadedDocument = Boolean(await uploadRenewalDocument(contract, renewal, file));
            }
            if (!isSupportedContractPrefillFile(file)) {
                setFlash({
                    tone: uploadedDocument ? "success" : "error",
                    text: uploadedDocument
                        ? "Documento de renovación cargado. La extracción con IA acepta PDF o DOCX."
                        : "La extracción con IA acepta PDF o DOCX."
                });
                return;
            }
            const result = await apiPost("/external-contracts/renewals/prefill", {
                documentKind: renewal.documentKind,
                originalFileName: file.name,
                fileMimeType: file.type || "application/octet-stream",
                fileBase64: await fileToBase64(file)
            });
            if (source === "form") {
                setForm((current) => ({
                    ...current,
                    renewals: current.renewals.map((entry, entryIndex) => entryIndex === index ? mergeRenewalPrefillFields(entry, result.fields) : entry)
                }));
            }
            else {
                setManagedRenewals((current) => current.map((entry, entryIndex) => entryIndex === index ? mergeRenewalPrefillFields(entry, result.fields) : entry));
            }
            setFlash({
                tone: "success",
                text: uploadedDocument
                    ? "Documento de renovación cargado y datos extraídos con IA."
                    : "Datos de la renovación extraídos con IA. Guarda la renovación para conservarlos."
            });
        }
        catch (error) {
            setFlash({
                tone: "error",
                text: uploadedDocument ? `El documento se cargo, pero ${toErrorMessage(error)}` : toErrorMessage(error)
            });
        }
        finally {
            setPrefillingRenewalKey(null);
        }
    }
    async function handleRenewalDocumentDownload(contract, renewal, document) {
        if (!renewal.id) {
            return;
        }
        setDownloadingRenewalDocumentId(document.id);
        setFlash(null);
        try {
            const { blob, filename } = await apiDownload(`/external-contracts/${encodeURIComponent(contract.id)}/renewals/${encodeURIComponent(renewal.id)}/documents/${encodeURIComponent(document.id)}`);
            downloadBlobFile(blob, filename ?? document.originalFileName);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDownloadingRenewalDocumentId(null);
        }
    }
    async function handleDelete(contract) {
        if (!window.confirm(`Seguro que deseas borrar el contrato ${contract.contractNumber}?`)) {
            return;
        }
        setDeletingId(contract.id);
        setFlash(null);
        try {
            await apiDelete(`/external-contracts/${contract.id}`);
            setContracts((current) => current.filter((entry) => entry.id !== contract.id));
            if (formatContractId === contract.id) {
                setFormatContractId("");
                setFormatRenewalId(FORMAT_SCOPE_ORIGINAL);
            }
            if (selectedContractId === contract.id) {
                setSelectedContractId("");
                setManagedRenewals([]);
            }
            if (editingId === contract.id) {
                resetForm();
            }
            setFlash({ tone: "success", text: `Contrato ${contract.contractNumber} borrado.` });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDeletingId(null);
        }
    }
    function buildRentUpdateFormatPayload(preview) {
        const documentDate = formatDateValue || dateInputValue(new Date());
        const previousRentMxn = parseEditableNumber(rentUpdateFormatForm.previousRentMxn);
        const roundedRentMxn = rentUpdateFormatForm.useRoundedRent
            ? parseEditableNumber(rentUpdateFormatForm.roundedRentMxn)
            : undefined;
        const basePeriod = rentUpdateFormatForm.basePeriod || preview.basePeriod || "";
        const targetPeriod = rentUpdateFormatForm.targetPeriod || preview.targetPeriod || "";
        if (!isValidDateKey(documentDate)) {
            throw new Error("Selecciona una fecha valida para el formato.");
        }
        if (!isValidDateKey(rentUpdateFormatForm.effectiveDate)) {
            throw new Error("Selecciona el inicio de nueva renta.");
        }
        if (!previousRentMxn) {
            throw new Error("Captura la renta anterior.");
        }
        if (!basePeriod || !preview.baseInpc) {
            throw new Error("Selecciona un INPC base cargado en el sistema.");
        }
        if (!targetPeriod || !preview.targetInpc) {
            throw new Error("Selecciona un INPC de actualizacion cargado en el sistema.");
        }
        if (!preview.updatedRentMxn) {
            throw new Error("No se pudo calcular la nueva renta con los INPC seleccionados.");
        }
        if (rentUpdateFormatForm.useRoundedRent && !roundedRentMxn) {
            throw new Error("Captura la renta redondeada que se presentara al arrendatario.");
        }
        return {
            renewalId: selectedFormatRenewal?.id,
            documentDate,
            effectiveDate: rentUpdateFormatForm.effectiveDate,
            previousRentMxn,
            inpcBasePeriod: basePeriod,
            inpcTargetPeriod: targetPeriod,
            useRoundedRent: rentUpdateFormatForm.useRoundedRent,
            roundedRentMxn: roundedRentMxn ?? null
        };
    }
    function getRentUpdateFormatIssue(preview, scopeValue) {
        if (!selectedManagedContract) {
            return "Selecciona un contrato para generar el formato.";
        }
        if (!canWrite) {
            return "Tu perfil no tiene permiso para generar formatos guardados.";
        }
        if (scopeValue === FORMAT_SCOPE_ORIGINAL || !selectedFormatRenewal) {
            return "Selecciona una renovación guardada como documento base.";
        }
        if (!preview) {
            return "No se pudo preparar la información del formato.";
        }
        if (!isValidDateKey(formatDateValue || dateInputValue(new Date()))) {
            return "Selecciona una fecha válida para el formato.";
        }
        if (!isValidDateKey(rentUpdateFormatForm.effectiveDate)) {
            return "Selecciona el inicio de nueva renta.";
        }
        if (!parseEditableNumber(rentUpdateFormatForm.previousRentMxn)) {
            return "Captura la renta anterior.";
        }
        const basePeriod = rentUpdateFormatForm.basePeriod || preview.basePeriod || "";
        const targetPeriod = rentUpdateFormatForm.targetPeriod || preview.targetPeriod || "";
        if (!basePeriod || !preview.baseInpc) {
            return "Selecciona un INPC base cargado en el sistema.";
        }
        if (!targetPeriod || !preview.targetInpc) {
            return "Selecciona un INPC de actualización cargado en el sistema.";
        }
        if (!preview.updatedRentMxn) {
            return "No se pudo calcular la nueva renta con los INPC seleccionados.";
        }
        if (rentUpdateFormatForm.useRoundedRent && !parseEditableNumber(rentUpdateFormatForm.roundedRentMxn)) {
            return "Captura la renta redondeada que se presentará al arrendatario.";
        }
        return null;
    }
    async function handleFormatDownload(output) {
        if (!selectedFormatContract) {
            setFlash({ tone: "error", text: "Selecciona un contrato para generar el formato." });
            return;
        }
        if (formatTemplateId === "rent-increase") {
            if (!canWrite) {
                setFlash({ tone: "error", text: "Tu perfil no tiene permiso para generar formatos guardados." });
                return;
            }
            if (!selectedFormatRenewal) {
                setFlash({ tone: "error", text: "Selecciona o agrega una renovación para generar el formato." });
                return;
            }
            setGeneratingFormat(true);
            setFlash(null);
            try {
                const rentUpdatePreview = buildRentUpdateFormatPreview(selectedFormatContract, selectedFormatRenewal, formatDateValue || dateInputValue(new Date()), inpcRecords, rentUpdateFormatForm);
                const generated = await apiPost(`/external-contracts/${encodeURIComponent(selectedFormatContract.id)}/formats/rent-increase`, buildRentUpdateFormatPayload(rentUpdatePreview));
                const generatedDocuments = [generated.wordDocument, generated.pdfDocument];
                const downloadDocument = output === "pdf" ? generated.pdfDocument : generated.wordDocument;
                setContracts((current) => current.map((entry) => entry.id === selectedFormatContract.id
                    ? {
                        ...entry,
                        generatedDocuments: [
                            ...generatedDocuments,
                            ...(entry.generatedDocuments ?? []).filter((document) => !generatedDocuments.some((generatedDocument) => generatedDocument.id === document.id))
                        ]
                    }
                    : entry));
                const { blob, filename } = await apiDownload(`/external-contracts/${encodeURIComponent(selectedFormatContract.id)}/generated-documents/${encodeURIComponent(downloadDocument.id)}`);
                downloadBlobFile(blob, filename ?? downloadDocument.originalFileName);
                await loadModule();
                if (generated.wordDocument.renewalId) {
                    setFormatRenewalId(generated.wordDocument.renewalId);
                }
                setFlash({ tone: "success", text: "Formato de actualización de renta generado y guardado con Word y PDF." });
            }
            catch (error) {
                setFlash({ tone: "error", text: toErrorMessage(error) });
            }
            finally {
                setGeneratingFormat(false);
            }
            return;
        }
        const generatedFormat = buildGeneratedFormat(selectedFormatContract, formatTemplateId, formatDateValue);
        const filename = formatFilename(`${formatTemplateLabels[formatTemplateId]} ${selectedFormatContract.contractNumber}`);
        try {
            if (output === "pdf") {
                await downloadPdfFormat(generatedFormat, filename);
            }
            else {
                downloadWordFormat(generatedFormat, filename);
            }
            setFlash({ tone: "success", text: `${formatTemplateLabels[formatTemplateId]} generado.` });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
    }
    function updateRentCalculator(key, value) {
        setRentCalculator((current) => ({ ...current, [key]: value }));
        setFlash(null);
    }
    function renderRenewalDocumentKindField(source, index, renewal, disabled) {
        return (_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Documento a cargar" }), _jsx("select", { value: renewal.documentKind, onChange: (event) => {
                        const value = toRenewalDocumentKind(event.target.value);
                        if (source === "form") {
                            updateRenewal(index, "documentKind", value);
                        }
                        else {
                            updateManagedRenewal(index, "documentKind", value);
                        }
                    }, disabled: disabled, children: renewalDocumentKindOptions.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })] }));
    }
    function renderRenewalExtractionPanel(source, index, renewal, disabled, contract) {
        const renewalKey = `${source}-${renewal.id ?? index}`;
        const busy = prefillingRenewalKey === renewalKey || uploadingRenewalDocumentId === renewal.id;
        return (_jsxs("div", { className: "external-contract-renewal-extraction internal-contracts-wide-field", children: [_jsxs("div", { children: [_jsx("strong", { children: "Documento para extraer datos" }), _jsx("span", { children: renewalDocumentKindLabels[renewal.documentKind] })] }), _jsxs("label", { className: `secondary-button external-contract-renewal-document-upload ${disabled || busy ? "is-disabled" : ""}`, children: [busy ? "Procesando..." : "Cargar documento", _jsx("input", { type: "file", accept: ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document", disabled: disabled || busy, onChange: (event) => {
                                const file = event.currentTarget.files?.[0] ?? null;
                                void handleRenewalDocumentSelection(source, index, renewal, file, contract);
                                event.currentTarget.value = "";
                            } })] })] }));
    }
    function renderRenewalsEditor() {
        const activeRenewal = form.renewals[activeRenewalIndex];
        return (_jsxs("section", { className: "external-contract-renewals-editor internal-contracts-wide-field", children: [_jsxs("div", { className: "external-contract-renewals-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Renovaciones" }), _jsxs("span", { children: [form.renewals.length, " registrada", form.renewals.length === 1 ? "" : "s"] })] }), _jsx("button", { className: "secondary-button", type: "button", onClick: addRenewal, disabled: saving || prefillingContract || Boolean(prefillingRenewalKey), children: "Agregar renovaci\u00F3n" })] }), form.renewals.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "A\u00FAn no hay renovaciones cargadas para este contrato." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "external-contract-renewal-tabs", role: "tablist", "aria-label": "Renovaciones del contrato", children: form.renewals.map((_renewal, index) => (_jsx("button", { type: "button", className: `external-contract-renewal-tab ${activeRenewalIndex === index ? "is-active" : ""}`, onClick: () => setActiveRenewalIndex(index), disabled: saving || prefillingContract, children: renewalLabel(index) }, index))) }), activeRenewal ? (_jsxs("div", { className: "external-contract-renewal-fields", children: [renderRenewalDocumentKindField("form", activeRenewalIndex, activeRenewal, saving || prefillingContract || Boolean(prefillingRenewalKey)), renderRenewalExtractionPanel("form", activeRenewalIndex, activeRenewal, saving || prefillingContract), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: getRenewalDateLabel(activeRenewal) }), _jsx("input", { type: "date", value: activeRenewal.renewalDate, onChange: (event) => updateRenewal(activeRenewalIndex, "renewalDate", event.target.value), disabled: saving || Boolean(prefillingRenewalKey) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: getRenewalStartDateLabel(activeRenewal) }), _jsx("input", { type: "date", value: activeRenewal.leaseStartDate, onChange: (event) => updateRenewal(activeRenewalIndex, "leaseStartDate", event.target.value), disabled: saving || Boolean(prefillingRenewalKey) })] }), !isRentUpdateRenewal(activeRenewal) ? (_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fin de vigencia" }), _jsx("input", { type: "date", value: activeRenewal.leaseEndDate, onChange: (event) => updateRenewal(activeRenewalIndex, "leaseEndDate", event.target.value), disabled: saving || Boolean(prefillingRenewalKey) })] })) : null, _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Monto de renta" }), _jsxs("div", { className: "money-input-control has-suffix", children: [_jsx("span", { className: "money-input-prefix", children: "$" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: activeRenewal.monthlyRentMxn, onChange: (event) => updateRenewal(activeRenewalIndex, "monthlyRentMxn", event.target.value), placeholder: "0.00", disabled: saving || Boolean(prefillingRenewalKey) }), _jsx("span", { className: "money-input-suffix", children: "MXN" })] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "% aumento" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: activeRenewal.rentIncreasePct, onChange: (event) => updateRenewal(activeRenewalIndex, "rentIncreasePct", event.target.value), placeholder: "0", disabled: saving || Boolean(prefillingRenewalKey) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "INPC base" }), _jsxs("select", { value: activeRenewal.inpcBasePeriod, onChange: (event) => updateRenewal(activeRenewalIndex, "inpcBasePeriod", event.target.value), disabled: saving || Boolean(prefillingRenewalKey) || inpcRowsAsc.length === 0, children: [_jsx("option", { value: "", children: "-- No aplicar --" }), inpcRowsAsc.map((record) => (_jsxs("option", { value: inpcPeriodKey(record), children: [formatInpcPeriod(record), " - ", formatInpcValue(record.value)] }, record.id)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "INPC actualizaci\u00F3n" }), _jsxs("select", { value: activeRenewal.inpcTargetPeriod, onChange: (event) => updateRenewal(activeRenewalIndex, "inpcTargetPeriod", event.target.value), disabled: saving || Boolean(prefillingRenewalKey) || inpcRowsAsc.length === 0, children: [_jsx("option", { value: "", children: "-- No aplicar --" }), inpcRowsAsc.map((record) => (_jsxs("option", { value: inpcPeriodKey(record), children: [formatInpcPeriod(record), " - ", formatInpcValue(record.value)] }, record.id)))] })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Notas" }), _jsx("textarea", { value: activeRenewal.notes, onChange: (event) => updateRenewal(activeRenewalIndex, "notes", event.target.value), placeholder: "Observaciones de esta renovaci\u00F3n...", disabled: saving || Boolean(prefillingRenewalKey) })] }), _jsx("div", { className: "form-actions external-contract-renewal-actions", children: _jsx("button", { className: "danger-button", type: "button", onClick: () => removeRenewal(activeRenewalIndex), disabled: saving || prefillingContract || Boolean(prefillingRenewalKey), children: "Quitar renovaci\u00F3n" }) })] })) : null] }))] }));
    }
    function renderManagedRenewalsEditor() {
        if (!selectedManagedContract) {
            return null;
        }
        const activeRenewal = managedRenewals[activeRenewalIndex];
        return (_jsxs("section", { className: "external-contract-renewals-editor", children: [_jsxs("div", { className: "external-contract-renewals-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Renovaciones" }), _jsxs("span", { children: [managedRenewals.length, " registrada", managedRenewals.length === 1 ? "" : "s"] })] }), canWrite ? (_jsx("button", { className: "secondary-button", type: "button", onClick: addManagedRenewal, disabled: savingRenewals || Boolean(prefillingRenewalKey), children: "Agregar renovaci\u00F3n" })) : null] }), managedRenewals.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "A\u00FAn no hay renovaciones cargadas para este contrato." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "external-contract-renewal-tabs", role: "tablist", "aria-label": "Renovaciones del contrato cargado", children: managedRenewals.map((renewal, index) => (_jsx("button", { type: "button", className: `external-contract-renewal-tab ${activeRenewalIndex === index ? "is-active" : ""}`, onClick: () => setActiveRenewalIndex(index), disabled: savingRenewals || Boolean(prefillingRenewalKey), children: renewalLabel(index) }, renewal.id ?? `draft-${index}`))) }), activeRenewal ? (_jsxs("div", { className: "external-contract-renewal-fields", children: [renderRenewalDocumentKindField("managed", activeRenewalIndex, activeRenewal, savingRenewals || !canWrite || Boolean(prefillingRenewalKey)), renderRenewalExtractionPanel("managed", activeRenewalIndex, activeRenewal, savingRenewals || !canWrite, selectedManagedContract), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: getRenewalDateLabel(activeRenewal) }), _jsx("input", { type: "date", value: activeRenewal.renewalDate, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "renewalDate", event.target.value), disabled: savingRenewals || !canWrite || Boolean(prefillingRenewalKey) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: getRenewalStartDateLabel(activeRenewal) }), _jsx("input", { type: "date", value: activeRenewal.leaseStartDate, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "leaseStartDate", event.target.value), disabled: savingRenewals || !canWrite || Boolean(prefillingRenewalKey) })] }), !isRentUpdateRenewal(activeRenewal) ? (_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fin de vigencia" }), _jsx("input", { type: "date", value: activeRenewal.leaseEndDate, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "leaseEndDate", event.target.value), disabled: savingRenewals || !canWrite || Boolean(prefillingRenewalKey) })] })) : null, _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Monto de renta" }), _jsxs("div", { className: "money-input-control has-suffix", children: [_jsx("span", { className: "money-input-prefix", children: "$" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: activeRenewal.monthlyRentMxn, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "monthlyRentMxn", event.target.value), placeholder: "0.00", disabled: savingRenewals || !canWrite || Boolean(prefillingRenewalKey) }), _jsx("span", { className: "money-input-suffix", children: "MXN" })] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "% aumento" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: activeRenewal.rentIncreasePct, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "rentIncreasePct", event.target.value), placeholder: "0", disabled: savingRenewals || !canWrite || Boolean(prefillingRenewalKey) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "INPC base" }), _jsxs("select", { value: activeRenewal.inpcBasePeriod, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "inpcBasePeriod", event.target.value), disabled: savingRenewals || !canWrite || Boolean(prefillingRenewalKey) || inpcRowsAsc.length === 0, children: [_jsx("option", { value: "", children: "-- No aplicar --" }), inpcRowsAsc.map((record) => (_jsxs("option", { value: inpcPeriodKey(record), children: [formatInpcPeriod(record), " - ", formatInpcValue(record.value)] }, record.id)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "INPC actualizaci\u00F3n" }), _jsxs("select", { value: activeRenewal.inpcTargetPeriod, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "inpcTargetPeriod", event.target.value), disabled: savingRenewals || !canWrite || Boolean(prefillingRenewalKey) || inpcRowsAsc.length === 0, children: [_jsx("option", { value: "", children: "-- No aplicar --" }), inpcRowsAsc.map((record) => (_jsxs("option", { value: inpcPeriodKey(record), children: [formatInpcPeriod(record), " - ", formatInpcValue(record.value)] }, record.id)))] })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Notas" }), _jsx("textarea", { value: activeRenewal.notes, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "notes", event.target.value), placeholder: "Observaciones de esta renovaci\u00F3n...", disabled: savingRenewals || !canWrite || Boolean(prefillingRenewalKey) })] }), _jsxs("div", { className: "external-contract-renewal-documents internal-contracts-wide-field", children: [_jsx("div", { className: "external-contract-renewal-documents-head", children: _jsxs("div", { children: [_jsx("strong", { children: "Documentos de renovaci\u00F3n" }), _jsxs("span", { children: [activeRenewal.documents?.length ?? 0, " archivo", (activeRenewal.documents?.length ?? 0) === 1 ? "" : "s"] })] }) }), !activeRenewal.id ? (_jsx("small", { children: "La carga se conservar\u00E1 cuando la renovaci\u00F3n est\u00E9 guardada." })) : null, (activeRenewal.documents ?? []).length === 0 ? (_jsx("small", { children: "No hay documentos cargados para esta renovaci\u00F3n." })) : (_jsx("div", { className: "external-contract-renewal-document-list", children: (activeRenewal.documents ?? []).map((document) => (_jsxs("div", { className: "external-contract-renewal-document-row", children: [_jsxs("div", { children: [_jsx("strong", { children: document.originalFileName }), _jsxs("small", { children: [formatFileSize(document.fileSizeBytes), " - ", formatDate(document.createdAt)] })] }), _jsx("button", { className: "secondary-button", type: "button", disabled: downloadingRenewalDocumentId === document.id, onClick: () => void handleRenewalDocumentDownload(selectedManagedContract, activeRenewal, document), children: downloadingRenewalDocumentId === document.id ? "Descargando..." : "Descargar" })] }, document.id))) }))] }), canWrite ? (_jsxs("div", { className: "form-actions external-contract-renewal-actions", children: [_jsx("button", { className: "primary-button", type: "button", onClick: () => void saveManagedRenewals(), disabled: savingRenewals || Boolean(prefillingRenewalKey), children: savingRenewals ? "Guardando..." : activeRenewal.id ? "Actualizar información" : "Guardar renovación" }), _jsx("button", { className: "danger-button", type: "button", onClick: () => void removeManagedRenewal(activeRenewalIndex), disabled: savingRenewals || Boolean(prefillingRenewalKey), children: "Quitar renovaci\u00F3n" })] })) : null] })) : null] }))] }));
    }
    function renderMilestoneRow(milestone, contract) {
        const storedMilestone = contract?.milestones.find((entry) => entry.id === milestone.id);
        const contractSummary = [milestone.contractTitle, milestone.propertyAddress].filter(Boolean).join(" · ") || milestone.clientName;
        const contractSummaryTitle = [
            milestone.contractNumber,
            milestone.clientName,
            milestone.contractTitle,
            milestone.propertyAddress
        ].filter(Boolean).join(" · ");
        return (_jsxs("div", { className: `external-contract-milestone-row is-${milestone.kind}`, children: [_jsxs("div", { className: "external-contract-milestone-date", children: [_jsx("strong", { children: formatDate(milestone.dueDate) }), _jsx("span", { children: milestoneKindLabel(milestone.kind) })] }), _jsxs("div", { className: "external-contract-milestone-body", children: [_jsx("strong", { children: milestone.title }), milestone.description ? _jsx("small", { children: milestone.description }) : null] }), _jsxs("div", { className: "external-contract-milestone-summary", title: contractSummaryTitle, children: [_jsxs("strong", { children: [milestone.contractNumber, " \u00B7 ", milestone.clientName] }), _jsx("span", { children: contractSummary })] }), contract && storedMilestone && canWrite ? (_jsx("button", { className: "secondary-button", type: "button", disabled: savingManualAlert, onClick: () => void removeContractMilestone(contract, storedMilestone.id), children: "Quitar" })) : null] }, milestone.id));
    }
    function renderContractNextActionPanel(contract) {
        const milestones = getContractMilestones(contract);
        const nextMilestones = milestones.slice(0, 8);
        return (_jsxs("div", { className: "external-contract-next-actions", children: [_jsx("div", { className: "external-contract-next-actions-head", children: _jsxs("div", { children: [_jsx("strong", { children: "Hitos y alertas de este contrato" }), _jsxs("span", { children: [nextMilestones.length, " hito", nextMilestones.length === 1 ? "" : "s", " futuro", nextMilestones.length === 1 ? "" : "s"] })] }) }), nextMilestones.length === 0 ? (_jsx("small", { children: "No hay hitos futuros registrados para este contrato." })) : (_jsx("div", { className: "external-contract-milestone-list", children: nextMilestones.map((milestone) => renderMilestoneRow(milestone, contract)) })), canWrite ? (_jsxs("div", { className: "external-contract-manual-alert", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nueva alerta" }), _jsx("input", { value: manualAlertForm.title, onChange: (event) => updateManualAlertForm("title", event.target.value), placeholder: "Ej. Aviso previo al arrendador", disabled: savingManualAlert })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha" }), _jsx("input", { type: "date", value: manualAlertForm.dueDate, onChange: (event) => updateManualAlertForm("dueDate", event.target.value), disabled: savingManualAlert })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Detalle" }), _jsx("textarea", { value: manualAlertForm.description, onChange: (event) => updateManualAlertForm("description", event.target.value), placeholder: "Notas de seguimiento...", disabled: savingManualAlert })] }), _jsx("div", { className: "form-actions external-contract-renewal-actions", children: _jsx("button", { className: "secondary-button", type: "button", disabled: savingManualAlert, onClick: () => void saveManualAlert(contract), children: savingManualAlert ? "Guardando..." : "Agregar alerta" }) })] })) : null] }));
    }
    function renderGeneratedDocumentsArea(contract) {
        const documents = contract.generatedDocuments ?? [];
        const groups = groupGeneratedDocuments(documents);
        return (_jsx("div", { className: "external-contract-generated-documents", children: documents.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "No hay formatos generados para este contrato." })) : (groups.map((group) => {
                const renewal = contract.renewals.find((entry) => entry.id === group.renewalId);
                const displayDocument = group.word ?? group.pdf ?? group.other;
                const deletingGroup = deletingGeneratedDocumentGroupKey === group.key;
                return (_jsxs("div", { className: "external-contract-generated-document", children: [_jsxs("div", { children: [_jsx("strong", { children: group.templateTitle }), _jsxs("small", { children: [displayDocument?.originalFileName ?? "Formato generado", renewal ? ` - ${renewalLabel(renewal.sequence - 1)}` : " - Contrato original", " - ", formatDate(group.createdAt)] })] }), _jsxs("div", { className: "external-contract-generated-document-actions", children: [group.word ? (_jsx("button", { className: "secondary-button", type: "button", disabled: deletingGroup || downloadingGeneratedDocumentId === group.word.id, onClick: () => void handleGeneratedDocumentDownload(contract, group.word), children: downloadingGeneratedDocumentId === group.word.id ? "Descargando..." : "Word" })) : null, group.pdf ? (_jsx("button", { className: "secondary-button", type: "button", disabled: deletingGroup || downloadingGeneratedDocumentId === group.pdf.id, onClick: () => void handleGeneratedDocumentDownload(contract, group.pdf), children: downloadingGeneratedDocumentId === group.pdf.id ? "Descargando..." : "PDF" })) : null, !group.word && !group.pdf && group.other ? (_jsx("button", { className: "secondary-button", type: "button", disabled: deletingGroup || downloadingGeneratedDocumentId === group.other.id, onClick: () => void handleGeneratedDocumentDownload(contract, group.other), children: downloadingGeneratedDocumentId === group.other.id ? "Descargando..." : "Descargar" })) : null, canWrite ? (_jsx("button", { className: "danger-button", type: "button", disabled: deletingGroup, onClick: () => void handleGeneratedDocumentGroupDelete(contract, group), children: deletingGroup ? "Borrando..." : "Borrar" })) : null] })] }, group.key));
            })) }));
    }
    function renderMilestonesSection() {
        const milestones = allContractMilestones
            .filter((milestone) => !contractClientFilterId || contracts.find((contract) => contract.id === milestone.contractId)?.clientId === contractClientFilterId)
            .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.contractNumber.localeCompare(right.contractNumber, "es-MX"));
        return (_jsx("section", { className: "external-contracts-milestones-layout", children: _jsxs("section", { className: "panel external-contracts-milestones-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Pr\u00F3ximos hitos y alertas" }), _jsxs("span", { children: [milestones.length, " fecha", milestones.length === 1 ? "" : "s", " futura", milestones.length === 1 ? "" : "s"] })] }), _jsx("div", { className: "internal-contracts-toolbar external-contracts-management-toolbar", children: _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Cliente" }), _jsxs("select", { value: contractClientFilterId, onChange: (event) => setContractClientFilterId(event.target.value), children: [_jsx("option", { value: "", children: "Todos los clientes" }), sortClients(clients).map((client) => (_jsxs("option", { value: client.id, children: [client.clientNumber, " - ", client.name] }, client.id)))] })] }) }), milestones.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "No hay hitos o alertas futuras." })) : (_jsx("div", { className: "external-contract-milestone-list", children: milestones.map((milestone) => renderMilestoneRow(milestone)) }))] }) }));
    }
    function renderRentUpdateFormatPreview(preview) {
        if (!preview) {
            return (_jsxs("div", { className: "external-contracts-format-preview", children: [_jsx("strong", { children: "Informaci\u00F3n del formato" }), _jsx("span", { children: "Selecciona una renovaci\u00F3n como documento base para ver el c\u00E1lculo antes de generar el Word." })] }));
        }
        return (_jsxs("div", { className: "external-contracts-format-preview", children: [_jsx("div", { className: "external-contracts-format-preview-head", children: _jsxs("div", { children: [_jsx("strong", { children: "Informaci\u00F3n que se usar\u00E1 para generar el formato" }), _jsx("span", { children: "Al generarlo, se registrar\u00E1 como nueva renovaci\u00F3n de actualizaci\u00F3n de renta." })] }) }), _jsxs("div", { className: "external-contracts-format-preview-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Documento base" }), _jsx("strong", { children: preview.baseLabel })] }), _jsxs("label", { className: "external-contracts-format-preview-field", children: [_jsx("span", { children: "Fecha del formato" }), _jsx("input", { type: "date", value: formatDateValue, onChange: (event) => setFormatDateValue(event.target.value), disabled: generatingFormat })] }), _jsxs("label", { className: "external-contracts-format-preview-field", children: [_jsx("span", { children: "Inicio de nueva renta" }), _jsx("input", { type: "date", value: rentUpdateFormatForm.effectiveDate, onChange: (event) => updateRentUpdateFormatForm("effectiveDate", event.target.value), disabled: generatingFormat })] }), _jsxs("label", { className: "external-contracts-format-preview-field", children: [_jsx("span", { children: "Renta anterior" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: rentUpdateFormatForm.previousRentMxn, onChange: (event) => updateRentUpdateFormatForm("previousRentMxn", event.target.value), placeholder: "0.00", disabled: generatingFormat })] }), _jsxs("label", { className: "external-contracts-format-preview-field", children: [_jsx("span", { children: "INPC base" }), _jsxs("select", { value: rentUpdateFormatForm.basePeriod || preview.basePeriod || "", onChange: (event) => updateRentUpdateFormatForm("basePeriod", event.target.value), disabled: generatingFormat || inpcRowsAsc.length === 0, children: [_jsx("option", { value: "", children: "-- Seleccionar --" }), inpcRowsAsc.map((record) => (_jsx("option", { value: inpcPeriodKey(record), children: formatInpcPeriod(record) }, record.id)))] }), _jsx("small", { children: formatInpcValue(preview.baseInpc?.value) })] }), _jsxs("label", { className: "external-contracts-format-preview-field", children: [_jsx("span", { children: "INPC actualizaci\u00F3n" }), _jsxs("select", { value: rentUpdateFormatForm.targetPeriod || preview.targetPeriod || "", onChange: (event) => updateRentUpdateFormatForm("targetPeriod", event.target.value), disabled: generatingFormat || inpcRowsAsc.length === 0, children: [_jsx("option", { value: "", children: "-- Seleccionar --" }), inpcRowsAsc.map((record) => (_jsx("option", { value: inpcPeriodKey(record), children: formatInpcPeriod(record) }, record.id)))] }), _jsx("small", { children: formatInpcValue(preview.targetInpc?.value) })] }), _jsxs("div", { children: [_jsx("span", { children: "Factor" }), _jsx("strong", { children: preview.factor ? preview.factor.toFixed(6) : "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Aumento" }), _jsx("strong", { children: formatCurrency(preview.increaseMxn) }), _jsx("small", { children: formatSignedPercent(preview.increasePct) })] }), _jsxs("div", { children: [_jsx("span", { children: "Nueva renta calculada" }), _jsx("strong", { children: formatCurrency(preview.updatedRentMxn) })] }), _jsxs("label", { className: "external-contracts-format-preview-field external-contracts-format-preview-rounding", children: [_jsx("span", { children: "Renta redondeada" }), _jsxs("span", { className: "external-contracts-format-preview-check", children: [_jsx("input", { type: "checkbox", checked: rentUpdateFormatForm.useRoundedRent, onChange: (event) => updateRentUpdateFormatForm("useRoundedRent", event.target.checked), disabled: generatingFormat }), "Usar renta redondeada"] }), _jsxs("span", { className: "external-contracts-format-money-input", children: [_jsx("span", { className: "external-contracts-format-money-prefix", children: "$" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: rentUpdateFormatForm.roundedRentMxn, onChange: (event) => updateRentUpdateFormatForm("roundedRentMxn", event.target.value), placeholder: "0.00", disabled: generatingFormat || !rentUpdateFormatForm.useRoundedRent }), _jsx("span", { className: "external-contracts-format-money-suffix", children: "MXN" })] })] }), _jsxs("div", { children: [_jsx("span", { children: "Renta a presentar" }), _jsx("strong", { children: formatCurrency(preview.presentedRentMxn) }), _jsx("small", { children: preview.useRoundedRent ? formatSignedPercent(preview.presentedIncreasePct) : "Sin redondeo" })] })] })] }));
    }
    function renderFormatPanel() {
        const scopeValue = formatRenewalId || FORMAT_SCOPE_ORIGINAL;
        const rentUpdateDocumentDate = formatDateValue || dateInputValue(new Date());
        const rentUpdatePreview = formatTemplateId === "rent-increase" && selectedFormatContract && selectedFormatRenewal
            ? buildRentUpdateFormatPreview(selectedFormatContract, selectedFormatRenewal, rentUpdateDocumentDate, inpcRecords, rentUpdateFormatForm)
            : null;
        const rentUpdateFormatIssue = formatTemplateId === "rent-increase"
            ? getRentUpdateFormatIssue(rentUpdatePreview, scopeValue)
            : null;
        return (_jsxs("div", { className: "external-contracts-format-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Generar nuevo formato" }), _jsx("span", { children: selectedManagedContract?.contractNumber ?? "Sin contrato" })] }), _jsxs("div", { className: "external-contracts-format-grid", children: [_jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Formato" }), _jsx("select", { value: formatTemplateId, onChange: (event) => setFormatTemplateId(event.target.value), disabled: !selectedManagedContract, children: Object.keys(formatTemplateLabels).map((templateId) => (_jsx("option", { value: templateId, children: formatTemplateLabels[templateId] }, templateId))) })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Documento base para la generaci\u00F3n de este formato" }), _jsxs("select", { value: scopeValue, onChange: (event) => setFormatRenewalId(event.target.value), disabled: !selectedManagedContract, children: [_jsx("option", { value: FORMAT_SCOPE_ORIGINAL, children: "Contrato original" }), selectedFormatRenewals.map((renewal) => (_jsxs("option", { value: renewal.id, children: [renewalLabel(renewal.sequence - 1), " - ", formatDate(getRenewalDisplayDate(renewal))] }, renewal.id)))] })] }), formatTemplateId !== "rent-increase" ? (_jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Fecha del formato" }), _jsx("input", { type: "date", value: formatDateValue, onChange: (event) => setFormatDateValue(event.target.value), disabled: !selectedManagedContract })] })) : null] }), formatTemplateId === "rent-increase" ? renderRentUpdateFormatPreview(rentUpdatePreview) : null, _jsx("div", { className: "form-actions", children: formatTemplateId === "rent-increase" ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "secondary-button", type: "button", disabled: generatingFormat || Boolean(rentUpdateFormatIssue), onClick: () => void handleFormatDownload("word"), children: generatingFormat ? "Generando..." : "Generar y guardar Word" }), _jsx("button", { className: "primary-button", type: "button", disabled: generatingFormat || Boolean(rentUpdateFormatIssue), onClick: () => void handleFormatDownload("pdf"), children: generatingFormat ? "Generando..." : "Generar y guardar PDF" }), rentUpdateFormatIssue ? (_jsx("div", { className: "external-contracts-format-action-message message-banner message-warning", children: rentUpdateFormatIssue })) : null] })) : (_jsxs(_Fragment, { children: [_jsx("button", { className: "secondary-button", type: "button", disabled: !selectedManagedContract || generatingFormat, onClick: () => void handleFormatDownload("word"), children: "Descargar Word" }), _jsx("button", { className: "primary-button", type: "button", disabled: !selectedManagedContract, onClick: () => void handleFormatDownload("pdf"), children: "Descargar PDF" })] })) })] }));
    }
    function renderInpcSection() {
        return (_jsxs("section", { className: "external-contracts-inpc-layout", children: [_jsxs("section", { className: "panel external-contracts-inpc-summary-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: INPC_SECTION_LABEL }), _jsx("span", { children: "Banxico SP1" })] }), _jsxs("div", { className: "external-contracts-inpc-metrics", children: [_jsxs("div", { children: [_jsx("span", { children: "Ultimo periodo" }), _jsx("strong", { children: formatInpcPeriod(latestInpc) }), _jsx("small", { children: latestInpc ? formatInpcValue(latestInpc.value) : "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Indices guardados" }), _jsx("strong", { children: inpcRecords.length }), _jsx("small", { children: "Desde enero 2025" })] }), _jsxs("div", { children: [_jsx("span", { children: "Fuente" }), _jsx("strong", { children: "Banco de Mexico" }), _jsxs("small", { children: ["Serie ", latestInpc?.sourceSeries ?? "SP1"] })] })] }), _jsx("div", { className: "form-actions", children: _jsx("button", { className: "secondary-button", type: "button", onClick: () => void loadModule(), disabled: loading, children: "Refrescar" }) })] }), _jsxs("section", { className: "panel external-contracts-inpc-calculator-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Calcular aumento de renta" }), _jsx("span", { children: "Factor INPC" })] }), _jsxs("div", { className: "external-contracts-inpc-calculator-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Renta actual" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: rentCalculator.rentMxn, onChange: (event) => updateRentCalculator("rentMxn", event.target.value), placeholder: "0.00" })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "INPC base" }), _jsxs("select", { value: rentCalculator.basePeriod, onChange: (event) => updateRentCalculator("basePeriod", event.target.value), disabled: inpcRecords.length === 0, children: [_jsx("option", { value: "", children: "-- Seleccionar --" }), inpcRowsAsc.map((record) => (_jsxs("option", { value: inpcPeriodKey(record), children: [formatInpcPeriod(record), " - ", formatInpcValue(record.value)] }, record.id)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "INPC actualizaci\u00F3n" }), _jsxs("select", { value: rentCalculator.targetPeriod, onChange: (event) => updateRentCalculator("targetPeriod", event.target.value), disabled: inpcRecords.length === 0, children: [_jsx("option", { value: "", children: "-- Seleccionar --" }), inpcRowsAsc.map((record) => (_jsxs("option", { value: inpcPeriodKey(record), children: [formatInpcPeriod(record), " - ", formatInpcValue(record.value)] }, record.id)))] })] })] }), _jsxs("div", { className: "external-contracts-inpc-calculation", children: [_jsxs("div", { children: [_jsx("span", { children: "Nueva renta" }), _jsx("strong", { children: rentIncreaseCalculation ? formatCurrency(rentIncreaseCalculation.updatedRentMxn) : "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Incremento" }), _jsx("strong", { children: rentIncreaseCalculation ? formatCurrency(rentIncreaseCalculation.increaseMxn) : "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Aumento" }), _jsx("strong", { children: rentIncreaseCalculation ? formatSignedPercent(rentIncreaseCalculation.increasePct) : "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Factor" }), _jsx("strong", { children: rentIncreaseCalculation ? rentIncreaseCalculation.factor.toFixed(6) : "-" })] })] })] }), _jsxs("section", { className: "panel external-contracts-inpc-table-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Indices guardados" }), _jsxs("span", { children: [inpcRecords.length, " registros"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table external-contracts-inpc-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Periodo" }), _jsx("th", { children: "INPC" }), _jsx("th", { children: "Variacion mensual" }), _jsx("th", { children: "Importado" })] }) }), _jsxs("tbody", { children: [loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: "Cargando INPC..." }) })) : null, !loading && inpcRowsDesc.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: "No hay indices INPC guardados." }) })) : null, !loading && inpcRowsDesc.map((record) => {
                                                const previous = previousInpcById.get(record.id);
                                                const monthlyChange = previous ? ((record.value - previous.value) / previous.value) * 100 : undefined;
                                                return (_jsxs("tr", { children: [_jsx("td", { children: formatInpcPeriod(record) }), _jsx("td", { children: formatInpcValue(record.value) }), _jsx("td", { children: formatSignedPercent(monthlyChange) }), _jsx("td", { children: formatDate(record.importedAt) })] }, record.id));
                                            })] })] }) })] })] }));
    }
    function renderContractCard(contract) {
        const nextRenewal = getNextRenewal(contract);
        const renewalTone = deadlineStatus(getRenewalDisplayDate(nextRenewal));
        return (_jsxs("article", { className: "internal-contract-card external-contract-card", children: [_jsxs("div", { className: "internal-contract-card-head", children: [_jsxs("div", { children: [_jsx("span", { className: "internal-contract-number", children: contract.contractNumber }), _jsx("h3", { children: contract.title }), _jsx("p", { className: "internal-contract-title", children: contract.propertyAddress || "Inmueble pendiente" })] }), _jsxs("div", { className: "internal-contract-card-tags", children: [_jsx("span", { className: `status-pill ${contract.status === "ACTIVE" ? "status-live" : "status-migration"}`, children: contract.status === "ACTIVE" ? "Activo" : "Archivado" }), _jsx("span", { className: "status-pill status-live", children: "Arrendamiento" }), contract.renewals.length > 0 ? (_jsxs("span", { className: "status-pill status-warning", children: [contract.renewals.length, " ", contract.renewals.length === 1 ? "renovación" : "renovaciones"] })) : null] })] }), _jsxs("div", { className: "internal-contract-meta-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Archivo principal" }), _jsx("strong", { children: contract.originalFileName ?? "Sin archivo" }), _jsx("small", { children: formatFileSize(contract.fileSizeBytes) })] }), _jsxs("div", { children: [_jsx("span", { children: "Vigencia" }), _jsxs("strong", { children: [formatDate(contract.leaseStartDate), " - ", formatDate(contract.leaseEndDate)] }), _jsxs("small", { children: [formatCurrency(contract.monthlyRentMxn), " renta mensual"] })] }), _jsxs("div", { children: [_jsx("span", { children: "Partes" }), _jsx("strong", { children: contract.landlordName || "Arrendador pendiente" }), _jsx("small", { children: contract.tenantName || "Arrendatario pendiente" })] })] }), _jsxs("div", { className: "external-contract-deadlines", children: [_jsxs("div", { className: `external-contract-deadline is-${renewalTone}`, children: [_jsx("span", { children: "Siguiente renovaci\u00F3n" }), _jsx("strong", { children: formatDate(getRenewalDisplayDate(nextRenewal)) }), _jsx("small", { children: nextRenewal ? renewalLabel(nextRenewal.sequence - 1) : "Sin renovaciones" })] }), _jsxs("div", { className: "external-contract-deadline is-ok", children: [_jsx("span", { children: "Renta renovada" }), _jsx("strong", { children: formatCurrency(nextRenewal?.monthlyRentMxn) }), _jsx("small", { children: formatPercent(nextRenewal?.rentIncreasePct) })] })] }), contract.notes ? _jsx("p", { className: "internal-contract-notes", children: contract.notes }) : null, renderContractNextActionPanel(contract), (contract.generatedDocuments ?? []).length > 0 ? (_jsxs("div", { className: "external-contract-generated-documents", children: [_jsx("span", { children: "Formatos generados" }), (contract.generatedDocuments ?? []).map((document) => {
                            const renewal = contract.renewals.find((entry) => entry.id === document.renewalId);
                            return (_jsxs("div", { className: "external-contract-generated-document", children: [_jsxs("div", { children: [_jsx("strong", { children: document.templateTitle }), _jsxs("small", { children: [document.originalFileName, renewal ? ` - ${renewalLabel(renewal.sequence - 1)}` : "", " - ", formatDate(document.createdAt)] })] }), _jsx("button", { className: "secondary-button", type: "button", disabled: downloadingGeneratedDocumentId === document.id, onClick: () => void handleGeneratedDocumentDownload(contract, document), children: downloadingGeneratedDocumentId === document.id ? "Descargando..." : "Descargar" })] }, document.id));
                        })] })) : null, _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "secondary-button", type: "button", disabled: downloadingId === contract.id, onClick: () => void handleDownload(contract), children: downloadingId === contract.id ? "Descargando..." : "Descargar" }), canWrite ? (_jsx("button", { className: "secondary-button", type: "button", onClick: () => startEdit(contract), children: "Editar informaci\u00F3n" })) : null, canWrite ? (_jsx("button", { className: "danger-button", type: "button", disabled: deletingId === contract.id, onClick: () => void handleDelete(contract), children: deletingId === contract.id ? "Borrando..." : "Borrar" })) : null] })] }, contract.id));
    }
    if (!canRead) {
        return (_jsx("section", { className: "page-stack", children: _jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "module-hero-head", children: _jsx("div", { children: _jsx("h2", { children: MODULE_TITLE }) }) }), _jsx("p", { className: "muted", children: "Tu perfil actual no tiene permisos para consultar este modulo." })] }) }));
    }
    return (_jsxs("section", { className: "page-stack internal-contracts-page external-contracts-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Contratos" }), _jsx("div", { children: _jsx("h2", { children: MODULE_TITLE }) })] }), _jsx("p", { className: "muted", children: "Control de contratos de clientes por empresa, organizados por cliente y con fechas clave de renovaci\u00F3n y aumento de renta." })] }), _jsxs("section", { className: "panel external-contracts-navigation-panel", children: [_jsxs("div", { className: "external-contracts-navigation-head", children: [_jsxs("div", { className: "external-contracts-navigation-title", children: [_jsx("span", { children: "Tipos de contratos" }), _jsx("strong", { children: "Contratos externos" })] }), _jsxs("div", { className: "external-contracts-summary-group", "aria-label": "Resumen de contratos externos", children: [_jsxs("span", { className: "external-contracts-summary-pill", children: [activeCount, " activos"] }), _jsxs("span", { className: "external-contracts-summary-pill", children: [upcomingCount, " fechas pr\u00F3ximas"] })] })] }), _jsxs("div", { className: "external-contracts-navigation-body", children: [_jsx("div", { className: "leads-tabs internal-contracts-tabs external-contracts-type-tabs", role: "tablist", "aria-label": "Tipos de contratos externos", children: _jsxs("button", { type: "button", className: `lead-tab ${activeSection === "contracts" ? "is-active" : ""}`, onClick: () => setActiveSection("contracts"), children: [CONTRACT_SECTION_LABEL, " (", activeLeaseCount, ")"] }) }), _jsxs("div", { className: "external-contracts-utility-nav", "aria-label": "Herramientas de contratos externos", children: [_jsxs("button", { type: "button", className: `external-contracts-utility-button is-alerts ${activeSection === "milestones" ? "is-active" : ""}`, onClick: () => setActiveSection("milestones"), children: [_jsx("span", { children: "Pr\u00F3ximos hitos y alertas" }), _jsx("strong", { children: allContractMilestones.length })] }), _jsxs("button", { type: "button", className: `external-contracts-utility-button ${activeSection === "inpc" ? "is-active" : ""}`, onClick: () => setActiveSection("inpc"), children: [_jsx("span", { children: INPC_SECTION_LABEL }), _jsx("strong", { children: inpcRecords.length })] })] })] })] }), flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, activeSection === "inpc" ? renderInpcSection() : activeSection === "milestones" ? renderMilestonesSection() : (_jsxs("section", { className: "internal-contracts-layout", children: [_jsxs("section", { className: "panel internal-contracts-form-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: editingId ? "Editar contrato" : "Cargar contrato" }), _jsx("span", { children: editingId ? "Información guardada" : "Contrato original" })] }), canWrite ? (_jsxs("form", { className: "internal-contracts-form", onSubmit: handleSubmit, children: [_jsxs("div", { className: "internal-contracts-form-grid", children: [_jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Buscar cliente" }), _jsx("input", { value: clientSearch, onChange: (event) => setClientSearch(event.target.value), placeholder: "Escribe el nombre del cliente...", disabled: saving || loading })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Cliente" }), _jsxs("select", { value: form.clientId, onChange: (event) => updateForm("clientId", event.target.value), disabled: saving || loading, children: [_jsx("option", { value: "", children: "-- Seleccionar cliente --" }), filteredClients.map((client) => (_jsxs("option", { value: client.id, children: [client.clientNumber, " - ", client.name] }, client.id)))] })] }), _jsxs("label", { className: "form-field internal-contracts-file-field", children: [_jsx("span", { children: "Archivo Word/PDF" }), _jsx("input", { type: "file", accept: ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document", onChange: handleFileChange, disabled: saving || prefillingContract }, fileInputKey)] })] }), _jsx("div", { className: "form-actions", children: _jsx("button", { className: "secondary-button", type: "button", onClick: () => void handleContractPrefill(), disabled: saving || loading || prefillingContract || !selectedFile, children: prefillingContract ? "Extrayendo..." : "Extraer con IA" }) }), _jsxs("div", { className: "internal-contracts-form-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Estatus" }), _jsxs("select", { value: form.status, onChange: (event) => updateForm("status", event.target.value), disabled: saving, children: [_jsx("option", { value: "ACTIVE", children: "Activo" }), _jsx("option", { value: "ARCHIVED", children: "Archivado" })] })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Nombre del contrato" }), _jsx("input", { value: form.title, onChange: (event) => updateForm("title", event.target.value), placeholder: "Ej. Arrendamiento local comercial", disabled: saving })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Inmueble" }), _jsx("input", { value: form.propertyAddress, onChange: (event) => updateForm("propertyAddress", event.target.value), placeholder: "Domicilio o identificador del inmueble", disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Arrendador" }), _jsx("input", { value: form.landlordName, onChange: (event) => updateForm("landlordName", event.target.value), placeholder: "Nombre del arrendador", disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Arrendatario" }), _jsx("input", { value: form.tenantName, onChange: (event) => updateForm("tenantName", event.target.value), placeholder: "Nombre del arrendatario", disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Inicio de vigencia" }), _jsx("input", { type: "date", value: form.leaseStartDate, onChange: (event) => updateForm("leaseStartDate", event.target.value), disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fin de vigencia" }), _jsx("input", { type: "date", value: form.leaseEndDate, onChange: (event) => updateForm("leaseEndDate", event.target.value), disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Renta mensual inicial" }), _jsxs("div", { className: "money-input-control", children: [_jsx("span", { className: "money-input-prefix", children: "$" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: form.monthlyRentMxn, onChange: (event) => updateForm("monthlyRentMxn", event.target.value), placeholder: "0.00", disabled: saving })] })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Notas" }), _jsx("textarea", { value: form.notes, onChange: (event) => updateForm("notes", event.target.value), placeholder: "Observaciones internas del contrato...", disabled: saving })] })] }), renderRenewalsEditor(), contractPrefillNotes.length > 0 ? (_jsx("div", { className: "labor-file-contract-prefill-panel", children: _jsxs("div", { children: [_jsx("strong", { children: "Notas IA" }), _jsx("span", { children: contractPrefillNotes.join(" ") })] }) })) : null, _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", type: "submit", disabled: saving || loading || prefillingContract || Boolean(prefillingRenewalKey), children: saving ? (editingId ? "Actualizando..." : "Cargando...") : editingId ? "Actualizar contrato" : "Cargar contrato" }), editingId ? (_jsx("button", { className: "secondary-button", type: "button", onClick: () => resetForm(), disabled: saving || loading || prefillingContract || Boolean(prefillingRenewalKey), children: "Cancelar edici\u00F3n" })) : null, _jsx("button", { className: "secondary-button", type: "button", onClick: () => void loadModule(), disabled: saving || loading || prefillingContract || Boolean(prefillingRenewalKey), children: "Refrescar" })] })] })) : (_jsx("div", { className: "centered-inline-message", children: "Tu perfil puede consultar contratos externos, pero no cargar nuevos archivos." }))] }), _jsxs("section", { className: "panel internal-contracts-list-panel external-contracts-management-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: contractStatusView === "active" ? "Contratos activos" : "Contratos archivados" }), _jsxs("span", { children: [filteredContracts.length, " registros"] })] }), _jsxs("div", { className: "external-contracts-side-area", children: [_jsx("div", { className: "external-contracts-side-area-head", children: _jsxs("div", { children: [_jsx("h3", { children: "Buscador de contratos" }), _jsxs("span", { children: [filteredContracts.length, " resultado", filteredContracts.length === 1 ? "" : "s"] })] }) }), _jsxs("div", { className: "external-contracts-status-tabs", role: "tablist", "aria-label": "Estatus de contratos de arrendamiento", children: [_jsxs("button", { type: "button", className: `external-contracts-status-tab ${contractStatusView === "active" ? "is-active" : ""}`, onClick: () => setContractStatusView("active"), children: [_jsx("span", { children: "Activos" }), _jsx("strong", { children: activeLeaseCount })] }), _jsxs("button", { type: "button", className: `external-contracts-status-tab ${contractStatusView === "archived" ? "is-active" : ""}`, onClick: () => setContractStatusView("archived"), children: [_jsx("span", { children: "Archivados" }), _jsx("strong", { children: archivedLeaseCount })] })] }), _jsxs("div", { className: "internal-contracts-toolbar external-contracts-management-toolbar", children: [_jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { value: query, onChange: (event) => setQuery(event.target.value), placeholder: "Contrato, cliente, inmueble, partes o archivo...", type: "search" })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Cliente" }), _jsxs("select", { value: contractClientFilterId, onChange: (event) => setContractClientFilterId(event.target.value), children: [_jsx("option", { value: "", children: "Todos los clientes" }), sortClients(clients).map((client) => (_jsxs("option", { value: client.id, children: [client.clientNumber, " - ", client.name] }, client.id)))] })] })] })] }), _jsxs("div", { className: "external-contracts-side-area", children: [_jsx("div", { className: "external-contracts-side-area-head", children: _jsxs("div", { children: [_jsx("h3", { children: "Contrato cargado" }), _jsx("span", { children: selectedManagedContract?.contractNumber ?? "Sin selección" })] }) }), _jsx("div", { className: "internal-contracts-toolbar external-contracts-management-toolbar", children: _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Contrato cargado" }), _jsxs("select", { value: selectedManagedContract?.id ?? "", onChange: (event) => setSelectedContractId(event.target.value), disabled: filteredContracts.length === 0, children: [_jsx("option", { value: "", children: "-- Seleccionar contrato --" }), filteredContracts.map((contract) => (_jsxs("option", { value: contract.id, children: [contract.contractNumber, " - ", contract.title || contract.clientName] }, contract.id)))] })] }) }), loading ? _jsx("div", { className: "centered-inline-message", children: "Cargando contratos externos..." }) : null, !loading && !selectedManagedContract ? (_jsx("div", { className: "centered-inline-message", children: contractStatusView === "active"
                                            ? "No hay contratos de arrendamiento activos."
                                            : "No hay contratos de arrendamiento archivados." })) : null, selectedManagedContract ? (_jsxs("article", { className: "internal-contract-card external-contract-card", children: [_jsxs("div", { className: "internal-contract-card-head", children: [_jsxs("div", { children: [_jsx("span", { className: "internal-contract-number", children: selectedManagedContract.contractNumber }), _jsx("h3", { children: selectedManagedContract.title }), _jsx("p", { className: "internal-contract-title", children: selectedManagedContract.propertyAddress || "Inmueble pendiente" })] }), _jsxs("div", { className: "internal-contract-card-tags", children: [_jsx("span", { className: `status-pill ${selectedManagedContract.status === "ACTIVE" ? "status-live" : "status-migration"}`, children: selectedManagedContract.status === "ACTIVE" ? "Activo" : "Archivado" }), _jsx("span", { className: "status-pill status-live", children: "Arrendamiento" })] })] }), _jsxs("div", { className: "internal-contract-meta-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Archivo principal" }), _jsx("strong", { children: selectedManagedContract.originalFileName ?? "Sin archivo" }), _jsx("small", { children: formatFileSize(selectedManagedContract.fileSizeBytes) })] }), _jsxs("div", { children: [_jsx("span", { children: "Vigencia" }), _jsxs("strong", { children: [formatDate(selectedManagedContract.leaseStartDate), " - ", formatDate(selectedManagedContract.leaseEndDate)] }), _jsxs("small", { children: [formatCurrency(selectedManagedContract.monthlyRentMxn), " renta mensual inicial"] })] }), _jsxs("div", { children: [_jsx("span", { children: "Partes" }), _jsx("strong", { children: selectedManagedContract.landlordName || "Arrendador pendiente" }), _jsx("small", { children: selectedManagedContract.tenantName || "Arrendatario pendiente" })] })] }), selectedManagedContract.notes ? _jsx("p", { className: "internal-contract-notes", children: selectedManagedContract.notes }) : null, _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "secondary-button", type: "button", disabled: downloadingId === selectedManagedContract.id, onClick: () => void handleDownload(selectedManagedContract), children: downloadingId === selectedManagedContract.id ? "Descargando..." : "Descargar contrato" }), canWrite ? (_jsx("button", { className: "secondary-button", type: "button", onClick: () => startEdit(selectedManagedContract), children: "Editar informaci\u00F3n" })) : null, canWrite ? (_jsx("button", { className: "danger-button", type: "button", disabled: deletingId === selectedManagedContract.id, onClick: () => void handleDelete(selectedManagedContract), children: deletingId === selectedManagedContract.id ? "Borrando..." : "Borrar" })) : null] })] })) : null] }), selectedManagedContract ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "external-contracts-side-area is-subordinate", children: renderContractNextActionPanel(selectedManagedContract) }), _jsxs("div", { className: "external-contracts-side-area is-subordinate", children: [_jsx("div", { className: "external-contracts-side-area-head", children: _jsxs("div", { children: [_jsx("h3", { children: "Formatos de este contrato" }), _jsxs("span", { children: [(selectedManagedContract.generatedDocuments ?? []).length, " generado", (selectedManagedContract.generatedDocuments ?? []).length === 1 ? "" : "s"] })] }) }), renderGeneratedDocumentsArea(selectedManagedContract)] }), _jsx("div", { className: "external-contracts-side-area is-subordinate", children: renderManagedRenewalsEditor() }), _jsx("div", { className: "external-contracts-side-area is-subordinate", children: renderFormatPanel() })] })) : null] })] }))] }));
}
