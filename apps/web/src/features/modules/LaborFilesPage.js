import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { LABOR_FILE_DOCUMENT_DEFINITIONS } from "@sige/contracts";
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { SummaryCard } from "../../components/SummaryCard";
import { useAuth } from "../auth/AuthContext";
import { RusconiIntelligenceBadge } from "../rusconi-intelligence/RusconiIntelligenceBadge";
const EMPTY_PROFILE_FORM = {
    hireDate: "",
    dailySalaryMxn: "",
    personalPhone: "",
    personalEmail: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactAddress: "",
    notes: ""
};
const EMPTY_GLOBAL_VACATION_FORM = {
    date: "",
    vacationDates: [],
    days: 1,
    description: ""
};
const EMPTY_PREVIOUS_YEAR_PENDING_FORM = {
    days: 0,
    description: "",
    manualOverrideConfirmed: false
};
const VACATION_FORMAT_AUTHORIZER = "Mayra Rubí Ordóñez Mendoza";
const EMPTY_VACATION_FORMAT_FORM = {
    employeeName: "",
    requestDate: "",
    vacationDates: [],
    vacationDays: 1,
    enjoymentText: "",
    interestedName: "",
    authorizerName: VACATION_FORMAT_AUTHORIZER,
    hireDate: "",
    vacationYearStartDate: "",
    completedYearsLabel: "",
    entitlementDays: 0,
    pendingDays: 0,
    enjoyedDays: 0,
    description: "",
    overrideTeamVacationConflict: false
};
const EMPTY_CONTRACT_FORM = {
    employeeName: "",
    rfc: "",
    curp: "",
    employeeAddress: "",
    employeePhone: "",
    position: "",
    originalContractDate: "",
    workdayStart: "09:00",
    workdayEnd: "18:00",
    monthlyGrossSalary: "",
    monthlyGrossSalaryText: "",
    attendanceBonus: "",
    attendanceBonusText: "",
    punctualityBonus: "",
    punctualityBonusText: "",
    biweeklyGrossSalary: "",
    biweeklyGrossSalaryText: "",
    signingDate: "",
    signingCity: "Ciudad de México"
};
const LABOR_DAILY_SALARY_RI_CONNECTION_ID = "RI-003";
const CONTRACT_FIELD_LABELS = {
    employeeName: "Nombre completo",
    rfc: "RFC",
    curp: "CURP",
    employeeAddress: "Domicilio",
    employeePhone: "Teléfono",
    position: "Puesto o labor",
    originalContractDate: "Fecha de ingreso/contrato",
    workdayStart: "Hora de entrada",
    workdayEnd: "Hora de salida",
    monthlyGrossSalary: "Salario mensual",
    monthlyGrossSalaryText: "Salario mensual en letra",
    attendanceBonus: "Bono de asistencia",
    attendanceBonusText: "Bono de asistencia en letra",
    punctualityBonus: "Bono de puntualidad",
    punctualityBonusText: "Bono de puntualidad en letra",
    biweeklyGrossSalary: "Pago quincenal",
    biweeklyGrossSalaryText: "Pago quincenal en letra",
    signingDate: "Fecha de firma",
    signingCity: "Ciudad de firma"
};
function hasPermission(permissions, permission) {
    return Boolean(permissions?.includes("*") || permissions?.includes(permission));
}
function toErrorMessage(error) {
    return error instanceof Error && error.message ? error.message : "Ocurrió un error inesperado.";
}
function formatDate(value) {
    if (!value) {
        return "-";
    }
    return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX");
}
function formatLongDate(value) {
    if (!value) {
        return "-";
    }
    return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}
function formatDateTime(value) {
    if (!value) {
        return "-";
    }
    return new Date(value).toLocaleString("es-MX");
}
function parseVacationSummaryLine(line) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
        return {
            kind: "heading",
            label: line.trim(),
            value: ""
        };
    }
    const label = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    return {
        kind: "row",
        label,
        value: value || "-"
    };
}
function formatMoney(value) {
    if (!value || !Number.isFinite(value)) {
        return "-";
    }
    return value.toLocaleString("es-MX", {
        currency: "MXN",
        minimumFractionDigits: 2,
        style: "currency"
    });
}
function parseMoneyValue(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value !== "string") {
        return undefined;
    }
    const normalized = value
        .replace(/[^0-9.,-]/g, "")
        .replace(/,(?=\d{3}(\D|$))/g, "")
        .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function formatFileSize(value) {
    if (!value) {
        return "-";
    }
    if (value < 1024 * 1024) {
        return `${Math.max(1, Math.round(value / 1024))} KB`;
    }
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
function openBlobFile(blob) {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
function normalizeRoleText(value) {
    return (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}
function requiresProfessionalCredentials(specificRole) {
    const normalized = normalizeRoleText(specificRole);
    const compact = normalized.replace(/[^a-z]/g, "");
    if (!compact.includes("lider") && !compact.includes("lader")) {
        return false;
    }
    return [
        "litigio",
        "corporativo",
        "convenios",
        "der financiero",
        "derecho financiero",
        "compliance fiscal"
    ].some((role) => normalized.includes(role));
}
function isDocumentRequired(documentType, laborFile) {
    const definition = LABOR_FILE_DOCUMENT_DEFINITIONS.find((entry) => entry.type === documentType);
    if (!definition) {
        return false;
    }
    return definition.requirement === "ALWAYS" ||
        (definition.requirement === "PROFESSIONAL_CREDENTIAL" && requiresProfessionalCredentials(laborFile?.specificRole));
}
function getLatestDocument(documents, documentType) {
    return [...documents]
        .filter((document) => document.documentType === documentType)
        .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))[0];
}
function getRecordNumber(record, keys) {
    if (!record || typeof record !== "object") {
        return undefined;
    }
    const source = record;
    for (const key of keys) {
        const parsed = parseMoneyValue(source[key]);
        if (parsed !== undefined) {
            return parsed;
        }
    }
    return undefined;
}
function getContractDailySalary(laborFile, salaryDocuments) {
    const sortedDocuments = [...salaryDocuments]
        .filter((document) => document.documentType === "EMPLOYMENT_CONTRACT" || document.documentType === "ADDENDUM")
        .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt) ||
        (right.documentType === "ADDENDUM" ? 1 : 0) - (left.documentType === "ADDENDUM" ? 1 : 0));
    let unreadableLatestAddendum;
    for (const document of sortedDocuments) {
        const dailySalary = getRecordNumber(document, [
            "contractDailySalaryMxn",
            "dailySalaryMxn",
            "extractedDailySalaryMxn",
            "riExtractedDailySalaryMxn",
            "employmentContractDailySalaryMxn"
        ]);
        if (dailySalary !== undefined) {
            if (unreadableLatestAddendum) {
                return {
                    kind: "unreadable-addendum",
                    originalFileName: unreadableLatestAddendum.originalFileName
                };
            }
            return {
                kind: "salary",
                dailySalaryMxn: dailySalary,
                documentType: document.documentType,
                originalFileName: document.originalFileName
            };
        }
        const monthlySalary = getRecordNumber(document, [
            "contractMonthlyGrossSalaryMxn",
            "monthlyGrossSalaryMxn",
            "monthlySalaryMxn",
            "extractedMonthlyGrossSalaryMxn",
            "riExtractedMonthlyGrossSalaryMxn"
        ]);
        if (monthlySalary !== undefined) {
            if (unreadableLatestAddendum) {
                return {
                    kind: "unreadable-addendum",
                    originalFileName: unreadableLatestAddendum.originalFileName
                };
            }
            return {
                kind: "salary",
                dailySalaryMxn: monthlySalary / 30,
                documentType: document.documentType,
                monthlyGrossSalaryMxn: monthlySalary,
                originalFileName: document.originalFileName
            };
        }
        if (document.documentType === "ADDENDUM" && !unreadableLatestAddendum) {
            unreadableLatestAddendum = document;
        }
    }
    if (unreadableLatestAddendum) {
        return {
            kind: "unreadable-addendum",
            originalFileName: unreadableLatestAddendum.originalFileName
        };
    }
    const dailySalary = getRecordNumber(laborFile, [
        "contractDailySalaryMxn",
        "extractedContractDailySalaryMxn",
        "riContractDailySalaryMxn",
        "employmentContractDailySalaryMxn"
    ]);
    if (dailySalary !== undefined) {
        return {
            kind: "salary",
            dailySalaryMxn: dailySalary
        };
    }
    const monthlySalary = getRecordNumber(laborFile, [
        "contractMonthlyGrossSalaryMxn",
        "extractedContractMonthlyGrossSalaryMxn",
        "riContractMonthlyGrossSalaryMxn",
        "employmentContractMonthlyGrossSalaryMxn"
    ]);
    return monthlySalary !== undefined
        ? {
            kind: "salary",
            dailySalaryMxn: monthlySalary / 30,
            monthlyGrossSalaryMxn: monthlySalary
        }
        : undefined;
}
function formatContractSalaryReference(reference) {
    if (reference.kind === "unreadable-addendum") {
        return reference.originalFileName
            ? `addendum vigente sin salario diario legible (${reference.originalFileName}).`
            : "addendum vigente sin salario diario legible.";
    }
    const sourceLabel = reference.documentType === "ADDENDUM"
        ? "addendum"
        : reference.documentType === "EMPLOYMENT_CONTRACT"
            ? "contrato"
            : "contrato/addenda";
    const salaryDetail = reference.monthlyGrossSalaryMxn
        ? `${formatMoney(reference.dailySalaryMxn)} diario calculado de ${formatMoney(reference.monthlyGrossSalaryMxn)} mensual / 30`
        : `${formatMoney(reference.dailySalaryMxn)} diario`;
    return `${sourceLabel} vigente: ${salaryDetail}.`;
}
function getDailySalaryValidation(laborFile, salaryDocuments) {
    const hasContractDocument = salaryDocuments.some((document) => document.documentType === "EMPLOYMENT_CONTRACT");
    if (!hasContractDocument) {
        return {
            status: "mismatch",
            label: "No coincide",
            detail: "Falta contrato laboral cargado."
        };
    }
    const profileDailySalary = Number(laborFile.dailySalaryMxn ?? 0);
    if (!profileDailySalary) {
        return {
            status: "mismatch",
            label: "No coincide",
            detail: "Falta salario diario en el expediente."
        };
    }
    const contractSalaryReference = getContractDailySalary(laborFile, salaryDocuments);
    if (contractSalaryReference === undefined) {
        return {
            status: "mismatch",
            label: "No coincide",
            detail: "Contrato/addenda cargados sin salario diario legible."
        };
    }
    const salaryReferenceDetail = formatContractSalaryReference(contractSalaryReference);
    if (contractSalaryReference.kind === "unreadable-addendum") {
        return {
            status: "mismatch",
            label: "No coincide",
            detail: `RI-003 toma como referencia ${salaryReferenceDetail}`
        };
    }
    const matches = Math.abs(profileDailySalary - contractSalaryReference.dailySalaryMxn) <= 0.05;
    return matches
        ? {
            status: "match",
            label: "Coincide",
            detail: `Coincide con ${salaryReferenceDetail}`
        }
        : {
            status: "mismatch",
            label: "No coincide",
            detail: `RI-003 toma como referencia ${salaryReferenceDetail}`
        };
}
function getDocumentsByType(documents, documentType) {
    return [...documents]
        .filter((document) => document.documentType === documentType)
        .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}
function getDocumentLabel(documentType) {
    return LABOR_FILE_DOCUMENT_DEFINITIONS.find((definition) => definition.type === documentType)?.label ?? documentType;
}
function getUploadAccept(documentType) {
    const definition = LABOR_FILE_DOCUMENT_DEFINITIONS.find((entry) => entry.type === documentType);
    if (definition?.wordAllowed) {
        return ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    return definition?.pdfOnly
        ? ".pdf,application/pdf"
        : ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
}
function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}
function buildContractFormDefaults(laborFile) {
    return {
        ...EMPTY_CONTRACT_FORM,
        employeeName: laborFile?.employeeName ?? "",
        position: laborFile?.specificRole ?? "",
        originalContractDate: laborFile?.hireDate.slice(0, 10) ?? "",
        signingDate: getTodayKey()
    };
}
function mergeEditableContractFields(current, next) {
    const merged = { ...current };
    for (const field of Object.keys(EMPTY_CONTRACT_FORM)) {
        const value = next[field]?.trim();
        if (value) {
            merged[field] = value;
        }
    }
    return merged;
}
function sortLaborFiles(items) {
    return [...items].sort((left, right) => left.employeeName.localeCompare(right.employeeName, "es-MX", { numeric: true, sensitivity: "base" }));
}
function normalizeComparableText(value) {
    return (value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[._]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function isEduardoRusconi(input) {
    return (normalizeComparableText(input.username) === "eduardo rusconi" ||
        normalizeComparableText(input.displayName) === "eduardo rusconi" ||
        (input.email ?? "").toLowerCase().startsWith("eduardo.rusconi"));
}
function isMayraOrdonez(input) {
    const username = normalizeComparableText(input.username);
    const displayName = normalizeComparableText(input.displayName);
    const email = normalizeComparableText(input.email);
    return ((username.includes("mayra") && username.includes("ordonez")) ||
        (displayName.includes("mayra") && displayName.includes("ordonez")) ||
        (email.includes("mayra") && email.includes("ordonez")));
}
function isSuperadminEduardoRusconi(input) {
    return isEduardoRusconi(input) && (normalizeComparableText(input.role) === "superadmin" ||
        normalizeComparableText(input.legacyRole) === "superadmin" ||
        Boolean(input.permissions?.includes("*")));
}
function isSuperadminUser(input) {
    return (normalizeComparableText(input.role) === "superadmin" ||
        normalizeComparableText(input.legacyRole) === "superadmin" ||
        Boolean(input.permissions?.includes("*")));
}
function addDaysKey(value, offset) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
}
function enumerateDateKeys(startDate, endDate) {
    if (!startDate || !endDate || endDate < startDate) {
        return [];
    }
    const dates = [];
    let cursor = startDate;
    while (cursor <= endDate) {
        dates.push(cursor);
        cursor = addDaysKey(cursor, 1);
    }
    return dates;
}
function sortDateKeys(values) {
    return Array.from(new Set(values.filter(Boolean))).sort();
}
function formatVacationEventDates(event) {
    const dates = event.vacationDates ?? [];
    if (dates.length === 0) {
        if (!event.startDate) {
            return "";
        }
        return event.endDate && event.endDate !== event.startDate
            ? `${formatDate(event.startDate)} al ${formatDate(event.endDate)}`
            : formatDate(event.startDate);
    }
    return dates.map(formatDate).join(", ");
}
function formatVacationFormatDatesText(dates) {
    const sortedDates = sortDateKeys(dates);
    if (sortedDates.length === 0) {
        return "";
    }
    if (sortedDates.length === 1) {
        return `el ${formatDate(sortedDates[0])}`;
    }
    const rangeDates = enumerateDateKeys(sortedDates[0], sortedDates[sortedDates.length - 1]);
    if (rangeDates.length === sortedDates.length) {
        return `del ${formatDate(sortedDates[0])} al ${formatDate(sortedDates[sortedDates.length - 1])}`;
    }
    return sortedDates.map(formatDate).join(", ");
}
function buildVacationFormatFormDefaults(laborFile) {
    const availableDays = laborFile
        ? getVacationSummaryAvailableDays(laborFile)
        : 0;
    return {
        ...EMPTY_VACATION_FORMAT_FORM,
        employeeName: laborFile?.employeeName ?? "",
        requestDate: getTodayKey(),
        interestedName: laborFile?.employeeName ?? "",
        hireDate: laborFile?.hireDate.slice(0, 10) ?? "",
        vacationYearStartDate: laborFile?.vacationSummary.currentYearStartDate ?? "",
        completedYearsLabel: laborFile?.vacationSummary.completedYearsLabel ?? "",
        entitlementDays: availableDays,
        pendingDays: laborFile?.vacationSummary.remainingDays ?? 0,
        enjoyedDays: laborFile?.vacationSummary.usedDays ?? 0
    };
}
function getVacationFormatAccounting(laborFile, selectedDays) {
    if (!laborFile) {
        return {
            hireDate: "",
            vacationYearStartDate: "",
            completedYearsLabel: "",
            entitlementDays: 0,
            pendingDays: 0,
            enjoyedDays: 0
        };
    }
    return {
        hireDate: laborFile.hireDate.slice(0, 10),
        vacationYearStartDate: laborFile.vacationSummary.currentYearStartDate,
        completedYearsLabel: laborFile.vacationSummary.completedYearsLabel,
        entitlementDays: getVacationSummaryAvailableDays(laborFile),
        pendingDays: Math.max(0, laborFile.vacationSummary.remainingDays - selectedDays),
        enjoyedDays: laborFile.vacationSummary.usedDays + selectedDays
    };
}
function getVacationSummaryAvailableDays(laborFile) {
    return laborFile.vacationSummary.entitlementDays +
        laborFile.vacationSummary.previousYearPendingDays +
        laborFile.vacationSummary.yearBeforeLastPendingDays;
}
function getPreviousYearPendingPeriodDates(laborFile, pendingPeriod) {
    return pendingPeriod === "YEAR_BEFORE_LAST"
        ? {
            startDate: laborFile.vacationSummary.yearBeforeLastStartDate,
            endDate: laborFile.vacationSummary.yearBeforeLastEndDate
        }
        : {
            startDate: laborFile.vacationSummary.previousYearStartDate,
            endDate: laborFile.vacationSummary.previousYearEndDate
        };
}
function getCountedPreviousYearPendingEvent(laborFile, pendingPeriod) {
    if (!laborFile) {
        return undefined;
    }
    const periodDates = getPreviousYearPendingPeriodDates(laborFile, pendingPeriod);
    return laborFile.vacationEvents.find((event) => event.eventType === "PREVIOUS_YEAR_PENDING" &&
        event.startDate === periodDates.startDate &&
        event.endDate === periodDates.endDate);
}
function buildPreviousYearPendingFormDefaults(laborFile, pendingPeriod) {
    const currentPendingEvent = getCountedPreviousYearPendingEvent(laborFile, pendingPeriod);
    return {
        ...EMPTY_PREVIOUS_YEAR_PENDING_FORM,
        days: pendingPeriod === "YEAR_BEFORE_LAST"
            ? laborFile?.vacationSummary.yearBeforeLastPendingDays ?? 0
            : laborFile?.vacationSummary.previousYearPendingDays ?? 0,
        description: currentPendingEvent?.description ?? ""
    };
}
function mergeVacationFormatDates(current, laborFile, dates) {
    const vacationDates = sortDateKeys(dates);
    const vacationDays = vacationDates.length;
    return {
        ...current,
        vacationDates,
        vacationDays: vacationDays || current.vacationDays,
        enjoymentText: formatVacationFormatDatesText(vacationDates) || current.enjoymentText,
        pendingDays: laborFile ? Math.max(0, laborFile.vacationSummary.remainingDays - vacationDays) : current.pendingDays,
        enjoyedDays: laborFile ? laborFile.vacationSummary.usedDays + vacationDays : current.enjoyedDays
    };
}
function mergeGlobalVacationDates(current, dates) {
    const vacationDates = sortDateKeys(dates);
    return {
        ...current,
        date: vacationDates[0] ?? "",
        days: vacationDates.length || 1,
        vacationDates
    };
}
function getGlobalVacationDayDates(day) {
    const explicitDates = sortDateKeys(day.vacationDates ?? []);
    if (explicitDates.length > 0) {
        return explicitDates;
    }
    if (!day.date) {
        return [];
    }
    const days = Number(day.days);
    if (!Number.isInteger(days) || days <= 1) {
        return [day.date];
    }
    return Array.from({ length: days }, (_, index) => addDaysKey(day.date, index));
}
function formatGlobalVacationDayDates(day) {
    const dates = getGlobalVacationDayDates(day);
    return formatVacationFormatDatesText(dates) || formatDate(day.date);
}
function isPdfFile(file) {
    return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
function isVacationEventAuthorized(event) {
    const mimeType = (event.acceptanceFileMimeType ?? "").toLowerCase();
    const filename = (event.acceptanceOriginalFileName ?? "").toLowerCase();
    return (event.eventType === "VACATION" || event.eventType === "GLOBAL_VACATION") &&
        (mimeType === "application/pdf" || filename.endsWith(".pdf"));
}
function isVacationFormatEvent(event) {
    return event.eventType === "VACATION" || event.eventType === "GLOBAL_VACATION";
}
function getVacationEventTitle(event) {
    if (event.eventType === "GLOBAL_VACATION") {
        return "Vacaciones generales";
    }
    if (event.eventType === "VACATION") {
        return "Vacaciones";
    }
    if (event.eventType === "PREVIOUS_YEAR_PENDING") {
        return "Saldo pendiente del año anterior";
    }
    return "Descuento del año pasado";
}
function getEmployeeSecondaryLabel(laborFile) {
    if (laborFile.employeeShortName) {
        return laborFile.employeeShortName;
    }
    return normalizeComparableText(laborFile.employeeUsername) === normalizeComparableText(laborFile.employeeName)
        ? laborFile.employeeName
        : laborFile.employeeUsername;
}
function isActiveLaborFile(laborFile) {
    return laborFile.employmentStatus === "ACTIVE";
}
function isHistoricalLaborFile(laborFile) {
    return laborFile.employmentStatus !== "ACTIVE";
}
function getEmploymentStatusLabel(laborFile) {
    if (laborFile.employmentStatus === "ARCHIVED") {
        return "Archivo historico";
    }
    if (laborFile.employmentStatus === "FORMER") {
        return "Extrabajador";
    }
    return "Activo";
}
function getEmploymentStatusClass(laborFile) {
    return laborFile.employmentStatus === "ACTIVE" ? "status-live" : "status-migration";
}
function filterLaborFilesByQuery(laborFiles, query) {
    const normalized = query
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    if (!normalized) {
        return laborFiles;
    }
    return laborFiles.filter((laborFile) => [
        laborFile.employeeName,
        laborFile.employeeUsername,
        laborFile.employeeShortName,
        laborFile.legacyTeam,
        laborFile.specificRole
    ].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalized));
}
function getDefaultLaborFileId(laborFiles, preferredId) {
    if (preferredId && laborFiles.some((laborFile) => laborFile.id === preferredId)) {
        return preferredId;
    }
    return laborFiles.find(isActiveLaborFile)?.id ?? laborFiles[0]?.id ?? "";
}
export function LaborFilesPage() {
    const { user } = useAuth();
    const [laborFiles, setLaborFiles] = useState([]);
    const [selectedId, setSelectedId] = useState("");
    const [profileForm, setProfileForm] = useState(EMPTY_PROFILE_FORM);
    const [uploadType, setUploadType] = useState("EMPLOYMENT_CONTRACT");
    const [selectedFile, setSelectedFile] = useState(null);
    const [contractFormOpen, setContractFormOpen] = useState(false);
    const [contractForm, setContractForm] = useState(EMPTY_CONTRACT_FORM);
    const [contractPrefillSources, setContractPrefillSources] = useState([]);
    const [contractPrefillNotes, setContractPrefillNotes] = useState([]);
    const [prefillingContract, setPrefillingContract] = useState(false);
    const [generatingContract, setGeneratingContract] = useState(false);
    const [vacationFormatFormOpen, setVacationFormatFormOpen] = useState(false);
    const [vacationFormatForm, setVacationFormatForm] = useState(EMPTY_VACATION_FORMAT_FORM);
    const [vacationFormatRange, setVacationFormatRange] = useState({ startDate: "", endDate: "" });
    const [vacationFormatSingleDate, setVacationFormatSingleDate] = useState("");
    const [generatingVacationFormat, setGeneratingVacationFormat] = useState(false);
    const [previousYearPendingForm, setPreviousYearPendingForm] = useState(EMPTY_PREVIOUS_YEAR_PENDING_FORM);
    const [yearBeforeLastPendingForm, setYearBeforeLastPendingForm] = useState(EMPTY_PREVIOUS_YEAR_PENDING_FORM);
    const [savingPreviousYearPending, setSavingPreviousYearPending] = useState(false);
    const [globalVacationDays, setGlobalVacationDays] = useState([]);
    const [globalVacationForm, setGlobalVacationForm] = useState(EMPTY_GLOBAL_VACATION_FORM);
    const [globalVacationRange, setGlobalVacationRange] = useState({ startDate: "", endDate: "" });
    const [globalVacationSingleDate, setGlobalVacationSingleDate] = useState("");
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [documentActionId, setDocumentActionId] = useState(null);
    const [deletingVacationId, setDeletingVacationId] = useState(null);
    const [vacationFileActionId, setVacationFileActionId] = useState(null);
    const [signingVacationEventId, setSigningVacationEventId] = useState(null);
    const [deletingGlobalVacationId, setDeletingGlobalVacationId] = useState(null);
    const [downloadingGlobalVacationId, setDownloadingGlobalVacationId] = useState(null);
    const [flash, setFlash] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const canRead = hasPermission(user?.permissions, "labor-file:read") || hasPermission(user?.permissions, "labor-file:write");
    const canWrite = hasPermission(user?.permissions, "labor-file:write");
    const canOverrideVacationConflicts = Boolean(user && isEduardoRusconi({
        username: user.username,
        displayName: user.displayName,
        email: user.email
    }));
    const canDeleteApprovedVacationFormats = Boolean(user && isEduardoRusconi({
        username: user.username,
        displayName: user.displayName,
        email: user.email
    }));
    const canDeleteDraftVacationFormats = Boolean(user && (isEduardoRusconi({
        username: user.username,
        displayName: user.displayName,
        email: user.email
    }) ||
        isMayraOrdonez({
            username: user.username,
            displayName: user.displayName,
            email: user.email
        })));
    const canManagePreviousYearPending = Boolean(user && isSuperadminEduardoRusconi({
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        legacyRole: user.legacyRole,
        permissions: user.permissions
    }));
    const canDeleteArchivedLaborFiles = Boolean(user && isSuperadminUser({
        role: user.role,
        legacyRole: user.legacyRole,
        permissions: user.permissions
    }));
    const activeLaborFiles = useMemo(() => sortLaborFiles(laborFiles.filter(isActiveLaborFile)), [laborFiles]);
    const historicalLaborFiles = useMemo(() => sortLaborFiles(laborFiles.filter(isHistoricalLaborFile)), [laborFiles]);
    const filteredLaborFiles = useMemo(() => filterLaborFilesByQuery(activeLaborFiles, query), [activeLaborFiles, query]);
    const filteredHistoricalLaborFiles = useMemo(() => filterLaborFilesByQuery(historicalLaborFiles, query), [historicalLaborFiles, query]);
    const selectedLaborFile = laborFiles.find((laborFile) => laborFile.id === selectedId)
        ?? filteredLaborFiles[0]
        ?? filteredHistoricalLaborFiles[0]
        ?? laborFiles[0];
    const canMoveSelectedLaborFile = Boolean(canWrite && selectedLaborFile);
    const canDeleteSelectedLaborFile = Boolean(canDeleteArchivedLaborFiles && selectedLaborFile?.employmentStatus === "ARCHIVED");
    async function loadLaborFiles(preferredId) {
        setLoading(true);
        setErrorMessage(null);
        try {
            const [rows, globalDays] = await Promise.all([
                apiGet("/labor-files"),
                canWrite ? apiGet("/labor-files/global-vacation-days") : Promise.resolve([])
            ]);
            const sortedRows = sortLaborFiles(rows);
            setLaborFiles(sortedRows);
            setGlobalVacationDays(globalDays);
            setSelectedId((current) => getDefaultLaborFileId(sortedRows, preferredId || current));
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
        void loadLaborFiles();
    }, [canRead]);
    useEffect(() => {
        if (!selectedLaborFile) {
            setProfileForm(EMPTY_PROFILE_FORM);
            setContractForm(EMPTY_CONTRACT_FORM);
            setContractFormOpen(false);
            setContractPrefillSources([]);
            setContractPrefillNotes([]);
            setVacationFormatForm(EMPTY_VACATION_FORMAT_FORM);
            setVacationFormatFormOpen(false);
            setVacationFormatRange({ startDate: "", endDate: "" });
            setVacationFormatSingleDate("");
            setPreviousYearPendingForm(EMPTY_PREVIOUS_YEAR_PENDING_FORM);
            setYearBeforeLastPendingForm(EMPTY_PREVIOUS_YEAR_PENDING_FORM);
            return;
        }
        setProfileForm({
            hireDate: selectedLaborFile.hireDate.slice(0, 10),
            dailySalaryMxn: selectedLaborFile.dailySalaryMxn ? String(selectedLaborFile.dailySalaryMxn) : "",
            personalPhone: selectedLaborFile.personalPhone ?? "",
            personalEmail: selectedLaborFile.personalEmail ?? "",
            emergencyContactName: selectedLaborFile.emergencyContactName ?? "",
            emergencyContactPhone: selectedLaborFile.emergencyContactPhone ?? "",
            emergencyContactAddress: selectedLaborFile.emergencyContactAddress ?? "",
            notes: selectedLaborFile.notes ?? ""
        });
        setContractForm(buildContractFormDefaults(selectedLaborFile));
        setContractFormOpen(false);
        setContractPrefillSources([]);
        setContractPrefillNotes([]);
        setVacationFormatForm(buildVacationFormatFormDefaults(selectedLaborFile));
        setVacationFormatFormOpen(false);
        setVacationFormatRange({ startDate: "", endDate: "" });
        setVacationFormatSingleDate("");
        setPreviousYearPendingForm(buildPreviousYearPendingFormDefaults(selectedLaborFile, "LAST_YEAR"));
        setYearBeforeLastPendingForm(buildPreviousYearPendingFormDefaults(selectedLaborFile, "YEAR_BEFORE_LAST"));
        setFlash(null);
    }, [selectedLaborFile?.id]);
    const metrics = useMemo(() => ({
        total: activeLaborFiles.length,
        incomplete: activeLaborFiles.filter((laborFile) => laborFile.status === "INCOMPLETE").length,
        complete: activeLaborFiles.filter((laborFile) => laborFile.status === "COMPLETE").length,
        former: historicalLaborFiles.length
    }), [activeLaborFiles, historicalLaborFiles]);
    function canDeleteVacationEventForCurrentUser(event) {
        if (!canWrite) {
            return false;
        }
        if (event.eventType === "PREVIOUS_YEAR_PENDING") {
            return canManagePreviousYearPending;
        }
        if (!isVacationFormatEvent(event)) {
            return true;
        }
        return isVacationEventAuthorized(event)
            ? canDeleteApprovedVacationFormats
            : canDeleteDraftVacationFormats;
    }
    function isGlobalVacationDayAuthorized(dayId) {
        return laborFiles.some((laborFile) => laborFile.vacationEvents.some((event) => event.eventType === "GLOBAL_VACATION" &&
            event.globalVacationDayId === dayId &&
            isVacationEventAuthorized(event)));
    }
    function canDeleteGlobalVacationDay(dayId) {
        if (!canWrite) {
            return false;
        }
        return isGlobalVacationDayAuthorized(dayId)
            ? canDeleteApprovedVacationFormats
            : canDeleteDraftVacationFormats;
    }
    function handleFileChange(event) {
        setSelectedFile(event.target.files?.[0] ?? null);
        setFlash(null);
    }
    async function handleProfileSave(event) {
        event.preventDefault();
        if (!selectedLaborFile || !canWrite) {
            return;
        }
        setSaving(true);
        setFlash(null);
        try {
            const updatedLaborFile = await apiPatch(`/labor-files/${selectedLaborFile.id}`, {
                hireDate: profileForm.hireDate,
                dailySalaryMxn: profileForm.dailySalaryMxn ? Number(profileForm.dailySalaryMxn) : null,
                personalPhone: profileForm.personalPhone || null,
                personalEmail: profileForm.personalEmail || null,
                emergencyContactName: profileForm.emergencyContactName || null,
                emergencyContactPhone: profileForm.emergencyContactPhone || null,
                emergencyContactAddress: profileForm.emergencyContactAddress || null,
                notes: profileForm.notes || null
            });
            setLaborFiles((current) => sortLaborFiles(current.map((laborFile) => laborFile.id === updatedLaborFile.id ? updatedLaborFile : laborFile)));
            setFlash({ tone: "success", text: "Expediente actualizado." });
            await loadLaborFiles(selectedLaborFile.id);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSaving(false);
        }
    }
    async function handleLaborFileArchive(targetLaborFile = selectedLaborFile) {
        if (!targetLaborFile || !canWrite || isHistoricalLaborFile(targetLaborFile)) {
            return;
        }
        setSaving(true);
        setFlash(null);
        try {
            const archivedLaborFile = await apiPost(`/labor-files/${targetLaborFile.id}/archive`, {});
            setLaborFiles((current) => sortLaborFiles(current.map((laborFile) => laborFile.id === archivedLaborFile.id ? archivedLaborFile : laborFile)));
            setSelectedId(archivedLaborFile.id);
            setFlash({ tone: "success", text: "Expediente enviado al archivo historico." });
            await loadLaborFiles(archivedLaborFile.id);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSaving(false);
        }
    }
    async function handleLaborFileRestore(targetLaborFile = selectedLaborFile) {
        if (!targetLaborFile || !canWrite || !isHistoricalLaborFile(targetLaborFile)) {
            return;
        }
        setSaving(true);
        setFlash(null);
        try {
            const restoredLaborFile = await apiPost(`/labor-files/${targetLaborFile.id}/restore`, {});
            setLaborFiles((current) => sortLaborFiles(current.map((laborFile) => laborFile.id === restoredLaborFile.id ? restoredLaborFile : laborFile)));
            setSelectedId(restoredLaborFile.id);
            setFlash({ tone: "success", text: "Expediente regresado a activos." });
            await loadLaborFiles(restoredLaborFile.id);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSaving(false);
        }
    }
    async function handleLaborFileDelete() {
        if (!selectedLaborFile || !canDeleteSelectedLaborFile) {
            return;
        }
        if (!window.confirm(`Seguro que deseas borrar definitivamente el expediente archivado de ${selectedLaborFile.employeeName}?`)) {
            return;
        }
        setSaving(true);
        setFlash(null);
        try {
            await apiDelete(`/labor-files/${selectedLaborFile.id}`);
            const nextRows = sortLaborFiles(laborFiles.filter((laborFile) => laborFile.id !== selectedLaborFile.id));
            setLaborFiles(nextRows);
            setSelectedId(getDefaultLaborFileId(nextRows));
            setFlash({ tone: "success", text: "Expediente archivado eliminado." });
            await loadLaborFiles(getDefaultLaborFileId(nextRows));
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSaving(false);
        }
    }
    async function handleUpload(event) {
        event.preventDefault();
        if (!selectedLaborFile || !canWrite) {
            return;
        }
        if (!selectedFile) {
            setFlash({ tone: "error", text: "Selecciona un archivo para cargar." });
            return;
        }
        const uploadDefinition = LABOR_FILE_DOCUMENT_DEFINITIONS.find((definition) => definition.type === uploadType);
        if (uploadDefinition?.maxFiles) {
            const currentCount = selectedLaborFile.documents.filter((document) => document.documentType === uploadType).length;
            if (currentCount >= uploadDefinition.maxFiles) {
                setFlash({ tone: "error", text: `Solo se pueden cargar hasta ${uploadDefinition.maxFiles} archivos para ${uploadDefinition.label}.` });
                return;
            }
        }
        setSaving(true);
        setFlash(null);
        try {
            await apiPost(`/labor-files/${selectedLaborFile.id}/documents`, {
                documentType: uploadType,
                originalFileName: selectedFile.name,
                fileMimeType: selectedFile.type || "application/octet-stream",
                fileBase64: await fileToBase64(selectedFile)
            });
            setSelectedFile(null);
            setFlash({ tone: "success", text: `${getDocumentLabel(uploadType)} cargado.` });
            event.currentTarget.reset();
            await loadLaborFiles(selectedLaborFile.id);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSaving(false);
        }
    }
    function updateContractFormField(field, value) {
        setContractForm((current) => ({ ...current, [field]: value }));
        setFlash(null);
    }
    async function handleContractPrefill() {
        if (!selectedLaborFile || !canWrite) {
            return;
        }
        setPrefillingContract(true);
        setFlash(null);
        try {
            const result = await apiPost(`/labor-files/${selectedLaborFile.id}/contract/prefill`, {});
            setContractForm((current) => mergeEditableContractFields(current, result.fields));
            setContractPrefillSources(result.sources);
            setContractPrefillNotes(result.notes);
            setFlash({ tone: "success", text: "Formulario prellenado con IA. Revisa y ajusta antes de generar el contrato." });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setPrefillingContract(false);
        }
    }
    function handleContractFormToggle() {
        if (contractFormOpen) {
            setContractFormOpen(false);
            return;
        }
        setContractFormOpen(true);
        if (selectedLaborFile) {
            setContractForm((current) => mergeEditableContractFields(buildContractFormDefaults(selectedLaborFile), current));
        }
        void handleContractPrefill();
    }
    async function handleContractGenerate(event) {
        event.preventDefault();
        if (!selectedLaborFile || !canWrite) {
            return;
        }
        setGeneratingContract(true);
        setFlash(null);
        try {
            await apiPost(`/labor-files/${selectedLaborFile.id}/contract/generate`, contractForm);
            setFlash({ tone: "success", text: "Contrato laboral generado y guardado en el expediente." });
            await loadLaborFiles(selectedLaborFile.id);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setGeneratingContract(false);
        }
    }
    function updateVacationFormatFormField(field, value) {
        setVacationFormatForm((current) => ({ ...current, [field]: value }));
        setFlash(null);
    }
    function handleVacationFormatFormToggle() {
        if (vacationFormatFormOpen) {
            setVacationFormatFormOpen(false);
            return;
        }
        setVacationFormatFormOpen(true);
        if (selectedLaborFile) {
            setVacationFormatForm((current) => ({
                ...buildVacationFormatFormDefaults(selectedLaborFile),
                ...current,
                vacationDates: current.vacationDates
            }));
        }
    }
    function handleVacationFormatFormReset() {
        if (!selectedLaborFile) {
            return;
        }
        setVacationFormatForm(buildVacationFormatFormDefaults(selectedLaborFile));
        setVacationFormatRange({ startDate: "", endDate: "" });
        setVacationFormatSingleDate("");
        setFlash(null);
    }
    function addVacationFormatDates(dates) {
        if (dates.length === 0) {
            setFlash({ tone: "error", text: "Selecciona al menos un día de vacaciones para el formato." });
            return;
        }
        setVacationFormatForm((current) => mergeVacationFormatDates(current, selectedLaborFile, [...current.vacationDates, ...dates]));
        setFlash(null);
    }
    function handleVacationFormatRangeAdd() {
        if (!vacationFormatRange.startDate || !vacationFormatRange.endDate) {
            setFlash({ tone: "error", text: "Captura el inicio y fin del rango de vacaciones." });
            return;
        }
        const dates = enumerateDateKeys(vacationFormatRange.startDate, vacationFormatRange.endDate);
        if (dates.length === 0) {
            setFlash({ tone: "error", text: "La fecha final no puede ser anterior a la inicial." });
            return;
        }
        addVacationFormatDates(dates);
        setVacationFormatRange({ startDate: "", endDate: "" });
    }
    function handleVacationFormatSingleDateAdd() {
        if (!vacationFormatSingleDate) {
            setFlash({ tone: "error", text: "Selecciona un día de vacaciones." });
            return;
        }
        addVacationFormatDates([vacationFormatSingleDate]);
        setVacationFormatSingleDate("");
    }
    function handleVacationFormatDateRemove(date) {
        setVacationFormatForm((current) => mergeVacationFormatDates(current, selectedLaborFile, current.vacationDates.filter((entry) => entry !== date)));
    }
    async function handleVacationFormatGenerate(event) {
        event.preventDefault();
        if (!selectedLaborFile || !canWrite) {
            return;
        }
        if (vacationFormatForm.vacationDates.length === 0) {
            setFlash({ tone: "error", text: "Agrega al menos un día de vacaciones para generar el formato." });
            return;
        }
        setGeneratingVacationFormat(true);
        setFlash(null);
        try {
            const accounting = getVacationFormatAccounting(selectedLaborFile, vacationFormatForm.vacationDates.length);
            await apiPost(`/labor-files/${selectedLaborFile.id}/vacation-format/generate`, {
                ...vacationFormatForm,
                vacationDays: vacationFormatForm.vacationDates.length,
                ...accounting,
                overrideTeamVacationConflict: canOverrideVacationConflicts && Boolean(vacationFormatForm.overrideTeamVacationConflict)
            });
            setFlash({ tone: "success", text: "Formato de vacaciones generado, guardado y contabilizado." });
            setVacationFormatForm(buildVacationFormatFormDefaults(selectedLaborFile));
            setVacationFormatRange({ startDate: "", endDate: "" });
            setVacationFormatSingleDate("");
            await loadLaborFiles(selectedLaborFile.id);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setGeneratingVacationFormat(false);
        }
    }
    async function handleDocumentDownload(document, mode) {
        setDocumentActionId(document.id);
        setFlash(null);
        try {
            const { blob, filename } = await apiDownload(`/labor-files/documents/${document.id}`);
            if (mode === "open") {
                openBlobFile(blob);
            }
            else {
                downloadBlobFile(blob, filename ?? document.originalFileName);
            }
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDocumentActionId(null);
        }
    }
    async function handleDocumentDelete(document) {
        if (!window.confirm(`Seguro que deseas borrar ${document.originalFileName}?`)) {
            return;
        }
        setDocumentActionId(document.id);
        setFlash(null);
        try {
            await apiDelete(`/labor-files/documents/${document.id}`);
            setFlash({ tone: "success", text: "Documento eliminado." });
            await loadLaborFiles(selectedLaborFile?.id);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDocumentActionId(null);
        }
    }
    async function handleVacationDelete(eventId) {
        setDeletingVacationId(eventId);
        setFlash(null);
        try {
            await apiDelete(`/labor-files/vacation-events/${eventId}`);
            setFlash({ tone: "success", text: "Registro eliminado." });
            await loadLaborFiles(selectedLaborFile?.id);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDeletingVacationId(null);
        }
    }
    async function handleVacationAcceptanceDownload(event, mode) {
        setVacationFileActionId(event.id);
        setFlash(null);
        try {
            const { blob, filename } = await apiDownload(`/labor-files/vacation-events/${event.id}/acceptance-format`);
            if (mode === "open") {
                openBlobFile(blob);
            }
            else {
                downloadBlobFile(blob, filename ?? event.acceptanceOriginalFileName ?? "formato-vacaciones.pdf");
            }
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setVacationFileActionId(null);
        }
    }
    async function handleVacationSignedPdfUpload(event, file) {
        if (!selectedLaborFile || !canWrite) {
            return;
        }
        if (!isPdfFile(file)) {
            setFlash({ tone: "error", text: "El formato firmado debe cargarse en PDF." });
            return;
        }
        setSigningVacationEventId(event.id);
        setFlash(null);
        try {
            await apiPost(`/labor-files/vacation-events/${event.id}/signed-format`, {
                originalFileName: file.name,
                fileMimeType: file.type || "application/pdf",
                fileBase64: await fileToBase64(file),
                overrideTeamVacationConflict: canOverrideVacationConflicts && Boolean(vacationFormatForm.overrideTeamVacationConflict)
            });
            setFlash({ tone: "success", text: "PDF firmado cargado. Vacaciones autorizadas." });
            await loadLaborFiles(selectedLaborFile.id);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSigningVacationEventId(null);
        }
    }
    async function handlePreviousYearPendingSubmit(event, pendingPeriod) {
        event.preventDefault();
        if (!selectedLaborFile || !canWrite) {
            return;
        }
        if (!canManagePreviousYearPending) {
            setFlash({ tone: "error", text: "Solo el superadmin Eduardo Rusconi puede agregar manualmente pendientes del año anterior." });
            return;
        }
        const form = pendingPeriod === "YEAR_BEFORE_LAST" ? yearBeforeLastPendingForm : previousYearPendingForm;
        const setForm = pendingPeriod === "YEAR_BEFORE_LAST" ? setYearBeforeLastPendingForm : setPreviousYearPendingForm;
        const periodCopy = pendingPeriod === "YEAR_BEFORE_LAST"
            ? "del año inmediato anterior al último año"
            : "del último año";
        if (!form.manualOverrideConfirmed) {
            setFlash({ tone: "error", text: `Marca el checkbox para confirmar el ajuste manual ${periodCopy}.` });
            return;
        }
        setSavingPreviousYearPending(true);
        setFlash(null);
        try {
            await apiPost(`/labor-files/${selectedLaborFile.id}/previous-year-pending-vacations`, {
                days: Number(form.days) || 0,
                description: form.description || null,
                manualOverrideConfirmed: true,
                pendingPeriod
            });
            setForm((current) => ({ ...current, manualOverrideConfirmed: false }));
            setFlash({ tone: "success", text: `Saldo pendiente ${periodCopy} actualizado.` });
            await loadLaborFiles(selectedLaborFile.id);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSavingPreviousYearPending(false);
        }
    }
    function addGlobalVacationDates(dates) {
        if (dates.length === 0) {
            setFlash({ tone: "error", text: "Selecciona al menos un día de vacaciones generales." });
            return;
        }
        setGlobalVacationForm((current) => mergeGlobalVacationDates(current, [...(current.vacationDates ?? []), ...dates]));
        setFlash(null);
    }
    function handleGlobalVacationRangeAdd() {
        if (!globalVacationRange.startDate || !globalVacationRange.endDate) {
            setFlash({ tone: "error", text: "Captura el inicio y fin del periodo de vacaciones generales." });
            return;
        }
        const dates = enumerateDateKeys(globalVacationRange.startDate, globalVacationRange.endDate);
        if (dates.length === 0) {
            setFlash({ tone: "error", text: "La fecha final no puede ser anterior a la inicial." });
            return;
        }
        addGlobalVacationDates(dates);
        setGlobalVacationRange({ startDate: "", endDate: "" });
    }
    function handleGlobalVacationSingleDateAdd() {
        if (!globalVacationSingleDate) {
            setFlash({ tone: "error", text: "Selecciona un día de vacaciones generales." });
            return;
        }
        addGlobalVacationDates([globalVacationSingleDate]);
        setGlobalVacationSingleDate("");
    }
    function handleGlobalVacationDateRemove(date) {
        setGlobalVacationForm((current) => mergeGlobalVacationDates(current, (current.vacationDates ?? []).filter((entry) => entry !== date)));
    }
    async function handleGlobalVacationSubmit(event) {
        event.preventDefault();
        if (!canWrite) {
            return;
        }
        const vacationDates = sortDateKeys(globalVacationForm.vacationDates ?? []);
        if (vacationDates.length === 0) {
            setFlash({ tone: "error", text: "Agrega al menos un día o periodo de vacaciones generales." });
            return;
        }
        setSaving(true);
        setFlash(null);
        try {
            const result = await apiPost("/labor-files/global-vacation-days", {
                date: vacationDates[0],
                vacationDates,
                days: vacationDates.length,
                description: globalVacationForm.description || null
            });
            setGlobalVacationForm(EMPTY_GLOBAL_VACATION_FORM);
            setGlobalVacationRange({ startDate: "", endDate: "" });
            setGlobalVacationSingleDate("");
            setFlash({ tone: "success", text: `Vacación general registrada. Se generaron ${result.generatedFormats} formatos individuales.` });
            await loadLaborFiles(selectedLaborFile?.id);
            await downloadGlobalVacationFormats(result.day);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSaving(false);
        }
    }
    async function downloadGlobalVacationFormats(day) {
        setDownloadingGlobalVacationId(day.id);
        try {
            const { blob, filename } = await apiDownload(`/labor-files/global-vacation-days/${day.id}/acceptance-formats`);
            downloadBlobFile(blob, filename ?? `formatos-vacaciones-generales-${day.date}.zip`);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDownloadingGlobalVacationId(null);
        }
    }
    async function handleGlobalVacationDelete(dayId) {
        setDeletingGlobalVacationId(dayId);
        setFlash(null);
        try {
            await apiDelete(`/labor-files/global-vacation-days/${dayId}`);
            setFlash({ tone: "success", text: "Día general de vacaciones eliminado." });
            await loadLaborFiles(selectedLaborFile?.id);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDeletingGlobalVacationId(null);
        }
    }
    if (!canRead) {
        return (_jsx("section", { className: "page-stack", children: _jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "module-hero-head", children: _jsx("div", { children: _jsx("h2", { children: "Expedientes Laborales" }) }) }), _jsx("p", { className: "muted", children: "Tu perfil actual no tiene permisos para consultar expedientes laborales." })] }) }));
    }
    const contractDocument = selectedLaborFile
        ? getLatestDocument(selectedLaborFile.documents, "EMPLOYMENT_CONTRACT")
        : undefined;
    const salaryDocuments = selectedLaborFile?.documents.filter((document) => document.documentType === "EMPLOYMENT_CONTRACT" || document.documentType === "ADDENDUM") ?? [];
    const displayedDailySalaryMxn = canWrite
        ? parseMoneyValue(profileForm.dailySalaryMxn)
        : selectedLaborFile?.dailySalaryMxn;
    const dailySalaryValidation = selectedLaborFile
        ? getDailySalaryValidation({ ...selectedLaborFile, dailySalaryMxn: displayedDailySalaryMxn }, salaryDocuments)
        : undefined;
    const latestVacationFormatEvent = selectedLaborFile?.vacationEvents
        .filter((event) => event.eventType === "VACATION" && event.acceptanceOriginalFileName)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    const vacationFormatSelectedDays = vacationFormatForm.vacationDates.length;
    const vacationFormatProjectedPending = selectedLaborFile
        ? Math.max(0, selectedLaborFile.vacationSummary.remainingDays - vacationFormatSelectedDays)
        : vacationFormatForm.pendingDays;
    const vacationFormatProjectedCommitted = selectedLaborFile
        ? selectedLaborFile.vacationSummary.usedDays + vacationFormatSelectedDays
        : vacationFormatForm.enjoyedDays;
    const vacationFormatAccounting = getVacationFormatAccounting(selectedLaborFile, vacationFormatSelectedDays);
    const addenda = selectedLaborFile?.documents
        .filter((document) => document.documentType === "ADDENDUM")
        .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt)) ?? [];
    const documentDefinitions = LABOR_FILE_DOCUMENT_DEFINITIONS.filter((definition) => !definition.contractSection);
    const selectedUploadDefinition = LABOR_FILE_DOCUMENT_DEFINITIONS.find((definition) => definition.type === uploadType);
    const selectedUploadCount = selectedLaborFile
        ? selectedLaborFile.documents.filter((document) => document.documentType === uploadType).length
        : 0;
    const selectedUploadLimitReached = Boolean(selectedUploadDefinition?.maxFiles && selectedUploadCount >= selectedUploadDefinition.maxFiles);
    function renderLaborFileSelectorButton(laborFile) {
        return (_jsxs("button", { className: [
                laborFile.id === selectedLaborFile?.id ? "is-active" : "",
                laborFile.status === "COMPLETE" ? "is-complete" : "is-incomplete"
            ].filter(Boolean).join(" "), onClick: () => setSelectedId(laborFile.id), type: "button", children: [_jsxs("div", { className: "labor-file-selector-head", children: [_jsx("strong", { children: laborFile.employeeName }), _jsx("span", { className: `status-pill labor-file-selector-status ${laborFile.status === "COMPLETE" ? "status-live" : "status-warning"}`, children: laborFile.status === "COMPLETE" ? "Completo" : "Incompleto" })] }), _jsx("span", { children: getEmployeeSecondaryLabel(laborFile) }), isHistoricalLaborFile(laborFile) ? _jsx("small", { children: getEmploymentStatusLabel(laborFile) }) : null] }, laborFile.id));
    }
    function renderSelectedLaborFileMoveAction(laborFile) {
        if (!canMoveSelectedLaborFile || laborFile.id !== selectedLaborFile?.id) {
            return null;
        }
        const isHistorical = isHistoricalLaborFile(laborFile);
        return (_jsx("button", { className: "secondary-button labor-file-selector-context-action", disabled: saving, onClick: () => isHistorical ? void handleLaborFileRestore(laborFile) : void handleLaborFileArchive(laborFile), type: "button", children: isHistorical ? "Regresar a activos" : "Enviar al archivo historico" }));
    }
    function renderLaborFileSelectorEntry(laborFile) {
        return (_jsxs("div", { className: "labor-file-selector-entry", children: [renderLaborFileSelectorButton(laborFile), renderSelectedLaborFileMoveAction(laborFile)] }, laborFile.id));
    }
    return (_jsxs("section", { className: "page-stack labor-files-page", children: [_jsxs("header", { className: "hero module-hero labor-files-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Expedientes" }), _jsx("div", { children: _jsx("h2", { children: "Expedientes Laborales" }) })] }), _jsx("p", { className: "muted", children: "Contratos, documentos obligatorios y vacaciones por usuario, conservados tambi\u00E9n para extrabajadores." })] }), canWrite ? (_jsxs("div", { className: "summary-grid", children: [_jsx(SummaryCard, { label: "Activos", value: metrics.total, accent: "#1d4ed8" }), _jsx(SummaryCard, { label: "Completos", value: metrics.complete, accent: "#0f766e" }), _jsx(SummaryCard, { label: "Incompletos", value: metrics.incomplete, accent: "#b42318" }), _jsx(SummaryCard, { label: "Archivo historico", value: metrics.former, accent: "#9a6700" })] })) : null, flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, canWrite ? (_jsxs("section", { className: "panel labor-file-global-vacation-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Vacaciones generales" }), _jsx("span", { children: "Genera los formatos individuales y registra el movimiento en todos los trabajadores activos." })] }), _jsxs("span", { children: [globalVacationDays.length, " registrados"] })] }), _jsxs("form", { className: "labor-file-global-vacation-form", onSubmit: handleGlobalVacationSubmit, children: [_jsxs("div", { className: "labor-file-vacation-date-tools", children: [_jsxs("div", { className: "labor-file-vacation-date-group is-range", children: [_jsx("h3", { children: "D\u00EDas continuos" }), _jsxs("div", { className: "labor-file-vacation-date-row", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Inicio" }), _jsx("input", { type: "date", value: globalVacationRange.startDate, onChange: (event) => setGlobalVacationRange((current) => ({ ...current, startDate: event.target.value })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fin" }), _jsx("input", { type: "date", value: globalVacationRange.endDate, onChange: (event) => setGlobalVacationRange((current) => ({ ...current, endDate: event.target.value })) })] }), _jsx("button", { className: "secondary-button", onClick: handleGlobalVacationRangeAdd, type: "button", children: "Agregar periodo" })] })] }), _jsxs("div", { className: "labor-file-vacation-date-group is-single", children: [_jsx("h3", { children: "D\u00EDa suelto" }), _jsxs("div", { className: "labor-file-vacation-date-row", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha" }), _jsx("input", { type: "date", value: globalVacationSingleDate, onChange: (event) => setGlobalVacationSingleDate(event.target.value) })] }), _jsx("button", { className: "secondary-button", onClick: handleGlobalVacationSingleDateAdd, type: "button", children: "Agregar d\u00EDa" })] })] })] }), _jsxs("div", { className: "labor-file-vacation-selected-days", children: [_jsxs("div", { className: "labor-file-vacation-format-section-title", children: [_jsx("h4", { children: "D\u00EDas seleccionados" }), _jsxs("span", { children: [globalVacationForm.vacationDates?.length ?? 0, " d\u00EDas para todos"] })] }), (globalVacationForm.vacationDates ?? []).length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Agrega un d\u00EDa o un periodo." })) : (_jsx("div", { className: "labor-file-vacation-day-chips", children: (globalVacationForm.vacationDates ?? []).map((date) => (_jsxs("button", { onClick: () => handleGlobalVacationDateRemove(date), type: "button", children: [formatDate(date), " ", _jsx("span", { children: "Quitar" })] }, date))) }))] }), _jsxs("label", { className: "form-field labor-file-global-vacation-description", children: [_jsx("span", { children: "Descripci\u00F3n" }), _jsx("input", { value: globalVacationForm.description ?? "", onChange: (event) => setGlobalVacationForm((current) => ({ ...current, description: event.target.value })) })] }), _jsx("div", { className: "labor-file-global-vacation-actions", children: _jsx("button", { className: "primary-button", disabled: saving, type: "submit", children: saving ? "Generando..." : "Generar para todos" }) })] }), _jsx("div", { className: "labor-file-global-vacation-list", children: globalVacationDays.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Sin vacaciones generales registradas." })) : globalVacationDays.map((day) => {
                            const canDeleteDay = canDeleteGlobalVacationDay(day.id);
                            return (_jsxs("div", { className: "labor-file-vacation-event", children: [_jsxs("div", { children: [_jsx("strong", { children: formatGlobalVacationDayDates(day) }), _jsxs("span", { children: [day.days, " ", day.days === 1 ? "día" : "días", " para todos"] })] }), day.description ? _jsx("small", { children: day.description }) : _jsx("small", { children: "Vacaci\u00F3n general" }), _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "ghost-button", disabled: downloadingGlobalVacationId === day.id, onClick: () => void downloadGlobalVacationFormats(day), type: "button", children: downloadingGlobalVacationId === day.id ? "Preparando..." : "Descargar formatos" }), canDeleteDay ? (_jsx("button", { className: "danger-button", disabled: deletingGlobalVacationId === day.id, onClick: () => void handleGlobalVacationDelete(day.id), type: "button", children: "Quitar" })) : null] })] }, day.id));
                        }) })] })) : null, _jsxs("section", { className: "labor-files-layout", children: [canWrite ? (_jsxs("aside", { className: "panel labor-files-sidebar", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Colaboradores activos" }), _jsx("span", { children: filteredLaborFiles.length })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { type: "search", value: query, onChange: (event) => setQuery(event.target.value), placeholder: "Nombre, equipo o rol..." })] }), _jsxs("div", { className: "labor-file-selector-list", children: [loading ? _jsx("div", { className: "centered-inline-message", children: "Cargando expedientes..." }) : null, !loading && filteredLaborFiles.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Sin colaboradores activos." })) : null, !loading && filteredLaborFiles.map(renderLaborFileSelectorEntry)] }), _jsxs("div", { className: "labor-file-archive-section", children: [_jsxs("div", { className: "labor-file-archive-head", children: [_jsx("h3", { children: "Archivo historico" }), _jsx("span", { children: filteredHistoricalLaborFiles.length })] }), _jsxs("div", { className: "labor-file-selector-list labor-file-archive-list", children: [!loading && filteredHistoricalLaborFiles.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Sin expedientes historicos." })) : null, !loading && filteredHistoricalLaborFiles.map(renderLaborFileSelectorEntry)] })] })] })) : null, _jsxs("div", { className: "labor-file-main", children: [!selectedLaborFile && !loading ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "No hay expediente laboral disponible." }) })) : null, selectedLaborFile ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel labor-file-profile-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Informaci\u00F3n general" }), _jsxs("span", { children: [selectedLaborFile.employeeName, " / ", selectedLaborFile.legacyTeam ?? "Sin equipo", " / ", selectedLaborFile.specificRole ?? "Sin rol"] })] }), _jsxs("div", { className: "labor-file-status-group", children: [_jsx("span", { className: `status-pill ${selectedLaborFile.status === "COMPLETE" ? "status-live" : "status-warning"}`, children: selectedLaborFile.status === "COMPLETE" ? "Completo" : "Incompleto" }), _jsx("span", { className: `status-pill ${getEmploymentStatusClass(selectedLaborFile)}`, children: getEmploymentStatusLabel(selectedLaborFile) })] })] }), _jsxs("div", { className: "labor-file-profile-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Nombre" }), _jsx("strong", { children: selectedLaborFile.employeeName })] }), _jsxs("div", { children: [_jsx("span", { children: "Usuario" }), _jsx("strong", { children: selectedLaborFile.employeeUsername })] }), _jsxs("div", { children: [_jsx("span", { children: "Nombre corto" }), _jsx("strong", { children: selectedLaborFile.employeeShortName ?? "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Fecha de ingreso" }), _jsx("strong", { children: formatDate(selectedLaborFile.hireDate) })] }), _jsxs("div", { className: `labor-file-profile-salary-card is-${dailySalaryValidation?.status ?? "mismatch"}`, children: [_jsxs("span", { className: "labor-file-profile-card-head", children: [_jsx("span", { children: "Salario diario" }), _jsx("span", { className: "labor-file-ri-badge", children: _jsx(RusconiIntelligenceBadge, { connectionId: LABOR_DAILY_SALARY_RI_CONNECTION_ID, label: "Expedientes laborales / Salario diario" }) })] }), _jsxs("strong", { className: "labor-file-salary-value", children: [formatMoney(displayedDailySalaryMxn), _jsx("span", { "aria-label": dailySalaryValidation?.label ?? "No coincide", className: `labor-file-ri-validation-icon is-${dailySalaryValidation?.status ?? "mismatch"}`, role: "img", title: dailySalaryValidation?.detail })] }), _jsx("small", { className: `labor-file-ri-validation-copy is-${dailySalaryValidation?.status ?? "mismatch"}`, children: dailySalaryValidation?.detail })] }), _jsxs("div", { children: [_jsx("span", { children: "\u00DAltima actualizaci\u00F3n" }), _jsx("strong", { children: formatDateTime(selectedLaborFile.updatedAt) })] }), _jsxs("div", { children: [_jsx("span", { children: "Tel\u00E9fono personal" }), _jsx("strong", { children: selectedLaborFile.personalPhone ?? "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Correo personal" }), _jsx("strong", { children: selectedLaborFile.personalEmail ?? "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Contacto de emergencia" }), _jsx("strong", { children: selectedLaborFile.emergencyContactName ?? "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Tel\u00E9fono de emergencia" }), _jsx("strong", { children: selectedLaborFile.emergencyContactPhone ?? "-" })] }), _jsxs("div", { className: "labor-file-profile-wide-card", children: [_jsx("span", { children: "Direcci\u00F3n del contacto de emergencia" }), _jsx("strong", { children: selectedLaborFile.emergencyContactAddress ?? "-" })] })] }), canWrite ? (_jsxs("form", { className: "labor-file-profile-form", onSubmit: handleProfileSave, children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de ingreso" }), _jsx("input", { type: "date", value: profileForm.hireDate, onChange: (event) => setProfileForm((current) => ({ ...current, hireDate: event.target.value })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Salario diario" }), _jsxs("div", { className: "money-input-control", children: [_jsx("span", { className: "money-input-prefix", children: "$" }), _jsx("input", { min: "0", step: "0.01", type: "number", value: profileForm.dailySalaryMxn, onChange: (event) => setProfileForm((current) => ({ ...current, dailySalaryMxn: event.target.value })) })] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Tel\u00E9fono personal" }), _jsx("input", { autoComplete: "tel", value: profileForm.personalPhone, onChange: (event) => setProfileForm((current) => ({ ...current, personalPhone: event.target.value })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Correo electr\u00F3nico personal" }), _jsx("input", { autoComplete: "email", type: "email", value: profileForm.personalEmail, onChange: (event) => setProfileForm((current) => ({ ...current, personalEmail: event.target.value })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Persona de contacto para emergencias" }), _jsx("input", { value: profileForm.emergencyContactName, onChange: (event) => setProfileForm((current) => ({ ...current, emergencyContactName: event.target.value })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "N\u00FAmero de contacto de emergencia" }), _jsx("input", { autoComplete: "tel", value: profileForm.emergencyContactPhone, onChange: (event) => setProfileForm((current) => ({ ...current, emergencyContactPhone: event.target.value })) })] }), _jsxs("label", { className: "form-field labor-file-profile-wide-field", children: [_jsx("span", { children: "Direcci\u00F3n del contacto de emergencia" }), _jsx("textarea", { value: profileForm.emergencyContactAddress, onChange: (event) => setProfileForm((current) => ({ ...current, emergencyContactAddress: event.target.value })) })] }), _jsxs("label", { className: "form-field labor-file-notes-field", children: [_jsx("span", { children: "Notas" }), _jsx("textarea", { value: profileForm.notes, onChange: (event) => setProfileForm((current) => ({ ...current, notes: event.target.value })) })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", disabled: saving, type: "submit", children: "Guardar expediente" }), _jsx("button", { className: "secondary-button", disabled: saving || loading, onClick: () => void loadLaborFiles(selectedLaborFile.id), type: "button", children: "Refrescar" }), canDeleteSelectedLaborFile ? (_jsx("button", { className: "danger-button", disabled: saving, onClick: () => void handleLaborFileDelete(), type: "button", children: "Eliminar expediente archivado" })) : null] })] })) : null] }), _jsxs("section", { className: "panel labor-file-upload-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Carga documental" }), _jsxs("span", { children: [selectedLaborFile.documents.length, " archivos"] })] }), canWrite ? (_jsxs("form", { className: "labor-file-upload-form", onSubmit: handleUpload, children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Tipo de documento" }), _jsx("select", { value: uploadType, onChange: (event) => setUploadType(event.target.value), children: LABOR_FILE_DOCUMENT_DEFINITIONS.map((definition) => (_jsx("option", { value: definition.type, children: definition.label }, definition.type))) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Archivo" }), _jsx("input", { accept: getUploadAccept(uploadType), disabled: selectedUploadLimitReached, onChange: handleFileChange, type: "file" })] }), _jsx("button", { className: "primary-button", disabled: saving || selectedUploadLimitReached, type: "submit", children: "Cargar" }), selectedUploadDefinition?.maxFiles ? (_jsxs("small", { className: "labor-file-upload-limit", children: [selectedUploadCount, " de ", selectedUploadDefinition.maxFiles, " cargados", selectedUploadLimitReached ? " / límite alcanzado" : ""] })) : null] })) : null, _jsxs("div", { className: "labor-file-contract-block", children: [_jsxs("div", { className: "labor-file-section-title", children: [_jsx("h3", { children: "Contrato laboral" }), _jsx("span", { children: contractDocument ? "Cargado" : "Pendiente" })] }), _jsx(DocumentRow, { canWrite: canWrite, document: contractDocument, documentActionId: documentActionId, label: "Contrato laboral", required: true, onDelete: handleDocumentDelete, onDownload: handleDocumentDownload }), _jsxs("div", { className: "labor-file-section-title", children: [_jsx("h3", { children: "Addenda" }), _jsx("span", { children: addenda.length })] }), addenda.length === 0 ? (_jsx("div", { className: "labor-file-document-row is-empty", children: _jsx("span", { children: "Sin addenda cargada" }) })) : addenda.map((document) => (_jsx(DocumentRow, { canWrite: canWrite, document: document, documentActionId: documentActionId, label: "Addendum", onDelete: handleDocumentDelete, onDownload: handleDocumentDownload }, document.id)))] }), _jsxs("div", { className: "labor-file-documents-table", children: [_jsxs("div", { className: "labor-file-section-title", children: [_jsx("h3", { children: "Documentos personales" }), _jsx("span", { children: "Obligatorios y opcionales" })] }), documentDefinitions.map((definition) => (definition.multiple ? (_jsx(MultipleDocumentRow, { canWrite: canWrite, documentActionId: documentActionId, documents: getDocumentsByType(selectedLaborFile.documents, definition.type), label: definition.label, maxFiles: definition.maxFiles, required: isDocumentRequired(definition.type, selectedLaborFile), onDelete: handleDocumentDelete, onDownload: handleDocumentDownload }, definition.type)) : (_jsx(DocumentRow, { canWrite: canWrite, document: getLatestDocument(selectedLaborFile.documents, definition.type), documentActionId: documentActionId, label: definition.label, required: isDocumentRequired(definition.type, selectedLaborFile), onDelete: handleDocumentDelete, onDownload: handleDocumentDownload }, definition.type))))] })] }), _jsxs("section", { className: "panel labor-file-contract-generator-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Generaci\u00F3n de contrato laboral" }), _jsx("span", { children: "Word editable basado en el contrato de trabajo vigente y resguardo autom\u00E1tico en expediente." })] }), _jsx("span", { className: `status-pill ${contractDocument ? "status-live" : "status-warning"}`, children: contractDocument ? "Contrato guardado" : "Pendiente" })] }), canWrite ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "labor-file-contract-generator-summary", children: [_jsxs("div", { children: [_jsx("strong", { children: contractDocument?.originalFileName ?? "Sin contrato generado" }), _jsx("span", { children: contractDocument
                                                                            ? `${formatFileSize(contractDocument.fileSizeBytes)} / ${formatDateTime(contractDocument.uploadedAt)}`
                                                                            : "El formulario puede prellenarse con IA a partir de los documentos cargados." })] }), _jsx("div", { className: "labor-file-contract-generator-actions", children: _jsx("button", { className: "primary-button", disabled: generatingContract, onClick: handleContractFormToggle, type: "button", children: contractFormOpen ? "Cerrar formulario" : prefillingContract ? "Leyendo documentos..." : "Abrir formulario" }) })] }), contractFormOpen ? (_jsxs("form", { className: "labor-file-contract-form", onSubmit: handleContractGenerate, children: [_jsxs("div", { className: "labor-file-contract-form-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Informaci\u00F3n del trabajador" }), _jsx("span", { children: "Los campos prellenados pueden editarse antes de generar el documento." })] }), _jsx("button", { className: "secondary-button", disabled: prefillingContract || generatingContract, onClick: () => void handleContractPrefill(), type: "button", children: prefillingContract ? "Prellenando..." : "Prellenar con IA" })] }), _jsxs("div", { className: "labor-file-contract-field-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nombre completo" }), _jsx("input", { required: true, value: contractForm.employeeName, onChange: (event) => updateContractFormField("employeeName", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Puesto o labor" }), _jsx("input", { required: true, value: contractForm.position, onChange: (event) => updateContractFormField("position", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "RFC" }), _jsx("input", { value: contractForm.rfc, onChange: (event) => updateContractFormField("rfc", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "CURP" }), _jsx("input", { value: contractForm.curp, onChange: (event) => updateContractFormField("curp", event.target.value) })] }), _jsxs("label", { className: "form-field labor-file-contract-wide-field", children: [_jsx("span", { children: "Domicilio" }), _jsx("textarea", { value: contractForm.employeeAddress, onChange: (event) => updateContractFormField("employeeAddress", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Tel\u00E9fono" }), _jsx("input", { value: contractForm.employeePhone, onChange: (event) => updateContractFormField("employeePhone", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de ingreso/contrato" }), _jsx("input", { type: "date", value: contractForm.originalContractDate, onChange: (event) => updateContractFormField("originalContractDate", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Hora de entrada" }), _jsx("input", { type: "time", value: contractForm.workdayStart, onChange: (event) => updateContractFormField("workdayStart", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Hora de salida" }), _jsx("input", { type: "time", value: contractForm.workdayEnd, onChange: (event) => updateContractFormField("workdayEnd", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Salario mensual bruto" }), _jsx("input", { placeholder: "$0.00", value: contractForm.monthlyGrossSalary, onChange: (event) => updateContractFormField("monthlyGrossSalary", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Salario mensual en letra" }), _jsx("input", { value: contractForm.monthlyGrossSalaryText, onChange: (event) => updateContractFormField("monthlyGrossSalaryText", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Bono de asistencia" }), _jsx("input", { placeholder: "10% del salario si se deja vac\u00EDo", value: contractForm.attendanceBonus, onChange: (event) => updateContractFormField("attendanceBonus", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Bono de asistencia en letra" }), _jsx("input", { value: contractForm.attendanceBonusText, onChange: (event) => updateContractFormField("attendanceBonusText", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Bono de puntualidad" }), _jsx("input", { placeholder: "10% del salario si se deja vac\u00EDo", value: contractForm.punctualityBonus, onChange: (event) => updateContractFormField("punctualityBonus", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Bono de puntualidad en letra" }), _jsx("input", { value: contractForm.punctualityBonusText, onChange: (event) => updateContractFormField("punctualityBonusText", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de firma" }), _jsx("input", { type: "date", value: contractForm.signingDate, onChange: (event) => updateContractFormField("signingDate", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Ciudad de firma" }), _jsx("input", { value: contractForm.signingCity, onChange: (event) => updateContractFormField("signingCity", event.target.value) })] })] }), contractPrefillSources.length > 0 || contractPrefillNotes.length > 0 ? (_jsxs("div", { className: "labor-file-contract-prefill-panel", children: [contractPrefillSources.length > 0 ? (_jsxs("div", { children: [_jsx("strong", { children: "Campos con soporte documental" }), _jsx("span", { children: contractPrefillSources.map((source) => `${CONTRACT_FIELD_LABELS[source.field]}${source.originalFileName ? ` (${source.originalFileName})` : ""}`).join(", ") })] })) : null, contractPrefillNotes.length > 0 ? (_jsxs("div", { children: [_jsx("strong", { children: "Notas IA" }), _jsx("span", { children: contractPrefillNotes.join(" ") })] })) : null] })) : null, _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", disabled: generatingContract || prefillingContract, type: "submit", children: generatingContract ? "Generando..." : "Generar y guardar .docx" }), contractDocument ? (_jsx("button", { className: "secondary-button", disabled: documentActionId === contractDocument.id, onClick: () => void handleDocumentDownload(contractDocument, "download"), type: "button", children: "Descargar Word" })) : null, _jsx("button", { className: "secondary-button", disabled: generatingContract || prefillingContract, onClick: () => setContractFormOpen(false), type: "button", children: "Cerrar formulario" })] })] })) : null] })) : (_jsx("div", { className: "centered-inline-message", children: "Solo usuarios con permisos de escritura pueden generar contratos laborales." }))] }), _jsxs("section", { className: "panel labor-file-vacation-format-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Generaci\u00F3n de formato de vacaciones" }), _jsx("span", { children: "Word editable con los d\u00EDas solicitados y resguardo autom\u00E1tico en el movimiento de vacaciones." })] }), _jsx("span", { className: `status-pill ${latestVacationFormatEvent ? "status-live" : "status-warning"}`, children: latestVacationFormatEvent ? "Formato guardado" : "Pendiente" })] }), canWrite ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "labor-file-vacation-format-summary", children: [_jsxs("div", { children: [_jsx("strong", { children: latestVacationFormatEvent?.acceptanceOriginalFileName ?? "Sin formato generado" }), _jsx("span", { children: latestVacationFormatEvent
                                                                            ? `${latestVacationFormatEvent.days} días / ${formatVacationEventDates(latestVacationFormatEvent)}`
                                                                            : "Abre el formulario, selecciona los días y genera el Word del formato de vacaciones." })] }), _jsx("div", { className: "labor-file-vacation-format-actions", children: _jsx("button", { className: "primary-button", disabled: generatingVacationFormat, onClick: handleVacationFormatFormToggle, type: "button", children: vacationFormatFormOpen ? "Cerrar formulario" : "Abrir formulario" }) })] }), _jsxs("div", { className: "labor-file-vacation-conflict-rule", children: [_jsxs("div", { children: [_jsx("strong", { children: "Regla de equipo" }), _jsx("span", { children: "No se puede generar ni autorizar un formato si otra persona del mismo equipo pidi\u00F3 vacaciones en las mismas fechas." })] }), _jsxs("label", { className: "checkbox-row", children: [_jsx("input", { checked: canOverrideVacationConflicts && Boolean(vacationFormatForm.overrideTeamVacationConflict), disabled: !canOverrideVacationConflicts || generatingVacationFormat, type: "checkbox", onChange: (event) => updateVacationFormatFormField("overrideTeamVacationConflict", event.target.checked) }), _jsx("span", { children: "Override Eduardo Rusconi" })] }), _jsx("small", { children: canOverrideVacationConflicts
                                                                    ? "Este override permite continuar aun cuando existan cruces de fechas en el equipo."
                                                                    : "Solo Eduardo Rusconi puede marcar este override." })] }), vacationFormatFormOpen ? (_jsxs("form", { className: "labor-file-vacation-format-form", onSubmit: handleVacationFormatGenerate, children: [_jsxs("div", { className: "labor-file-vacation-format-form-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Datos del formato" }), _jsx("span", { children: "Formulario editable para generar el Word en hoja membretada y guardarlo en el expediente." })] }), _jsx("button", { className: "ghost-button", disabled: generatingVacationFormat, onClick: handleVacationFormatFormReset, type: "button", children: "Restaurar datos" })] }), _jsxs("div", { className: "labor-file-vacation-format-stats", children: [_jsxs("div", { children: [_jsx("span", { children: "D\u00EDas solicitados" }), _jsx("strong", { children: vacationFormatSelectedDays })] }), _jsxs("div", { children: [_jsx("span", { children: "Quedar\u00EDan pendientes" }), _jsx("strong", { children: vacationFormatProjectedPending })] }), _jsxs("div", { children: [_jsx("span", { children: "Programados y autorizados" }), _jsx("strong", { children: vacationFormatProjectedCommitted })] })] }), _jsxs("div", { className: "labor-file-vacation-format-section", children: [_jsxs("div", { className: "labor-file-vacation-format-section-title", children: [_jsx("h4", { children: "Selecci\u00F3n de d\u00EDas" }), _jsxs("span", { children: [vacationFormatSelectedDays, " d\u00EDas en el formato"] })] }), _jsxs("div", { className: "labor-file-vacation-date-tools", children: [_jsxs("div", { className: "labor-file-vacation-date-group is-range", children: [_jsx("h3", { children: "D\u00EDas continuos" }), _jsxs("div", { className: "labor-file-vacation-date-row", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Inicio" }), _jsx("input", { type: "date", value: vacationFormatRange.startDate, onChange: (event) => setVacationFormatRange((current) => ({ ...current, startDate: event.target.value })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fin" }), _jsx("input", { type: "date", value: vacationFormatRange.endDate, onChange: (event) => setVacationFormatRange((current) => ({ ...current, endDate: event.target.value })) })] }), _jsx("button", { className: "secondary-button", onClick: handleVacationFormatRangeAdd, type: "button", children: "Agregar rango" })] })] }), _jsxs("div", { className: "labor-file-vacation-date-group is-single", children: [_jsx("h3", { children: "D\u00EDa suelto" }), _jsxs("div", { className: "labor-file-vacation-date-row", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha" }), _jsx("input", { type: "date", value: vacationFormatSingleDate, onChange: (event) => setVacationFormatSingleDate(event.target.value) })] }), _jsx("button", { className: "secondary-button", onClick: handleVacationFormatSingleDateAdd, type: "button", children: "Agregar d\u00EDa" })] })] })] }), _jsx("div", { className: "labor-file-vacation-selected-days", children: vacationFormatForm.vacationDates.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Agrega d\u00EDas continuos o salteados." })) : (_jsx("div", { className: "labor-file-vacation-day-chips", children: vacationFormatForm.vacationDates.map((date) => (_jsxs("button", { onClick: () => handleVacationFormatDateRemove(date), type: "button", children: [formatDate(date), " ", _jsx("span", { children: "Quitar" })] }, date))) })) })] }), _jsxs("div", { className: "labor-file-vacation-format-section", children: [_jsxs("div", { className: "labor-file-vacation-format-section-title", children: [_jsx("h4", { children: "Informaci\u00F3n del documento" }), _jsx("span", { children: "Todos los campos pueden editarse antes de generar" })] }), _jsxs("div", { className: "labor-file-vacation-format-field-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nombre" }), _jsx("input", { required: true, value: vacationFormatForm.employeeName, onChange: (event) => updateVacationFormatFormField("employeeName", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha del formato" }), _jsx("input", { required: true, type: "date", value: vacationFormatForm.requestDate, onChange: (event) => updateVacationFormatFormField("requestDate", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "El interesado" }), _jsx("input", { value: vacationFormatForm.interestedName, onChange: (event) => updateVacationFormatFormField("interestedName", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Autoriza" }), _jsx("input", { value: vacationFormatForm.authorizerName, onChange: (event) => updateVacationFormatFormField("authorizerName", event.target.value) })] }), _jsxs("div", { className: "labor-file-vacation-format-accounting", children: [_jsxs("div", { children: [_jsx("span", { children: "Fecha de ingreso" }), _jsx("strong", { children: formatDate(vacationFormatAccounting.hireDate) })] }), _jsxs("div", { children: [_jsx("span", { children: "Fecha de inicio" }), _jsx("strong", { children: formatDate(vacationFormatAccounting.vacationYearStartDate) })] }), _jsxs("div", { children: [_jsx("span", { children: "A\u00F1os cumplidos" }), _jsx("strong", { children: vacationFormatAccounting.completedYearsLabel || "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "D\u00EDas que corresponden" }), _jsx("strong", { children: vacationFormatAccounting.entitlementDays })] }), _jsxs("div", { children: [_jsx("span", { children: "D\u00EDas pendientes" }), _jsx("strong", { children: vacationFormatAccounting.pendingDays })] }), _jsxs("div", { children: [_jsx("span", { children: "D\u00EDas disfrutados" }), _jsx("strong", { children: vacationFormatAccounting.enjoyedDays })] })] }), _jsxs("label", { className: "form-field labor-file-vacation-format-wide-field", children: [_jsx("span", { children: "Descripci\u00F3n" }), _jsx("input", { value: vacationFormatForm.description, onChange: (event) => updateVacationFormatFormField("description", event.target.value) })] })] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", disabled: generatingVacationFormat, type: "submit", children: generatingVacationFormat ? "Generando..." : "Generar, guardar y contabilizar" }), latestVacationFormatEvent ? (_jsx("button", { className: "secondary-button", disabled: vacationFileActionId === latestVacationFormatEvent.id, onClick: () => void handleVacationAcceptanceDownload(latestVacationFormatEvent, "download"), type: "button", children: isVacationEventAuthorized(latestVacationFormatEvent) ? "Descargar PDF firmado" : "Descargar formato" })) : null, _jsx("button", { className: "secondary-button", disabled: generatingVacationFormat, onClick: () => setVacationFormatFormOpen(false), type: "button", children: "Cerrar formulario" })] })] })) : null] })) : (_jsx("div", { className: "centered-inline-message", children: "Solo usuarios con permisos de escritura pueden generar formatos de vacaciones." }))] }), _jsxs("section", { className: "panel labor-file-vacations-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("h2", { children: "Contabilizaci\u00F3n de vacaciones" }), _jsxs("span", { children: [selectedLaborFile.vacationSummary.remainingDays, " d\u00EDas disponibles"] })] }) }), _jsx("div", { className: "labor-file-vacation-summary", children: selectedLaborFile.vacationSummary.lines.map((line) => {
                                                    const item = parseVacationSummaryLine(line);
                                                    return item.kind === "heading" ? (_jsx("div", { className: "labor-file-vacation-summary-heading", children: item.label }, line)) : (_jsxs("div", { className: "labor-file-vacation-summary-row", children: [_jsx("span", { children: item.label }), _jsx("strong", { children: item.value })] }, line));
                                                }) }), _jsxs("div", { className: "labor-file-vacation-accounting-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "D\u00EDas ya devengados" }), _jsx("strong", { children: selectedLaborFile.vacationSummary.earnedDays })] }), _jsxs("div", { children: [_jsx("span", { children: "D\u00EDas no devengados" }), _jsx("strong", { children: selectedLaborFile.vacationSummary.unearnedDays })] }), _jsxs("div", { children: [_jsx("span", { children: "Programados sin PDF firmado" }), _jsx("strong", { children: selectedLaborFile.vacationSummary.scheduledDays })] }), _jsxs("div", { children: [_jsx("span", { children: "Autorizados con PDF firmado" }), _jsx("strong", { children: selectedLaborFile.vacationSummary.authorizedDays })] })] }), _jsxs("form", { className: "labor-file-previous-year-pending", onSubmit: (event) => void handlePreviousYearPendingSubmit(event, "LAST_YEAR"), children: [_jsxs("div", { className: "labor-file-previous-year-pending-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Pendientes del \u00FAltimo a\u00F1o" }), _jsxs("span", { children: ["Saldo del \u00FAltimo a\u00F1o: ", formatLongDate(selectedLaborFile.vacationSummary.previousYearStartDate), " al ", formatLongDate(selectedLaborFile.vacationSummary.previousYearEndDate), "."] })] }), _jsxs("strong", { children: [selectedLaborFile.vacationSummary.previousYearPendingDays, " d\u00EDas"] })] }), _jsxs("label", { className: `labor-file-manual-checkbox ${!canManagePreviousYearPending ? "is-disabled" : ""}`, children: [_jsx("input", { checked: previousYearPendingForm.manualOverrideConfirmed, disabled: !canManagePreviousYearPending || savingPreviousYearPending, type: "checkbox", onChange: (event) => setPreviousYearPendingForm((current) => ({
                                                                    ...current,
                                                                    manualOverrideConfirmed: event.target.checked
                                                                })) }), _jsxs("span", { children: ["Agregar o actualizar manualmente d\u00EDas pendientes del \u00FAltimo a\u00F1o (", formatLongDate(selectedLaborFile.vacationSummary.previousYearStartDate), " al ", formatLongDate(selectedLaborFile.vacationSummary.previousYearEndDate), ")"] })] }), _jsxs("div", { className: "labor-file-previous-year-pending-fields", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "D\u00EDas pendientes" }), _jsx("input", { disabled: !canManagePreviousYearPending || !previousYearPendingForm.manualOverrideConfirmed || savingPreviousYearPending, min: "0", step: "0.5", type: "number", value: previousYearPendingForm.days, onChange: (event) => setPreviousYearPendingForm((current) => ({
                                                                            ...current,
                                                                            days: Number(event.target.value)
                                                                        })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nota" }), _jsx("input", { disabled: !canManagePreviousYearPending || !previousYearPendingForm.manualOverrideConfirmed || savingPreviousYearPending, placeholder: "Motivo o referencia del ajuste", value: previousYearPendingForm.description, onChange: (event) => setPreviousYearPendingForm((current) => ({
                                                                            ...current,
                                                                            description: event.target.value
                                                                        })) })] }), _jsx("button", { className: "secondary-button", disabled: !canManagePreviousYearPending || !previousYearPendingForm.manualOverrideConfirmed || savingPreviousYearPending, type: "submit", children: savingPreviousYearPending ? "Guardando..." : "Guardar saldo" })] }), _jsxs("small", { children: [canManagePreviousYearPending
                                                                ? "Marcar el checkbox habilita el ajuste manual y reemplaza el saldo pendiente del último año de este expediente."
                                                                : "Solo el superadmin Eduardo Rusconi puede marcar este checkbox y guardar el ajuste.", selectedLaborFile.vacationSummary.ignoredPreviousYearPendingDays > 0
                                                                ? ` No se contabilizan ${selectedLaborFile.vacationSummary.ignoredPreviousYearPendingDays} días de años más antiguos.`
                                                                : ""] })] }), _jsxs("form", { className: "labor-file-previous-year-pending", onSubmit: (event) => void handlePreviousYearPendingSubmit(event, "YEAR_BEFORE_LAST"), children: [_jsxs("div", { className: "labor-file-previous-year-pending-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Pendientes del a\u00F1o inmediato anterior al \u00FAltimo a\u00F1o" }), _jsxs("span", { children: ["Saldo del a\u00F1o inmediato anterior al \u00FAltimo a\u00F1o: ", formatLongDate(selectedLaborFile.vacationSummary.yearBeforeLastStartDate), " al ", formatLongDate(selectedLaborFile.vacationSummary.yearBeforeLastEndDate), "."] })] }), _jsxs("strong", { children: [selectedLaborFile.vacationSummary.yearBeforeLastPendingDays, " d\u00EDas"] })] }), _jsxs("label", { className: `labor-file-manual-checkbox ${!canManagePreviousYearPending ? "is-disabled" : ""}`, children: [_jsx("input", { checked: yearBeforeLastPendingForm.manualOverrideConfirmed, disabled: !canManagePreviousYearPending || savingPreviousYearPending, type: "checkbox", onChange: (event) => setYearBeforeLastPendingForm((current) => ({
                                                                    ...current,
                                                                    manualOverrideConfirmed: event.target.checked
                                                                })) }), _jsxs("span", { children: ["Agregar o actualizar manualmente d\u00EDas pendientes del a\u00F1o inmediato anterior al \u00FAltimo a\u00F1o (", formatLongDate(selectedLaborFile.vacationSummary.yearBeforeLastStartDate), " al ", formatLongDate(selectedLaborFile.vacationSummary.yearBeforeLastEndDate), ")"] })] }), _jsxs("div", { className: "labor-file-previous-year-pending-fields", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "D\u00EDas pendientes" }), _jsx("input", { disabled: !canManagePreviousYearPending || !yearBeforeLastPendingForm.manualOverrideConfirmed || savingPreviousYearPending, min: "0", step: "0.5", type: "number", value: yearBeforeLastPendingForm.days, onChange: (event) => setYearBeforeLastPendingForm((current) => ({
                                                                            ...current,
                                                                            days: Number(event.target.value)
                                                                        })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nota" }), _jsx("input", { disabled: !canManagePreviousYearPending || !yearBeforeLastPendingForm.manualOverrideConfirmed || savingPreviousYearPending, placeholder: "Motivo o referencia del ajuste", value: yearBeforeLastPendingForm.description, onChange: (event) => setYearBeforeLastPendingForm((current) => ({
                                                                            ...current,
                                                                            description: event.target.value
                                                                        })) })] }), _jsx("button", { className: "secondary-button", disabled: !canManagePreviousYearPending || !yearBeforeLastPendingForm.manualOverrideConfirmed || savingPreviousYearPending, type: "submit", children: savingPreviousYearPending ? "Guardando..." : "Guardar saldo" })] }), _jsx("small", { children: canManagePreviousYearPending
                                                            ? "Marcar el checkbox habilita el ajuste manual y reemplaza el saldo pendiente del año inmediato anterior al último año de este expediente."
                                                            : "Solo el superadmin Eduardo Rusconi puede marcar este checkbox y guardar el ajuste." })] }), _jsx("div", { className: "labor-file-vacation-events", children: selectedLaborFile.vacationEvents.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Sin vacaciones registradas." })) : selectedLaborFile.vacationEvents.map((event) => {
                                                    const isAuthorized = isVacationEventAuthorized(event);
                                                    const isVacationRequest = event.eventType === "VACATION" || event.eventType === "GLOBAL_VACATION";
                                                    const canDeleteVacationEvent = canDeleteVacationEventForCurrentUser(event);
                                                    return (_jsxs("div", { className: `labor-file-vacation-event ${isAuthorized ? "is-authorized" : "is-scheduled"}`, children: [_jsxs("div", { children: [_jsxs("div", { className: "labor-file-vacation-event-title", children: [_jsx("strong", { children: getVacationEventTitle(event) }), isVacationRequest ? (_jsx("span", { className: `status-pill ${isAuthorized ? "status-live" : "status-warning"}`, children: isAuthorized ? "Autorizado" : "Programado" })) : null] }), _jsxs("span", { children: [event.days, " d\u00EDas", formatVacationEventDates(event) ? ` / ${formatVacationEventDates(event)}` : ""] }), event.acceptanceOriginalFileName ? _jsxs("small", { children: ["Formato: ", event.acceptanceOriginalFileName] }) : null, isVacationRequest && !isAuthorized ? _jsx("small", { children: "Pendiente de PDF firmado para autorizar." }) : null] }), event.description ? _jsx("small", { children: event.description }) : null, _jsxs("div", { className: "table-actions", children: [event.acceptanceOriginalFileName ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "ghost-button", disabled: vacationFileActionId === event.id, onClick: () => void handleVacationAcceptanceDownload(event, "open"), type: "button", children: "Abrir formato" }), _jsx("button", { className: "ghost-button", disabled: vacationFileActionId === event.id, onClick: () => void handleVacationAcceptanceDownload(event, "download"), type: "button", children: "Descargar" })] })) : null, canWrite && isVacationRequest && !isAuthorized ? (_jsxs("label", { className: `ghost-button labor-file-signed-upload ${signingVacationEventId === event.id ? "is-disabled" : ""}`, children: [_jsx("span", { children: signingVacationEventId === event.id ? "Cargando..." : "Cargar PDF firmado" }), _jsx("input", { accept: ".pdf,application/pdf", disabled: signingVacationEventId === event.id, type: "file", onChange: (inputEvent) => {
                                                                                    const file = inputEvent.currentTarget.files?.[0];
                                                                                    if (file) {
                                                                                        void handleVacationSignedPdfUpload(event, file);
                                                                                    }
                                                                                    inputEvent.currentTarget.value = "";
                                                                                } })] })) : null, canDeleteVacationEvent ? (_jsx("button", { className: "danger-button", disabled: deletingVacationId === event.id, onClick: () => void handleVacationDelete(event.id), type: "button", children: "Quitar" })) : null] })] }, event.id));
                                                }) })] })] })) : null] })] })] }));
}
function DocumentRow({ label, required, document, canWrite, documentActionId, onDownload, onDelete }) {
    return (_jsxs("div", { className: `labor-file-document-row ${document ? "is-loaded" : "is-missing"}`, children: [_jsxs("div", { children: [_jsx("strong", { children: label }), _jsx("span", { children: required ? "Obligatorio" : "Opcional" })] }), _jsxs("div", { children: [_jsx("strong", { children: document?.originalFileName ?? "Pendiente" }), _jsx("span", { children: document ? `${formatFileSize(document.fileSizeBytes)} / ${formatDateTime(document.uploadedAt)}` : "-" })] }), _jsx("div", { className: "table-actions", children: document ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "secondary-button", disabled: documentActionId === document.id, onClick: () => void onDownload(document, "open"), type: "button", children: "Abrir" }), _jsx("button", { className: "secondary-button", disabled: documentActionId === document.id, onClick: () => void onDownload(document, "download"), type: "button", children: "Descargar" }), canWrite ? (_jsx("button", { className: "danger-button", disabled: documentActionId === document.id, onClick: () => void onDelete(document), type: "button", children: "Borrar" })) : null] })) : (_jsx("span", { className: "status-pill status-warning", children: "Falta" })) })] }));
}
function MultipleDocumentRow({ label, required, documents, maxFiles, canWrite, documentActionId, onDownload, onDelete }) {
    const limitText = maxFiles ? `${documents.length}/${maxFiles}` : `${documents.length}`;
    const remainingText = maxFiles
        ? documents.length >= maxFiles
            ? "Límite alcanzado"
            : `${maxFiles - documents.length} espacios disponibles`
        : "Múltiples archivos permitidos";
    return (_jsxs("div", { className: `labor-file-document-row labor-file-document-row-multiple ${documents.length > 0 ? "is-loaded" : "is-missing"}`, children: [_jsxs("div", { children: [_jsx("strong", { children: label }), _jsx("span", { children: required ? "Obligatorio" : "Opcional" })] }), _jsxs("div", { className: "labor-file-multiple-document-summary", children: [_jsx("strong", { children: documents.length > 0 ? `${documents.length} archivos cargados` : "Pendiente" }), _jsx("span", { children: remainingText }), documents.length === 0 ? (_jsx("small", { children: "Sin formatos cargados." })) : (_jsx("div", { className: "labor-file-multiple-document-list", children: documents.map((document, index) => (_jsxs("div", { className: "labor-file-multiple-document-item", children: [_jsxs("div", { children: [_jsxs("strong", { children: [index + 1, ". ", document.originalFileName] }), _jsxs("span", { children: [formatFileSize(document.fileSizeBytes), " / ", formatDateTime(document.uploadedAt)] })] }), _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "ghost-button", disabled: documentActionId === document.id, onClick: () => void onDownload(document, "open"), type: "button", children: "Abrir" }), _jsx("button", { className: "ghost-button", disabled: documentActionId === document.id, onClick: () => void onDownload(document, "download"), type: "button", children: "Descargar" }), canWrite ? (_jsx("button", { className: "danger-button", disabled: documentActionId === document.id, onClick: () => void onDelete(document), type: "button", children: "Borrar" })) : null] })] }, document.id))) }))] }), _jsx("div", { className: "table-actions", children: _jsx("span", { className: `status-pill ${documents.length > 0 ? "status-live" : "status-warning"}`, children: limitText }) })] }));
}
