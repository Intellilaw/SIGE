import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import {
  LABOR_FILE_DOCUMENT_DEFINITIONS,
  type LaborContractFieldValues,
  type LaborContractPrefillResult,
  type LaborFile,
  type LaborFileDocument,
  type LaborFileDocumentType,
  type LaborGlobalVacationBatchResult,
  type LaborGlobalVacationDay,
  type LaborGlobalVacationDayInput,
  type LaborPreviousYearPendingVacationInput,
  type LaborVacationEvent,
  type LaborVacationFormatFieldValues
} from "@sige/contracts";

import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { SummaryCard } from "../../components/SummaryCard";
import { useAuth } from "../auth/AuthContext";
import { RusconiIntelligenceBadge } from "../rusconi-intelligence/RusconiIntelligenceBadge";

type FlashState =
  | {
      tone: "success" | "error";
      text: string;
    }
  | null;

type LaborFileProfileForm = {
  hireDate: string;
  dailySalaryMxn: string;
  personalPhone: string;
  personalEmail: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactAddress: string;
  notes: string;
};

type PreviousYearPendingVacationForm = Omit<LaborPreviousYearPendingVacationInput, "days"> & {
  days: string;
  description: string;
  manualOverrideConfirmed: boolean;
};

type PreviousYearPendingPeriod = "LAST_YEAR" | "YEAR_BEFORE_LAST";

type ContractSalaryReference = {
  kind: "salary";
  dailySalaryMxn: number;
  monthlyGrossSalaryMxn?: number;
  originalFileName?: string;
  documentType?: LaborFileDocumentType;
} | {
  kind: "unreadable-addendum";
  originalFileName?: string;
};

const EMPTY_PROFILE_FORM: LaborFileProfileForm = {
  hireDate: "",
  dailySalaryMxn: "",
  personalPhone: "",
  personalEmail: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactAddress: "",
  notes: ""
};

const EMPTY_GLOBAL_VACATION_FORM: LaborGlobalVacationDayInput = {
  date: "",
  vacationDates: [],
  days: 1,
  description: ""
};

const EMPTY_PREVIOUS_YEAR_PENDING_FORM: PreviousYearPendingVacationForm = {
  days: "0",
  description: "",
  manualOverrideConfirmed: false
};

const VACATION_FORMAT_AUTHORIZER = "Mayra Rubí Ordóñez Mendoza";

const EMPTY_VACATION_FORMAT_FORM: LaborVacationFormatFieldValues = {
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

const EMPTY_CONTRACT_FORM: LaborContractFieldValues = {
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

const CONTRACT_FIELD_LABELS: Record<keyof LaborContractFieldValues, string> = {
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

function hasPermission(permissions: string[] | undefined, permission: string) {
  return Boolean(permissions?.includes("*") || permissions?.includes(permission));
}

function toErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Ocurrió un error inesperado.";
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX");
}

function formatLongDate(value?: string) {
  if (!value) {
    return "-";
  }

  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("es-MX");
}

function parseVacationSummaryLine(line: string) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex < 0) {
    return {
      kind: "heading" as const,
      label: line.trim(),
      value: ""
    };
  }

  const label = line.slice(0, separatorIndex).trim();
  const value = line.slice(separatorIndex + 1).trim();

  return {
    kind: "row" as const,
    label,
    value: value || "-"
  };
}

function formatMoney(value?: number) {
  if (!value || !Number.isFinite(value)) {
    return "-";
  }

  return value.toLocaleString("es-MX", {
    currency: "MXN",
    minimumFractionDigits: 2,
    style: "currency"
  });
}

function parseMoneyValue(value: unknown) {
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

function formatFileSize(value?: number) {
  if (!value) {
    return "-";
  }

  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function openBlobFile(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function normalizeRoleText(value?: string) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function requiresProfessionalCredentials(specificRole?: string) {
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

function isDocumentRequired(documentType: LaborFileDocumentType, laborFile?: LaborFile) {
  const definition = LABOR_FILE_DOCUMENT_DEFINITIONS.find((entry) => entry.type === documentType);
  if (!definition) {
    return false;
  }

  return definition.requirement === "ALWAYS" ||
    (definition.requirement === "PROFESSIONAL_CREDENTIAL" && requiresProfessionalCredentials(laborFile?.specificRole));
}

function getLatestDocument(documents: LaborFileDocument[], documentType: LaborFileDocumentType) {
  return [...documents]
    .filter((document) => document.documentType === documentType)
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))[0];
}

function getRecordNumber(record: unknown, keys: string[]) {
  if (!record || typeof record !== "object") {
    return undefined;
  }

  const source = record as Record<string, unknown>;
  for (const key of keys) {
    const parsed = parseMoneyValue(source[key]);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function getContractDailySalary(laborFile: LaborFile, salaryDocuments: LaborFileDocument[]): ContractSalaryReference | undefined {
  const sortedDocuments = [...salaryDocuments]
    .filter((document) => document.documentType === "EMPLOYMENT_CONTRACT" || document.documentType === "ADDENDUM")
    .sort((left, right) =>
      right.uploadedAt.localeCompare(left.uploadedAt) ||
      (right.documentType === "ADDENDUM" ? 1 : 0) - (left.documentType === "ADDENDUM" ? 1 : 0)
    );
  let unreadableLatestAddendum: LaborFileDocument | undefined;

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

function formatContractSalaryReference(reference: ContractSalaryReference) {
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

function getDailySalaryValidation(laborFile: LaborFile, salaryDocuments: LaborFileDocument[]) {
  const hasContractDocument = salaryDocuments.some((document) => document.documentType === "EMPLOYMENT_CONTRACT");
  if (!hasContractDocument) {
    return {
      status: "mismatch" as const,
      label: "No coincide",
      detail: "Falta contrato laboral cargado."
    };
  }

  const profileDailySalary = Number(laborFile.dailySalaryMxn ?? 0);
  if (!profileDailySalary) {
    return {
      status: "mismatch" as const,
      label: "No coincide",
      detail: "Falta salario diario en el expediente."
    };
  }

  const contractSalaryReference = getContractDailySalary(laborFile, salaryDocuments);
  if (contractSalaryReference === undefined) {
    return {
      status: "mismatch" as const,
      label: "No coincide",
      detail: "Contrato/addenda cargados sin salario diario legible."
    };
  }

  const salaryReferenceDetail = formatContractSalaryReference(contractSalaryReference);
  if (contractSalaryReference.kind === "unreadable-addendum") {
    return {
      status: "mismatch" as const,
      label: "No coincide",
      detail: `RI-003 toma como referencia ${salaryReferenceDetail}`
    };
  }

  const matches = Math.abs(profileDailySalary - contractSalaryReference.dailySalaryMxn) <= 0.05;

  return matches
    ? {
        status: "match" as const,
        label: "Coincide",
        detail: `Coincide con ${salaryReferenceDetail}`
      }
    : {
        status: "mismatch" as const,
        label: "No coincide",
        detail: `RI-003 toma como referencia ${salaryReferenceDetail}`
      };
}

function getDocumentsByType(documents: LaborFileDocument[], documentType: LaborFileDocumentType) {
  return [...documents]
    .filter((document) => document.documentType === documentType)
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}

function getDocumentLabel(documentType: LaborFileDocumentType) {
  return LABOR_FILE_DOCUMENT_DEFINITIONS.find((definition) => definition.type === documentType)?.label ?? documentType;
}

function getUploadAccept(documentType: LaborFileDocumentType) {
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

function buildContractFormDefaults(laborFile?: LaborFile): LaborContractFieldValues {
  return {
    ...EMPTY_CONTRACT_FORM,
    employeeName: laborFile?.employeeName ?? "",
    position: laborFile?.specificRole ?? "",
    originalContractDate: laborFile?.hireDate.slice(0, 10) ?? "",
    signingDate: getTodayKey()
  };
}

function mergeEditableContractFields(current: LaborContractFieldValues, next: LaborContractFieldValues) {
  const merged = { ...current };

  for (const field of Object.keys(EMPTY_CONTRACT_FORM) as Array<keyof LaborContractFieldValues>) {
    const value = next[field]?.trim();
    if (value) {
      merged[field] = value;
    }
  }

  return merged;
}

function sortLaborFiles(items: LaborFile[]) {
  return [...items].sort((left, right) =>
    left.employeeName.localeCompare(right.employeeName, "es-MX", { numeric: true, sensitivity: "base" })
  );
}

function normalizeComparableText(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isEduardoRusconi(input: {
  username?: string;
  displayName?: string;
  email?: string;
}) {
  return (
    normalizeComparableText(input.username) === "eduardo rusconi" ||
    normalizeComparableText(input.displayName) === "eduardo rusconi" ||
    (input.email ?? "").toLowerCase().startsWith("eduardo.rusconi")
  );
}

function isMayraOrdonez(input: {
  username?: string;
  displayName?: string;
  email?: string;
}) {
  const username = normalizeComparableText(input.username);
  const displayName = normalizeComparableText(input.displayName);
  const email = normalizeComparableText(input.email);

  return (
    (username.includes("mayra") && username.includes("ordonez")) ||
    (displayName.includes("mayra") && displayName.includes("ordonez")) ||
    (email.includes("mayra") && email.includes("ordonez"))
  );
}

function isSuperadminEduardoRusconi(input: {
  username?: string;
  displayName?: string;
  email?: string;
  role?: string;
  legacyRole?: string;
  permissions?: string[];
}) {
  return isEduardoRusconi(input) && (
    normalizeComparableText(input.role) === "superadmin" ||
    normalizeComparableText(input.legacyRole) === "superadmin" ||
    Boolean(input.permissions?.includes("*"))
  );
}

function isSuperadminUser(input: {
  role?: string;
  legacyRole?: string;
  permissions?: string[];
}) {
  return (
    normalizeComparableText(input.role) === "superadmin" ||
    normalizeComparableText(input.legacyRole) === "superadmin" ||
    Boolean(input.permissions?.includes("*"))
  );
}

function addDaysKey(value: string, offset: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function enumerateDateKeys(startDate: string, endDate: string) {
  if (!startDate || !endDate || endDate < startDate) {
    return [];
  }

  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDaysKey(cursor, 1);
  }

  return dates;
}

function sortDateKeys(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function formatVacationEventDates(event: LaborVacationEvent) {
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

function formatVacationFormatDatesText(dates: string[]) {
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

function buildVacationFormatFormDefaults(laborFile?: LaborFile): LaborVacationFormatFieldValues {
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

function getVacationFormatAccounting(laborFile: LaborFile | undefined, selectedDays: number) {
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

function getVacationSummaryAvailableDays(laborFile: LaborFile) {
  return laborFile.vacationSummary.entitlementDays +
    laborFile.vacationSummary.previousYearPendingDays +
    laborFile.vacationSummary.yearBeforeLastPendingDays;
}

function getPreviousYearPendingPeriodDates(laborFile: LaborFile, pendingPeriod: PreviousYearPendingPeriod) {
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

function getCountedPreviousYearPendingEvent(laborFile: LaborFile | undefined, pendingPeriod: PreviousYearPendingPeriod) {
  if (!laborFile) {
    return undefined;
  }

  const periodDates = getPreviousYearPendingPeriodDates(laborFile, pendingPeriod);
  return laborFile.vacationEvents.find((event) =>
    event.eventType === "PREVIOUS_YEAR_PENDING" &&
    event.startDate === periodDates.startDate &&
    event.endDate === periodDates.endDate
  );
}

function buildPreviousYearPendingFormDefaults(
  laborFile: LaborFile | undefined,
  pendingPeriod: PreviousYearPendingPeriod
): PreviousYearPendingVacationForm {
  const currentPendingEvent = getCountedPreviousYearPendingEvent(laborFile, pendingPeriod);
  return {
    ...EMPTY_PREVIOUS_YEAR_PENDING_FORM,
    days: String(pendingPeriod === "YEAR_BEFORE_LAST"
      ? laborFile?.vacationSummary.yearBeforeLastPendingDays ?? 0
      : laborFile?.vacationSummary.previousYearPendingDays ?? 0),
    description: currentPendingEvent?.description ?? ""
  };
}

function mergeVacationFormatDates(
  current: LaborVacationFormatFieldValues,
  laborFile: LaborFile | undefined,
  dates: string[]
): LaborVacationFormatFieldValues {
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

function mergeGlobalVacationDates(current: LaborGlobalVacationDayInput, dates: string[]): LaborGlobalVacationDayInput {
  const vacationDates = sortDateKeys(dates);
  return {
    ...current,
    date: vacationDates[0] ?? "",
    days: vacationDates.length || 1,
    vacationDates
  };
}

function getGlobalVacationDayDates(day: LaborGlobalVacationDay) {
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

function formatGlobalVacationDayDates(day: LaborGlobalVacationDay) {
  const dates = getGlobalVacationDayDates(day);
  return formatVacationFormatDatesText(dates) || formatDate(day.date);
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isVacationEventAuthorized(event: LaborVacationEvent) {
  const mimeType = (event.acceptanceFileMimeType ?? "").toLowerCase();
  const filename = (event.acceptanceOriginalFileName ?? "").toLowerCase();
  return (event.eventType === "VACATION" || event.eventType === "GLOBAL_VACATION") &&
    (mimeType === "application/pdf" || filename.endsWith(".pdf"));
}

function isVacationFormatEvent(event: LaborVacationEvent) {
  return event.eventType === "VACATION" || event.eventType === "GLOBAL_VACATION";
}

function getVacationEventTitle(event: LaborVacationEvent) {
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

function getEmployeeSecondaryLabel(laborFile: LaborFile) {
  if (laborFile.employeeShortName) {
    return laborFile.employeeShortName;
  }

  return normalizeComparableText(laborFile.employeeUsername) === normalizeComparableText(laborFile.employeeName)
    ? laborFile.employeeName
    : laborFile.employeeUsername;
}

function isActiveLaborFile(laborFile: LaborFile) {
  return laborFile.employmentStatus === "ACTIVE";
}

function isHistoricalLaborFile(laborFile: LaborFile) {
  return laborFile.employmentStatus !== "ACTIVE";
}

function getEmploymentStatusLabel(laborFile: LaborFile) {
  if (laborFile.employmentStatus === "ARCHIVED") {
    return "Archivo historico";
  }

  if (laborFile.employmentStatus === "FORMER") {
    return "Extrabajador";
  }

  return "Activo";
}

function getEmploymentStatusClass(laborFile: LaborFile) {
  return laborFile.employmentStatus === "ACTIVE" ? "status-live" : "status-migration";
}

function filterLaborFilesByQuery(laborFiles: LaborFile[], query: string) {
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

function getDefaultLaborFileId(laborFiles: LaborFile[], preferredId?: string) {
  if (preferredId && laborFiles.some((laborFile) => laborFile.id === preferredId)) {
    return preferredId;
  }

  return laborFiles.find(isActiveLaborFile)?.id ?? laborFiles[0]?.id ?? "";
}

export function LaborFilesPage() {
  const { user } = useAuth();
  const [laborFiles, setLaborFiles] = useState<LaborFile[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [profileForm, setProfileForm] = useState<LaborFileProfileForm>(EMPTY_PROFILE_FORM);
  const [uploadType, setUploadType] = useState<LaborFileDocumentType>("EMPLOYMENT_CONTRACT");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [contractForm, setContractForm] = useState<LaborContractFieldValues>(EMPTY_CONTRACT_FORM);
  const [contractPrefillSources, setContractPrefillSources] = useState<LaborContractPrefillResult["sources"]>([]);
  const [contractPrefillNotes, setContractPrefillNotes] = useState<string[]>([]);
  const [prefillingContract, setPrefillingContract] = useState(false);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [vacationFormatFormOpen, setVacationFormatFormOpen] = useState(false);
  const [vacationFormatForm, setVacationFormatForm] = useState<LaborVacationFormatFieldValues>(EMPTY_VACATION_FORMAT_FORM);
  const [vacationFormatRange, setVacationFormatRange] = useState({ startDate: "", endDate: "" });
  const [vacationFormatSingleDate, setVacationFormatSingleDate] = useState("");
  const [generatingVacationFormat, setGeneratingVacationFormat] = useState(false);
  const [previousYearPendingForm, setPreviousYearPendingForm] = useState<PreviousYearPendingVacationForm>(EMPTY_PREVIOUS_YEAR_PENDING_FORM);
  const [yearBeforeLastPendingForm, setYearBeforeLastPendingForm] = useState<PreviousYearPendingVacationForm>(EMPTY_PREVIOUS_YEAR_PENDING_FORM);
  const [savingPreviousYearPending, setSavingPreviousYearPending] = useState(false);
  const [globalVacationDays, setGlobalVacationDays] = useState<LaborGlobalVacationDay[]>([]);
  const [globalVacationForm, setGlobalVacationForm] = useState<LaborGlobalVacationDayInput>(EMPTY_GLOBAL_VACATION_FORM);
  const [globalVacationRange, setGlobalVacationRange] = useState({ startDate: "", endDate: "" });
  const [globalVacationSingleDate, setGlobalVacationSingleDate] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [documentActionId, setDocumentActionId] = useState<string | null>(null);
  const [deletingVacationId, setDeletingVacationId] = useState<string | null>(null);
  const [vacationFileActionId, setVacationFileActionId] = useState<string | null>(null);
  const [signingVacationEventId, setSigningVacationEventId] = useState<string | null>(null);
  const [deletingGlobalVacationId, setDeletingGlobalVacationId] = useState<string | null>(null);
  const [downloadingGlobalVacationId, setDownloadingGlobalVacationId] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
  const canDeleteDraftVacationFormats = Boolean(user && (
    isEduardoRusconi({
      username: user.username,
      displayName: user.displayName,
      email: user.email
    }) ||
    isMayraOrdonez({
      username: user.username,
      displayName: user.displayName,
      email: user.email
    })
  ));
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
  const filteredLaborFiles = useMemo(
    () => filterLaborFilesByQuery(activeLaborFiles, query),
    [activeLaborFiles, query]
  );
  const filteredHistoricalLaborFiles = useMemo(
    () => filterLaborFilesByQuery(historicalLaborFiles, query),
    [historicalLaborFiles, query]
  );
  const selectedLaborFile = laborFiles.find((laborFile) => laborFile.id === selectedId)
    ?? filteredLaborFiles[0]
    ?? filteredHistoricalLaborFiles[0]
    ?? laborFiles[0];
  const canMoveSelectedLaborFile = Boolean(canWrite && selectedLaborFile);
  const canDeleteSelectedLaborFile = Boolean(canDeleteArchivedLaborFiles && selectedLaborFile?.employmentStatus === "ARCHIVED");

  async function loadLaborFiles(preferredId?: string) {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [rows, globalDays] = await Promise.all([
        apiGet<LaborFile[]>("/labor-files"),
        canWrite ? apiGet<LaborGlobalVacationDay[]>("/labor-files/global-vacation-days") : Promise.resolve([])
      ]);
      const sortedRows = sortLaborFiles(rows);
      setLaborFiles(sortedRows);
      setGlobalVacationDays(globalDays);
      setSelectedId((current) => getDefaultLaborFileId(sortedRows, preferredId || current));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
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

  function canDeleteVacationEventForCurrentUser(event: LaborVacationEvent) {
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

  function isGlobalVacationDayAuthorized(dayId: string) {
    return laborFiles.some((laborFile) =>
      laborFile.vacationEvents.some((event) =>
        event.eventType === "GLOBAL_VACATION" &&
        event.globalVacationDayId === dayId &&
        isVacationEventAuthorized(event)
      )
    );
  }

  function canDeleteGlobalVacationDay(dayId: string) {
    if (!canWrite) {
      return false;
    }

    return isGlobalVacationDayAuthorized(dayId)
      ? canDeleteApprovedVacationFormats
      : canDeleteDraftVacationFormats;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setFlash(null);
  }

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLaborFile || !canWrite) {
      return;
    }

    setSaving(true);
    setFlash(null);

    try {
      const updatedLaborFile = await apiPatch<LaborFile>(`/labor-files/${selectedLaborFile.id}`, {
        hireDate: profileForm.hireDate,
        dailySalaryMxn: profileForm.dailySalaryMxn ? Number(profileForm.dailySalaryMxn) : null,
        personalPhone: profileForm.personalPhone || null,
        personalEmail: profileForm.personalEmail || null,
        emergencyContactName: profileForm.emergencyContactName || null,
        emergencyContactPhone: profileForm.emergencyContactPhone || null,
        emergencyContactAddress: profileForm.emergencyContactAddress || null,
        notes: profileForm.notes || null
      });
      setLaborFiles((current) =>
        sortLaborFiles(current.map((laborFile) =>
          laborFile.id === updatedLaborFile.id ? updatedLaborFile : laborFile
        ))
      );
      setFlash({ tone: "success", text: "Expediente actualizado." });
      await loadLaborFiles(selectedLaborFile.id);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
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
      const archivedLaborFile = await apiPost<LaborFile>(`/labor-files/${targetLaborFile.id}/archive`, {});
      setLaborFiles((current) =>
        sortLaborFiles(current.map((laborFile) =>
          laborFile.id === archivedLaborFile.id ? archivedLaborFile : laborFile
        ))
      );
      setSelectedId(archivedLaborFile.id);
      setFlash({ tone: "success", text: "Expediente enviado al archivo historico." });
      await loadLaborFiles(archivedLaborFile.id);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
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
      const restoredLaborFile = await apiPost<LaborFile>(`/labor-files/${targetLaborFile.id}/restore`, {});
      setLaborFiles((current) =>
        sortLaborFiles(current.map((laborFile) =>
          laborFile.id === restoredLaborFile.id ? restoredLaborFile : laborFile
        ))
      );
      setSelectedId(restoredLaborFile.id);
      setFlash({ tone: "success", text: "Expediente regresado a activos." });
      await loadLaborFiles(restoredLaborFile.id);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
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
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
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
      await apiPost<LaborFileDocument>(`/labor-files/${selectedLaborFile.id}/documents`, {
        documentType: uploadType,
        originalFileName: selectedFile.name,
        fileMimeType: selectedFile.type || "application/octet-stream",
        fileBase64: await fileToBase64(selectedFile)
      });
      setSelectedFile(null);
      setFlash({ tone: "success", text: `${getDocumentLabel(uploadType)} cargado.` });
      event.currentTarget.reset();
      await loadLaborFiles(selectedLaborFile.id);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  function updateContractFormField(field: keyof LaborContractFieldValues, value: string) {
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
      const result = await apiPost<LaborContractPrefillResult>(`/labor-files/${selectedLaborFile.id}/contract/prefill`, {});
      setContractForm((current) => mergeEditableContractFields(current, result.fields));
      setContractPrefillSources(result.sources);
      setContractPrefillNotes(result.notes);
      setFlash({ tone: "success", text: "Formulario prellenado con IA. Revisa y ajusta antes de generar el contrato." });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
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

  async function handleContractGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLaborFile || !canWrite) {
      return;
    }

    setGeneratingContract(true);
    setFlash(null);

    try {
      await apiPost<LaborFileDocument>(`/labor-files/${selectedLaborFile.id}/contract/generate`, contractForm);
      setFlash({ tone: "success", text: "Contrato laboral generado y guardado en el expediente." });
      await loadLaborFiles(selectedLaborFile.id);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setGeneratingContract(false);
    }
  }

  function updateVacationFormatFormField<K extends keyof LaborVacationFormatFieldValues>(
    field: K,
    value: LaborVacationFormatFieldValues[K]
  ) {
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

  function addVacationFormatDates(dates: string[]) {
    if (dates.length === 0) {
      setFlash({ tone: "error", text: "Selecciona al menos un día de vacaciones para el formato." });
      return;
    }

    setVacationFormatForm((current) =>
      mergeVacationFormatDates(current, selectedLaborFile, [...current.vacationDates, ...dates])
    );
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

  function handleVacationFormatDateRemove(date: string) {
    setVacationFormatForm((current) =>
      mergeVacationFormatDates(current, selectedLaborFile, current.vacationDates.filter((entry) => entry !== date))
    );
  }

  async function handleVacationFormatGenerate(event: FormEvent<HTMLFormElement>) {
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
      await apiPost<LaborVacationEvent>(`/labor-files/${selectedLaborFile.id}/vacation-format/generate`, {
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
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setGeneratingVacationFormat(false);
    }
  }

  async function handleDocumentDownload(document: LaborFileDocument, mode: "open" | "download") {
    setDocumentActionId(document.id);
    setFlash(null);

    try {
      const { blob, filename } = await apiDownload(`/labor-files/documents/${document.id}`);
      if (mode === "open") {
        openBlobFile(blob);
      } else {
        downloadBlobFile(blob, filename ?? document.originalFileName);
      }
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDocumentActionId(null);
    }
  }

  async function handleDocumentDelete(document: LaborFileDocument) {
    if (!window.confirm(`Seguro que deseas borrar ${document.originalFileName}?`)) {
      return;
    }

    setDocumentActionId(document.id);
    setFlash(null);

    try {
      await apiDelete(`/labor-files/documents/${document.id}`);
      setFlash({ tone: "success", text: "Documento eliminado." });
      await loadLaborFiles(selectedLaborFile?.id);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDocumentActionId(null);
    }
  }

  async function handleVacationDelete(eventId: string) {
    setDeletingVacationId(eventId);
    setFlash(null);

    try {
      await apiDelete(`/labor-files/vacation-events/${eventId}`);
      setFlash({ tone: "success", text: "Registro eliminado." });
      await loadLaborFiles(selectedLaborFile?.id);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDeletingVacationId(null);
    }
  }

  async function handleVacationAcceptanceDownload(event: LaborVacationEvent, mode: "open" | "download") {
    setVacationFileActionId(event.id);
    setFlash(null);

    try {
      const { blob, filename } = await apiDownload(`/labor-files/vacation-events/${event.id}/acceptance-format`);
      if (mode === "open") {
        openBlobFile(blob);
      } else {
        downloadBlobFile(blob, filename ?? event.acceptanceOriginalFileName ?? "formato-vacaciones.pdf");
      }
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setVacationFileActionId(null);
    }
  }

  async function handleVacationSignedPdfUpload(event: LaborVacationEvent, file: File) {
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
      await apiPost<LaborVacationEvent>(`/labor-files/vacation-events/${event.id}/signed-format`, {
        originalFileName: file.name,
        fileMimeType: file.type || "application/pdf",
        fileBase64: await fileToBase64(file),
        overrideTeamVacationConflict: canOverrideVacationConflicts && Boolean(vacationFormatForm.overrideTeamVacationConflict)
      });
      setFlash({ tone: "success", text: "PDF firmado cargado. Vacaciones autorizadas." });
      await loadLaborFiles(selectedLaborFile.id);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSigningVacationEventId(null);
    }
  }

  async function handlePreviousYearPendingSubmit(event: FormEvent<HTMLFormElement>, pendingPeriod: PreviousYearPendingPeriod) {
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

    const parsedDays = form.days.trim() === "" ? 0 : Number(form.days.replace(",", "."));
    if (!Number.isFinite(parsedDays)) {
      setFlash({ tone: "error", text: "Ingresa un numero valido de dias pendientes." });
      return;
    }

    setSavingPreviousYearPending(true);
    setFlash(null);

    try {
      await apiPost<LaborFile>(`/labor-files/${selectedLaborFile.id}/previous-year-pending-vacations`, {
        days: parsedDays,
        description: form.description || null,
        manualOverrideConfirmed: true,
        pendingPeriod
      });
      setForm((current) => ({ ...current, manualOverrideConfirmed: false }));
      setFlash({ tone: "success", text: `Saldo pendiente ${periodCopy} actualizado.` });
      await loadLaborFiles(selectedLaborFile.id);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSavingPreviousYearPending(false);
    }
  }

  function addGlobalVacationDates(dates: string[]) {
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

  function handleGlobalVacationDateRemove(date: string) {
    setGlobalVacationForm((current) =>
      mergeGlobalVacationDates(current, (current.vacationDates ?? []).filter((entry) => entry !== date))
    );
  }

  async function handleGlobalVacationSubmit(event: FormEvent<HTMLFormElement>) {
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
      const result = await apiPost<LaborGlobalVacationBatchResult>("/labor-files/global-vacation-days", {
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
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function downloadGlobalVacationFormats(day: Pick<LaborGlobalVacationDay, "id" | "date">) {
    setDownloadingGlobalVacationId(day.id);

    try {
      const { blob, filename } = await apiDownload(`/labor-files/global-vacation-days/${day.id}/acceptance-formats`);
      downloadBlobFile(blob, filename ?? `formatos-vacaciones-generales-${day.date}.zip`);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDownloadingGlobalVacationId(null);
    }
  }

  async function handleGlobalVacationDelete(dayId: string) {
    setDeletingGlobalVacationId(dayId);
    setFlash(null);

    try {
      await apiDelete(`/labor-files/global-vacation-days/${dayId}`);
      setFlash({ tone: "success", text: "Día general de vacaciones eliminado." });
      await loadLaborFiles(selectedLaborFile?.id);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDeletingGlobalVacationId(null);
    }
  }

  if (!canRead) {
    return (
      <section className="page-stack">
        <header className="hero module-hero">
          <div className="module-hero-head">
            <div>
              <h2>Expedientes Laborales</h2>
            </div>
          </div>
          <p className="muted">Tu perfil actual no tiene permisos para consultar expedientes laborales.</p>
        </header>
      </section>
    );
  }

  const contractDocument = selectedLaborFile
    ? getLatestDocument(selectedLaborFile.documents, "EMPLOYMENT_CONTRACT")
    : undefined;
  const salaryDocuments = selectedLaborFile?.documents.filter((document) =>
    document.documentType === "EMPLOYMENT_CONTRACT" || document.documentType === "ADDENDUM"
  ) ?? [];
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
  const documentDefinitions = LABOR_FILE_DOCUMENT_DEFINITIONS.filter((definition) =>
    !definition.contractSection
  );
  const selectedUploadDefinition = LABOR_FILE_DOCUMENT_DEFINITIONS.find((definition) => definition.type === uploadType);
  const selectedUploadCount = selectedLaborFile
    ? selectedLaborFile.documents.filter((document) => document.documentType === uploadType).length
    : 0;
  const selectedUploadLimitReached = Boolean(
    selectedUploadDefinition?.maxFiles && selectedUploadCount >= selectedUploadDefinition.maxFiles
  );

  function renderLaborFileSelectorButton(laborFile: LaborFile) {
    return (
      <button
        className={[
          laborFile.id === selectedLaborFile?.id ? "is-active" : "",
          laborFile.status === "COMPLETE" ? "is-complete" : "is-incomplete"
        ].filter(Boolean).join(" ")}
        key={laborFile.id}
        onClick={() => setSelectedId(laborFile.id)}
        type="button"
      >
        <div className="labor-file-selector-head">
          <strong>{laborFile.employeeName}</strong>
          <span className={`status-pill labor-file-selector-status ${laborFile.status === "COMPLETE" ? "status-live" : "status-warning"}`}>
            {laborFile.status === "COMPLETE" ? "Completo" : "Incompleto"}
          </span>
        </div>
        <span>{getEmployeeSecondaryLabel(laborFile)}</span>
        {isHistoricalLaborFile(laborFile) ? <small>{getEmploymentStatusLabel(laborFile)}</small> : null}
      </button>
    );
  }

  function renderSelectedLaborFileMoveAction(laborFile: LaborFile) {
    if (!canMoveSelectedLaborFile || laborFile.id !== selectedLaborFile?.id) {
      return null;
    }

    const isHistorical = isHistoricalLaborFile(laborFile);

    return (
      <button
        className="secondary-button labor-file-selector-context-action"
        disabled={saving}
        onClick={() => isHistorical ? void handleLaborFileRestore(laborFile) : void handleLaborFileArchive(laborFile)}
        type="button"
      >
        {isHistorical ? "Regresar a activos" : "Enviar al archivo historico"}
      </button>
    );
  }

  function renderLaborFileSelectorEntry(laborFile: LaborFile) {
    return (
      <div className="labor-file-selector-entry" key={laborFile.id}>
        {renderLaborFileSelectorButton(laborFile)}
        {renderSelectedLaborFileMoveAction(laborFile)}
      </div>
    );
  }

  return (
    <section className="page-stack labor-files-page">
      <header className="hero module-hero labor-files-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            Expedientes
          </span>
          <div>
            <h2>Expedientes Laborales</h2>
          </div>
        </div>
        <p className="muted">
          Contratos, documentos obligatorios y vacaciones por usuario, conservados también para extrabajadores.
        </p>
      </header>

      {canWrite ? (
        <div className="summary-grid">
          <SummaryCard label="Activos" value={metrics.total} accent="#1d4ed8" />
          <SummaryCard label="Completos" value={metrics.complete} accent="#0f766e" />
          <SummaryCard label="Incompletos" value={metrics.incomplete} accent="#b42318" />
          <SummaryCard label="Archivo historico" value={metrics.former} accent="#9a6700" />
        </div>
      ) : null}

      {flash ? (
        <div className={`message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`}>
          {flash.text}
        </div>
      ) : null}
      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      {canWrite ? (
        <section className="panel labor-file-global-vacation-panel">
          <div className="panel-header">
            <div>
              <h2>Vacaciones generales</h2>
              <span>Genera los formatos individuales y registra el movimiento en todos los trabajadores activos.</span>
            </div>
            <span>{globalVacationDays.length} registrados</span>
          </div>

          <form className="labor-file-global-vacation-form" onSubmit={handleGlobalVacationSubmit}>
            <div className="labor-file-vacation-date-tools">
              <div className="labor-file-vacation-date-group is-range">
                <h3>Días continuos</h3>
                <div className="labor-file-vacation-date-row">
                  <label className="form-field">
                    <span>Inicio</span>
                    <input
                      type="date"
                      value={globalVacationRange.startDate}
                      onChange={(event) => setGlobalVacationRange((current) => ({ ...current, startDate: event.target.value }))}
                    />
                  </label>
                  <label className="form-field">
                    <span>Fin</span>
                    <input
                      type="date"
                      value={globalVacationRange.endDate}
                      onChange={(event) => setGlobalVacationRange((current) => ({ ...current, endDate: event.target.value }))}
                    />
                  </label>
                  <button className="secondary-button" onClick={handleGlobalVacationRangeAdd} type="button">
                    Agregar periodo
                  </button>
                </div>
              </div>
              <div className="labor-file-vacation-date-group is-single">
                <h3>Día suelto</h3>
                <div className="labor-file-vacation-date-row">
                  <label className="form-field">
                    <span>Fecha</span>
                    <input
                      type="date"
                      value={globalVacationSingleDate}
                      onChange={(event) => setGlobalVacationSingleDate(event.target.value)}
                    />
                  </label>
                  <button className="secondary-button" onClick={handleGlobalVacationSingleDateAdd} type="button">
                    Agregar día
                  </button>
                </div>
              </div>
            </div>
            <div className="labor-file-vacation-selected-days">
              <div className="labor-file-vacation-format-section-title">
                <h4>Días seleccionados</h4>
                <span>{globalVacationForm.vacationDates?.length ?? 0} días para todos</span>
              </div>
              {(globalVacationForm.vacationDates ?? []).length === 0 ? (
                <div className="centered-inline-message">Agrega un día o un periodo.</div>
              ) : (
                <div className="labor-file-vacation-day-chips">
                  {(globalVacationForm.vacationDates ?? []).map((date) => (
                    <button key={date} onClick={() => handleGlobalVacationDateRemove(date)} type="button">
                      {formatDate(date)} <span>Quitar</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label className="form-field labor-file-global-vacation-description">
              <span>Descripción</span>
              <input
                value={globalVacationForm.description ?? ""}
                onChange={(event) => setGlobalVacationForm((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <div className="labor-file-global-vacation-actions">
              <button className="primary-button" disabled={saving} type="submit">
                {saving ? "Generando..." : "Generar para todos"}
              </button>
            </div>
          </form>

          <div className="labor-file-global-vacation-list">
            {globalVacationDays.length === 0 ? (
              <div className="centered-inline-message">Sin vacaciones generales registradas.</div>
            ) : globalVacationDays.map((day) => {
              const canDeleteDay = canDeleteGlobalVacationDay(day.id);
              return (
                <div className="labor-file-vacation-event" key={day.id}>
                  <div>
                    <strong>{formatGlobalVacationDayDates(day)}</strong>
                    <span>{day.days} {day.days === 1 ? "día" : "días"} para todos</span>
                  </div>
                  {day.description ? <small>{day.description}</small> : <small>Vacación general</small>}
                  <div className="table-actions">
                    <button
                      className="ghost-button"
                      disabled={downloadingGlobalVacationId === day.id}
                      onClick={() => void downloadGlobalVacationFormats(day)}
                      type="button"
                    >
                      {downloadingGlobalVacationId === day.id ? "Preparando..." : "Descargar formatos"}
                    </button>
                    {canDeleteDay ? (
                      <button
                        className="danger-button"
                        disabled={deletingGlobalVacationId === day.id}
                        onClick={() => void handleGlobalVacationDelete(day.id)}
                        type="button"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="labor-files-layout">
        {canWrite ? (
          <aside className="panel labor-files-sidebar">
            <div className="panel-header">
              <h2>Colaboradores activos</h2>
              <span>{filteredLaborFiles.length}</span>
            </div>
            <label className="form-field">
              <span>Buscar</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre, equipo o rol..."
              />
            </label>
            <div className="labor-file-selector-list">
              {loading ? <div className="centered-inline-message">Cargando expedientes...</div> : null}
              {!loading && filteredLaborFiles.length === 0 ? (
                <div className="centered-inline-message">Sin colaboradores activos.</div>
              ) : null}
              {!loading && filteredLaborFiles.map(renderLaborFileSelectorEntry)}
            </div>

            <div className="labor-file-archive-section">
              <div className="labor-file-archive-head">
                <h3>Archivo historico</h3>
                <span>{filteredHistoricalLaborFiles.length}</span>
              </div>
              <div className="labor-file-selector-list labor-file-archive-list">
                {!loading && filteredHistoricalLaborFiles.length === 0 ? (
                  <div className="centered-inline-message">Sin expedientes historicos.</div>
                ) : null}
                {!loading && filteredHistoricalLaborFiles.map(renderLaborFileSelectorEntry)}
              </div>
            </div>
          </aside>
        ) : null}

        <div className="labor-file-main">
          {!selectedLaborFile && !loading ? (
            <section className="panel">
              <div className="centered-inline-message">No hay expediente laboral disponible.</div>
            </section>
          ) : null}

          {selectedLaborFile ? (
            <>
              <section className="panel labor-file-profile-panel">
                <div className="panel-header">
                  <div>
                    <h2>Información general</h2>
                    <span>{selectedLaborFile.employeeName} / {selectedLaborFile.legacyTeam ?? "Sin equipo"} / {selectedLaborFile.specificRole ?? "Sin rol"}</span>
                  </div>
                  <div className="labor-file-status-group">
                    <span className={`status-pill ${selectedLaborFile.status === "COMPLETE" ? "status-live" : "status-warning"}`}>
                      {selectedLaborFile.status === "COMPLETE" ? "Completo" : "Incompleto"}
                    </span>
                    <span className={`status-pill ${getEmploymentStatusClass(selectedLaborFile)}`}>
                      {getEmploymentStatusLabel(selectedLaborFile)}
                    </span>
                  </div>
                </div>

                <div className="labor-file-profile-grid">
                  <div>
                    <span>Nombre</span>
                    <strong>{selectedLaborFile.employeeName}</strong>
                  </div>
                  <div>
                    <span>Usuario</span>
                    <strong>{selectedLaborFile.employeeUsername}</strong>
                  </div>
                  <div>
                    <span>Nombre corto</span>
                    <strong>{selectedLaborFile.employeeShortName ?? "-"}</strong>
                  </div>
                  <div>
                    <span>Fecha de ingreso</span>
                    <strong>{formatDate(selectedLaborFile.hireDate)}</strong>
                  </div>
                  <div className={`labor-file-profile-salary-card is-${dailySalaryValidation?.status ?? "mismatch"}`}>
                    <span className="labor-file-profile-card-head">
                      <span>Salario diario</span>
                      <span className="labor-file-ri-badge">
                        <RusconiIntelligenceBadge connectionId={LABOR_DAILY_SALARY_RI_CONNECTION_ID} label="Expedientes laborales / Salario diario" />
                      </span>
                    </span>
                    <strong className="labor-file-salary-value">
                      {formatMoney(displayedDailySalaryMxn)}
                      <span
                        aria-label={dailySalaryValidation?.label ?? "No coincide"}
                        className={`labor-file-ri-validation-icon is-${dailySalaryValidation?.status ?? "mismatch"}`}
                        role="img"
                        title={dailySalaryValidation?.detail}
                      />
                    </strong>
                    <small className={`labor-file-ri-validation-copy is-${dailySalaryValidation?.status ?? "mismatch"}`}>
                      {dailySalaryValidation?.detail}
                    </small>
                  </div>
                  <div>
                    <span>Última actualización</span>
                    <strong>{formatDateTime(selectedLaborFile.updatedAt)}</strong>
                  </div>
                  <div>
                    <span>Teléfono personal</span>
                    <strong>{selectedLaborFile.personalPhone ?? "-"}</strong>
                  </div>
                  <div>
                    <span>Correo personal</span>
                    <strong>{selectedLaborFile.personalEmail ?? "-"}</strong>
                  </div>
                  <div>
                    <span>Contacto de emergencia</span>
                    <strong>{selectedLaborFile.emergencyContactName ?? "-"}</strong>
                  </div>
                  <div>
                    <span>Teléfono de emergencia</span>
                    <strong>{selectedLaborFile.emergencyContactPhone ?? "-"}</strong>
                  </div>
                  <div className="labor-file-profile-wide-card">
                    <span>Dirección del contacto de emergencia</span>
                    <strong>{selectedLaborFile.emergencyContactAddress ?? "-"}</strong>
                  </div>
                </div>

                {canWrite ? (
                  <form className="labor-file-profile-form" onSubmit={handleProfileSave}>
                    <label className="form-field">
                      <span>Fecha de ingreso</span>
                      <input
                        type="date"
                        value={profileForm.hireDate}
                        onChange={(event) => setProfileForm((current) => ({ ...current, hireDate: event.target.value }))}
                      />
                    </label>
                    <label className="form-field">
                      <span>Salario diario</span>
                      <div className="money-input-control">
                        <span className="money-input-prefix">$</span>
                        <input
                          min="0"
                          step="0.01"
                          type="number"
                          value={profileForm.dailySalaryMxn}
                          onChange={(event) => setProfileForm((current) => ({ ...current, dailySalaryMxn: event.target.value }))}
                        />
                      </div>
                    </label>
                    <label className="form-field">
                      <span>Teléfono personal</span>
                      <input
                        autoComplete="tel"
                        value={profileForm.personalPhone}
                        onChange={(event) => setProfileForm((current) => ({ ...current, personalPhone: event.target.value }))}
                      />
                    </label>
                    <label className="form-field">
                      <span>Correo electrónico personal</span>
                      <input
                        autoComplete="email"
                        type="email"
                        value={profileForm.personalEmail}
                        onChange={(event) => setProfileForm((current) => ({ ...current, personalEmail: event.target.value }))}
                      />
                    </label>
                    <label className="form-field">
                      <span>Persona de contacto para emergencias</span>
                      <input
                        value={profileForm.emergencyContactName}
                        onChange={(event) => setProfileForm((current) => ({ ...current, emergencyContactName: event.target.value }))}
                      />
                    </label>
                    <label className="form-field">
                      <span>Número de contacto de emergencia</span>
                      <input
                        autoComplete="tel"
                        value={profileForm.emergencyContactPhone}
                        onChange={(event) => setProfileForm((current) => ({ ...current, emergencyContactPhone: event.target.value }))}
                      />
                    </label>
                    <label className="form-field labor-file-profile-wide-field">
                      <span>Dirección del contacto de emergencia</span>
                      <textarea
                        value={profileForm.emergencyContactAddress}
                        onChange={(event) => setProfileForm((current) => ({ ...current, emergencyContactAddress: event.target.value }))}
                      />
                    </label>
                    <label className="form-field labor-file-notes-field">
                      <span>Notas</span>
                      <textarea
                        value={profileForm.notes}
                        onChange={(event) => setProfileForm((current) => ({ ...current, notes: event.target.value }))}
                      />
                    </label>
                    <div className="form-actions">
                      <button className="primary-button" disabled={saving} type="submit">
                        Guardar expediente
                      </button>
                      <button className="secondary-button" disabled={saving || loading} onClick={() => void loadLaborFiles(selectedLaborFile.id)} type="button">
                        Refrescar
                      </button>
                      {canDeleteSelectedLaborFile ? (
                        <button className="danger-button" disabled={saving} onClick={() => void handleLaborFileDelete()} type="button">
                          Eliminar expediente archivado
                        </button>
                      ) : null}
                    </div>
                  </form>
                ) : null}
              </section>

              <section className="panel labor-file-upload-panel">
                <div className="panel-header">
                  <h2>Carga documental</h2>
                  <span>{selectedLaborFile.documents.length} archivos</span>
                </div>

                {canWrite ? (
                  <form className="labor-file-upload-form" onSubmit={handleUpload}>
                    <label className="form-field">
                      <span>Tipo de documento</span>
                      <select value={uploadType} onChange={(event) => setUploadType(event.target.value as LaborFileDocumentType)}>
                        {LABOR_FILE_DOCUMENT_DEFINITIONS.map((definition) => (
                          <option key={definition.type} value={definition.type}>
                            {definition.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field">
                      <span>Archivo</span>
                      <input
                        accept={getUploadAccept(uploadType)}
                        disabled={selectedUploadLimitReached}
                        onChange={handleFileChange}
                        type="file"
                      />
                    </label>
                    <button className="primary-button" disabled={saving || selectedUploadLimitReached} type="submit">
                      Cargar
                    </button>
                    {selectedUploadDefinition?.maxFiles ? (
                      <small className="labor-file-upload-limit">
                        {selectedUploadCount} de {selectedUploadDefinition.maxFiles} cargados
                        {selectedUploadLimitReached ? " / límite alcanzado" : ""}
                      </small>
                    ) : null}
                  </form>
                ) : null}

                <div className="labor-file-contract-block">
                  <div className="labor-file-section-title">
                    <h3>Contrato laboral</h3>
                    <span>{contractDocument ? "Cargado" : "Pendiente"}</span>
                  </div>
                  <DocumentRow
                    canWrite={canWrite}
                    document={contractDocument}
                    documentActionId={documentActionId}
                    label="Contrato laboral"
                    required
                    onDelete={handleDocumentDelete}
                    onDownload={handleDocumentDownload}
                  />

                  <div className="labor-file-section-title">
                    <h3>Addenda</h3>
                    <span>{addenda.length}</span>
                  </div>
                  {addenda.length === 0 ? (
                    <div className="labor-file-document-row is-empty">
                      <span>Sin addenda cargada</span>
                    </div>
                  ) : addenda.map((document) => (
                    <DocumentRow
                      canWrite={canWrite}
                      document={document}
                      documentActionId={documentActionId}
                      key={document.id}
                      label="Addendum"
                      onDelete={handleDocumentDelete}
                      onDownload={handleDocumentDownload}
                    />
                  ))}
                </div>

                <div className="labor-file-documents-table">
                  <div className="labor-file-section-title">
                    <h3>Documentos personales</h3>
                    <span>Obligatorios y opcionales</span>
                  </div>
                  {documentDefinitions.map((definition) => (
                    definition.multiple ? (
                      <MultipleDocumentRow
                        canWrite={canWrite}
                        documentActionId={documentActionId}
                        documents={getDocumentsByType(selectedLaborFile.documents, definition.type)}
                        key={definition.type}
                        label={definition.label}
                        maxFiles={definition.maxFiles}
                        required={isDocumentRequired(definition.type, selectedLaborFile)}
                        onDelete={handleDocumentDelete}
                        onDownload={handleDocumentDownload}
                      />
                    ) : (
                      <DocumentRow
                        canWrite={canWrite}
                        document={getLatestDocument(selectedLaborFile.documents, definition.type)}
                        documentActionId={documentActionId}
                        key={definition.type}
                        label={definition.label}
                        required={isDocumentRequired(definition.type, selectedLaborFile)}
                        onDelete={handleDocumentDelete}
                        onDownload={handleDocumentDownload}
                      />
                    )
                  ))}
                </div>
              </section>

              <section className="panel labor-file-contract-generator-panel">
                <div className="panel-header">
                  <div>
                    <h2>Generación de contrato laboral</h2>
                    <span>Word editable basado en el contrato de trabajo vigente y resguardo automático en expediente.</span>
                  </div>
                  <span className={`status-pill ${contractDocument ? "status-live" : "status-warning"}`}>
                    {contractDocument ? "Contrato guardado" : "Pendiente"}
                  </span>
                </div>

                {canWrite ? (
                  <>
                    <div className="labor-file-contract-generator-summary">
                      <div>
                        <strong>{contractDocument?.originalFileName ?? "Sin contrato generado"}</strong>
                        <span>
                          {contractDocument
                            ? `${formatFileSize(contractDocument.fileSizeBytes)} / ${formatDateTime(contractDocument.uploadedAt)}`
                            : "El formulario puede prellenarse con IA a partir de los documentos cargados."}
                        </span>
                      </div>
                      <div className="labor-file-contract-generator-actions">
                        <button
                          className="primary-button"
                          disabled={generatingContract}
                          onClick={handleContractFormToggle}
                          type="button"
                        >
                          {contractFormOpen ? "Cerrar formulario" : prefillingContract ? "Leyendo documentos..." : "Abrir formulario"}
                        </button>
                      </div>
                    </div>

                    {contractFormOpen ? (
                      <form className="labor-file-contract-form" onSubmit={handleContractGenerate}>
                        <div className="labor-file-contract-form-head">
                          <div>
                            <h3>Información del trabajador</h3>
                            <span>Los campos prellenados pueden editarse antes de generar el documento.</span>
                          </div>
                          <button
                            className="secondary-button"
                            disabled={prefillingContract || generatingContract}
                            onClick={() => void handleContractPrefill()}
                            type="button"
                          >
                            {prefillingContract ? "Prellenando..." : "Prellenar con IA"}
                          </button>
                        </div>

                        <div className="labor-file-contract-field-grid">
                          <label className="form-field">
                            <span>Nombre completo</span>
                            <input
                              required
                              value={contractForm.employeeName}
                              onChange={(event) => updateContractFormField("employeeName", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Puesto o labor</span>
                            <input
                              required
                              value={contractForm.position}
                              onChange={(event) => updateContractFormField("position", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>RFC</span>
                            <input value={contractForm.rfc} onChange={(event) => updateContractFormField("rfc", event.target.value)} />
                          </label>
                          <label className="form-field">
                            <span>CURP</span>
                            <input value={contractForm.curp} onChange={(event) => updateContractFormField("curp", event.target.value)} />
                          </label>
                          <label className="form-field labor-file-contract-wide-field">
                            <span>Domicilio</span>
                            <textarea
                              value={contractForm.employeeAddress}
                              onChange={(event) => updateContractFormField("employeeAddress", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Teléfono</span>
                            <input
                              value={contractForm.employeePhone}
                              onChange={(event) => updateContractFormField("employeePhone", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Fecha de ingreso/contrato</span>
                            <input
                              type="date"
                              value={contractForm.originalContractDate}
                              onChange={(event) => updateContractFormField("originalContractDate", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Hora de entrada</span>
                            <input
                              type="time"
                              value={contractForm.workdayStart}
                              onChange={(event) => updateContractFormField("workdayStart", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Hora de salida</span>
                            <input
                              type="time"
                              value={contractForm.workdayEnd}
                              onChange={(event) => updateContractFormField("workdayEnd", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Salario mensual bruto</span>
                            <input
                              placeholder="$0.00"
                              value={contractForm.monthlyGrossSalary}
                              onChange={(event) => updateContractFormField("monthlyGrossSalary", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Salario mensual en letra</span>
                            <input
                              value={contractForm.monthlyGrossSalaryText}
                              onChange={(event) => updateContractFormField("monthlyGrossSalaryText", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Bono de asistencia</span>
                            <input
                              placeholder="10% del salario si se deja vacío"
                              value={contractForm.attendanceBonus}
                              onChange={(event) => updateContractFormField("attendanceBonus", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Bono de asistencia en letra</span>
                            <input
                              value={contractForm.attendanceBonusText}
                              onChange={(event) => updateContractFormField("attendanceBonusText", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Bono de puntualidad</span>
                            <input
                              placeholder="10% del salario si se deja vacío"
                              value={contractForm.punctualityBonus}
                              onChange={(event) => updateContractFormField("punctualityBonus", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Bono de puntualidad en letra</span>
                            <input
                              value={contractForm.punctualityBonusText}
                              onChange={(event) => updateContractFormField("punctualityBonusText", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Fecha de firma</span>
                            <input
                              type="date"
                              value={contractForm.signingDate}
                              onChange={(event) => updateContractFormField("signingDate", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Ciudad de firma</span>
                            <input
                              value={contractForm.signingCity}
                              onChange={(event) => updateContractFormField("signingCity", event.target.value)}
                            />
                          </label>
                        </div>

                        {contractPrefillSources.length > 0 || contractPrefillNotes.length > 0 ? (
                          <div className="labor-file-contract-prefill-panel">
                            {contractPrefillSources.length > 0 ? (
                              <div>
                                <strong>Campos con soporte documental</strong>
                                <span>
                                  {contractPrefillSources.map((source) =>
                                    `${CONTRACT_FIELD_LABELS[source.field]}${source.originalFileName ? ` (${source.originalFileName})` : ""}`
                                  ).join(", ")}
                                </span>
                              </div>
                            ) : null}
                            {contractPrefillNotes.length > 0 ? (
                              <div>
                                <strong>Notas IA</strong>
                                <span>{contractPrefillNotes.join(" ")}</span>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="form-actions">
                          <button className="primary-button" disabled={generatingContract || prefillingContract} type="submit">
                            {generatingContract ? "Generando..." : "Generar y guardar .docx"}
                          </button>
                          {contractDocument ? (
                            <button
                              className="secondary-button"
                              disabled={documentActionId === contractDocument.id}
                              onClick={() => void handleDocumentDownload(contractDocument, "download")}
                              type="button"
                            >
                              Descargar Word
                            </button>
                          ) : null}
                          <button
                            className="secondary-button"
                            disabled={generatingContract || prefillingContract}
                            onClick={() => setContractFormOpen(false)}
                            type="button"
                          >
                            Cerrar formulario
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </>
                ) : (
                  <div className="centered-inline-message">Solo usuarios con permisos de escritura pueden generar contratos laborales.</div>
                )}
              </section>

              <section className="panel labor-file-vacation-format-panel">
                <div className="panel-header">
                  <div>
                    <h2>Generación de formato de vacaciones</h2>
                    <span>Word editable con los días solicitados y resguardo automático en el movimiento de vacaciones.</span>
                  </div>
                  <span className={`status-pill ${latestVacationFormatEvent ? "status-live" : "status-warning"}`}>
                    {latestVacationFormatEvent ? "Formato guardado" : "Pendiente"}
                  </span>
                </div>

                {canWrite ? (
                  <>
                    <div className="labor-file-vacation-format-summary">
                      <div>
                        <strong>{latestVacationFormatEvent?.acceptanceOriginalFileName ?? "Sin formato generado"}</strong>
                        <span>
                          {latestVacationFormatEvent
                            ? `${latestVacationFormatEvent.days} días / ${formatVacationEventDates(latestVacationFormatEvent)}`
                            : "Abre el formulario, selecciona los días y genera el Word del formato de vacaciones."}
                        </span>
                      </div>
                      <div className="labor-file-vacation-format-actions">
                        <button
                          className="primary-button"
                          disabled={generatingVacationFormat}
                          onClick={handleVacationFormatFormToggle}
                          type="button"
                        >
                          {vacationFormatFormOpen ? "Cerrar formulario" : "Abrir formulario"}
                        </button>
                      </div>
                    </div>

                    <div className="labor-file-vacation-conflict-rule">
                      <div>
                        <strong>Regla de equipo</strong>
                        <span>
                          No se puede generar ni autorizar un formato si otra persona del mismo equipo pidió vacaciones en las mismas fechas.
                        </span>
                      </div>
                      <label className="checkbox-row">
                        <input
                          checked={canOverrideVacationConflicts && Boolean(vacationFormatForm.overrideTeamVacationConflict)}
                          disabled={!canOverrideVacationConflicts || generatingVacationFormat}
                          type="checkbox"
                          onChange={(event) =>
                            updateVacationFormatFormField("overrideTeamVacationConflict", event.target.checked)
                          }
                        />
                        <span>Override Eduardo Rusconi</span>
                      </label>
                      <small>
                        {canOverrideVacationConflicts
                          ? "Este override permite continuar aun cuando existan cruces de fechas en el equipo."
                          : "Solo Eduardo Rusconi puede marcar este override."}
                      </small>
                    </div>

                    {vacationFormatFormOpen ? (
                      <form className="labor-file-vacation-format-form" onSubmit={handleVacationFormatGenerate}>
                        <div className="labor-file-vacation-format-form-head">
                          <div>
                            <h3>Datos del formato</h3>
                            <span>Formulario editable para generar el Word en hoja membretada y guardarlo en el expediente.</span>
                          </div>
                          <button
                            className="ghost-button"
                            disabled={generatingVacationFormat}
                            onClick={handleVacationFormatFormReset}
                            type="button"
                          >
                            Restaurar datos
                          </button>
                        </div>

                        <div className="labor-file-vacation-format-stats">
                          <div>
                            <span>Días solicitados</span>
                            <strong>{vacationFormatSelectedDays}</strong>
                          </div>
                          <div>
                            <span>Quedarían pendientes</span>
                            <strong>{vacationFormatProjectedPending}</strong>
                          </div>
                          <div>
                            <span>Programados y autorizados</span>
                            <strong>{vacationFormatProjectedCommitted}</strong>
                          </div>
                        </div>

                        <div className="labor-file-vacation-format-section">
                          <div className="labor-file-vacation-format-section-title">
                            <h4>Selección de días</h4>
                            <span>{vacationFormatSelectedDays} días en el formato</span>
                          </div>

                          <div className="labor-file-vacation-date-tools">
                            <div className="labor-file-vacation-date-group is-range">
                              <h3>Días continuos</h3>
                              <div className="labor-file-vacation-date-row">
                                <label className="form-field">
                                  <span>Inicio</span>
                                  <input
                                    type="date"
                                    value={vacationFormatRange.startDate}
                                    onChange={(event) => setVacationFormatRange((current) => ({ ...current, startDate: event.target.value }))}
                                  />
                                </label>
                                <label className="form-field">
                                  <span>Fin</span>
                                  <input
                                    type="date"
                                    value={vacationFormatRange.endDate}
                                    onChange={(event) => setVacationFormatRange((current) => ({ ...current, endDate: event.target.value }))}
                                  />
                                </label>
                                <button className="secondary-button" onClick={handleVacationFormatRangeAdd} type="button">
                                  Agregar rango
                                </button>
                              </div>
                            </div>
                            <div className="labor-file-vacation-date-group is-single">
                              <h3>Día suelto</h3>
                              <div className="labor-file-vacation-date-row">
                                <label className="form-field">
                                  <span>Fecha</span>
                                  <input
                                    type="date"
                                    value={vacationFormatSingleDate}
                                    onChange={(event) => setVacationFormatSingleDate(event.target.value)}
                                  />
                                </label>
                                <button className="secondary-button" onClick={handleVacationFormatSingleDateAdd} type="button">
                                  Agregar día
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="labor-file-vacation-selected-days">
                            {vacationFormatForm.vacationDates.length === 0 ? (
                              <div className="centered-inline-message">Agrega días continuos o salteados.</div>
                            ) : (
                              <div className="labor-file-vacation-day-chips">
                                {vacationFormatForm.vacationDates.map((date) => (
                                  <button key={date} onClick={() => handleVacationFormatDateRemove(date)} type="button">
                                    {formatDate(date)} <span>Quitar</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="labor-file-vacation-format-section">
                          <div className="labor-file-vacation-format-section-title">
                            <h4>Información del documento</h4>
                            <span>Todos los campos pueden editarse antes de generar</span>
                          </div>
                          <div className="labor-file-vacation-format-field-grid">
                          <label className="form-field">
                            <span>Nombre</span>
                            <input
                              required
                              value={vacationFormatForm.employeeName}
                              onChange={(event) => updateVacationFormatFormField("employeeName", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Fecha del formato</span>
                            <input
                              required
                              type="date"
                              value={vacationFormatForm.requestDate}
                              onChange={(event) => updateVacationFormatFormField("requestDate", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>El interesado</span>
                            <input
                              value={vacationFormatForm.interestedName}
                              onChange={(event) => updateVacationFormatFormField("interestedName", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Autoriza</span>
                            <input
                              value={vacationFormatForm.authorizerName}
                              onChange={(event) => updateVacationFormatFormField("authorizerName", event.target.value)}
                            />
                          </label>
                          <div className="labor-file-vacation-format-accounting">
                            <div>
                              <span>Fecha de ingreso</span>
                              <strong>{formatDate(vacationFormatAccounting.hireDate)}</strong>
                            </div>
                            <div>
                              <span>Fecha de inicio</span>
                              <strong>{formatDate(vacationFormatAccounting.vacationYearStartDate)}</strong>
                            </div>
                            <div>
                              <span>Años cumplidos</span>
                              <strong>{vacationFormatAccounting.completedYearsLabel || "-"}</strong>
                            </div>
                            <div>
                              <span>Días que corresponden</span>
                              <strong>{vacationFormatAccounting.entitlementDays}</strong>
                            </div>
                            <div>
                              <span>Días pendientes</span>
                              <strong>{vacationFormatAccounting.pendingDays}</strong>
                            </div>
                            <div>
                              <span>Días disfrutados</span>
                              <strong>{vacationFormatAccounting.enjoyedDays}</strong>
                            </div>
                          </div>
                          <label className="form-field labor-file-vacation-format-wide-field">
                            <span>Descripción</span>
                            <input
                              value={vacationFormatForm.description}
                              onChange={(event) => updateVacationFormatFormField("description", event.target.value)}
                            />
                          </label>
                          </div>
                        </div>

                        <div className="form-actions">
                          <button className="primary-button" disabled={generatingVacationFormat} type="submit">
                            {generatingVacationFormat ? "Generando..." : "Generar, guardar y contabilizar"}
                          </button>
                          {latestVacationFormatEvent ? (
                            <button
                              className="secondary-button"
                              disabled={vacationFileActionId === latestVacationFormatEvent.id}
                            onClick={() => void handleVacationAcceptanceDownload(latestVacationFormatEvent, "download")}
                            type="button"
                          >
                            {isVacationEventAuthorized(latestVacationFormatEvent) ? "Descargar PDF firmado" : "Descargar formato"}
                          </button>
                          ) : null}
                          <button
                            className="secondary-button"
                            disabled={generatingVacationFormat}
                            onClick={() => setVacationFormatFormOpen(false)}
                            type="button"
                          >
                            Cerrar formulario
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </>
                ) : (
                  <div className="centered-inline-message">Solo usuarios con permisos de escritura pueden generar formatos de vacaciones.</div>
                )}
              </section>

              <section className="panel labor-file-vacations-panel">
                <div className="panel-header">
                  <div>
                    <h2>Contabilización de vacaciones</h2>
                    <span>{selectedLaborFile.vacationSummary.remainingDays} días disponibles</span>
                  </div>
                </div>

                <div className="labor-file-vacation-summary">
                  {selectedLaborFile.vacationSummary.lines.map((line) => {
                    const item = parseVacationSummaryLine(line);
                    return item.kind === "heading" ? (
                      <div className="labor-file-vacation-summary-heading" key={line}>
                        {item.label}
                      </div>
                    ) : (
                      <div className="labor-file-vacation-summary-row" key={line}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    );
                  })}
                </div>

                <div className="labor-file-vacation-accounting-grid">
                  <div>
                    <span>Días ya devengados</span>
                    <strong>{selectedLaborFile.vacationSummary.earnedDays}</strong>
                  </div>
                  <div>
                    <span>Días no devengados</span>
                    <strong>{selectedLaborFile.vacationSummary.unearnedDays}</strong>
                  </div>
                  <div>
                    <span>Programados sin PDF firmado</span>
                    <strong>{selectedLaborFile.vacationSummary.scheduledDays}</strong>
                  </div>
                  <div>
                    <span>Autorizados con PDF firmado</span>
                    <strong>{selectedLaborFile.vacationSummary.authorizedDays}</strong>
                  </div>
                </div>

                <form className="labor-file-previous-year-pending" onSubmit={(event) => void handlePreviousYearPendingSubmit(event, "LAST_YEAR")}>
                  <div className="labor-file-previous-year-pending-head">
                    <div>
                      <h3>Pendientes del último año</h3>
                      <span>
                        Saldo del último año: {formatLongDate(selectedLaborFile.vacationSummary.previousYearStartDate)} al {formatLongDate(selectedLaborFile.vacationSummary.previousYearEndDate)}.
                      </span>
                    </div>
                    <strong>{selectedLaborFile.vacationSummary.previousYearPendingDays} días</strong>
                  </div>

                  <label className={`labor-file-manual-checkbox ${!canManagePreviousYearPending ? "is-disabled" : ""}`}>
                    <input
                      checked={previousYearPendingForm.manualOverrideConfirmed}
                      disabled={!canManagePreviousYearPending || savingPreviousYearPending}
                      type="checkbox"
                      onChange={(event) =>
                        setPreviousYearPendingForm((current) => ({
                          ...current,
                          manualOverrideConfirmed: event.target.checked
                        }))
                      }
                    />
                    <span>
                      Agregar o actualizar manualmente días pendientes del último año ({formatLongDate(selectedLaborFile.vacationSummary.previousYearStartDate)} al {formatLongDate(selectedLaborFile.vacationSummary.previousYearEndDate)})
                    </span>
                  </label>

                  <div className="labor-file-previous-year-pending-fields">
                    <label className="form-field">
                      <span>Días pendientes</span>
                      <input
                        disabled={!canManagePreviousYearPending || !previousYearPendingForm.manualOverrideConfirmed || savingPreviousYearPending}
                        step="0.5"
                        type="number"
                        value={previousYearPendingForm.days}
                        onChange={(event) =>
                          setPreviousYearPendingForm((current) => ({
                            ...current,
                            days: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      <span>Nota</span>
                      <input
                        disabled={!canManagePreviousYearPending || !previousYearPendingForm.manualOverrideConfirmed || savingPreviousYearPending}
                        placeholder="Motivo o referencia del ajuste"
                        value={previousYearPendingForm.description}
                        onChange={(event) =>
                          setPreviousYearPendingForm((current) => ({
                            ...current,
                            description: event.target.value
                          }))
                        }
                      />
                    </label>
                    <button
                      className="secondary-button"
                      disabled={!canManagePreviousYearPending || !previousYearPendingForm.manualOverrideConfirmed || savingPreviousYearPending}
                      type="submit"
                    >
                      {savingPreviousYearPending ? "Guardando..." : "Guardar saldo"}
                    </button>
                  </div>

                  <small>
                    {canManagePreviousYearPending
                      ? "Marcar el checkbox habilita el ajuste manual y reemplaza el saldo pendiente del último año de este expediente."
                      : "Solo el superadmin Eduardo Rusconi puede marcar este checkbox y guardar el ajuste."}
                    {selectedLaborFile.vacationSummary.ignoredPreviousYearPendingDays > 0
                      ? ` No se contabilizan ${selectedLaborFile.vacationSummary.ignoredPreviousYearPendingDays} días de años más antiguos.`
                      : ""}
                  </small>
                </form>

                <form className="labor-file-previous-year-pending" onSubmit={(event) => void handlePreviousYearPendingSubmit(event, "YEAR_BEFORE_LAST")}>
                  <div className="labor-file-previous-year-pending-head">
                    <div>
                      <h3>Pendientes del año inmediato anterior al último año</h3>
                      <span>
                        Saldo del año inmediato anterior al último año: {formatLongDate(selectedLaborFile.vacationSummary.yearBeforeLastStartDate)} al {formatLongDate(selectedLaborFile.vacationSummary.yearBeforeLastEndDate)}.
                      </span>
                    </div>
                    <strong>{selectedLaborFile.vacationSummary.yearBeforeLastPendingDays} días</strong>
                  </div>

                  <label className={`labor-file-manual-checkbox ${!canManagePreviousYearPending ? "is-disabled" : ""}`}>
                    <input
                      checked={yearBeforeLastPendingForm.manualOverrideConfirmed}
                      disabled={!canManagePreviousYearPending || savingPreviousYearPending}
                      type="checkbox"
                      onChange={(event) =>
                        setYearBeforeLastPendingForm((current) => ({
                          ...current,
                          manualOverrideConfirmed: event.target.checked
                        }))
                      }
                    />
                    <span>
                      Agregar o actualizar manualmente días pendientes del año inmediato anterior al último año ({formatLongDate(selectedLaborFile.vacationSummary.yearBeforeLastStartDate)} al {formatLongDate(selectedLaborFile.vacationSummary.yearBeforeLastEndDate)})
                    </span>
                  </label>

                  <div className="labor-file-previous-year-pending-fields">
                    <label className="form-field">
                      <span>Días pendientes</span>
                      <input
                        disabled={!canManagePreviousYearPending || !yearBeforeLastPendingForm.manualOverrideConfirmed || savingPreviousYearPending}
                        step="0.5"
                        type="number"
                        value={yearBeforeLastPendingForm.days}
                        onChange={(event) =>
                          setYearBeforeLastPendingForm((current) => ({
                            ...current,
                            days: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      <span>Nota</span>
                      <input
                        disabled={!canManagePreviousYearPending || !yearBeforeLastPendingForm.manualOverrideConfirmed || savingPreviousYearPending}
                        placeholder="Motivo o referencia del ajuste"
                        value={yearBeforeLastPendingForm.description}
                        onChange={(event) =>
                          setYearBeforeLastPendingForm((current) => ({
                            ...current,
                            description: event.target.value
                          }))
                        }
                      />
                    </label>
                    <button
                      className="secondary-button"
                      disabled={!canManagePreviousYearPending || !yearBeforeLastPendingForm.manualOverrideConfirmed || savingPreviousYearPending}
                      type="submit"
                    >
                      {savingPreviousYearPending ? "Guardando..." : "Guardar saldo"}
                    </button>
                  </div>

                  <small>
                    {canManagePreviousYearPending
                      ? "Marcar el checkbox habilita el ajuste manual y reemplaza el saldo pendiente del año inmediato anterior al último año de este expediente."
                      : "Solo el superadmin Eduardo Rusconi puede marcar este checkbox y guardar el ajuste."}
                  </small>
                </form>

                <div className="labor-file-vacation-events">
                  {selectedLaborFile.vacationEvents.length === 0 ? (
                    <div className="centered-inline-message">Sin vacaciones registradas.</div>
                  ) : selectedLaborFile.vacationEvents.map((event) => {
                    const isAuthorized = isVacationEventAuthorized(event);
                    const isVacationRequest = event.eventType === "VACATION" || event.eventType === "GLOBAL_VACATION";
                    const canDeleteVacationEvent = canDeleteVacationEventForCurrentUser(event);
                    return (
                      <div className={`labor-file-vacation-event ${isAuthorized ? "is-authorized" : "is-scheduled"}`} key={event.id}>
                        <div>
                          <div className="labor-file-vacation-event-title">
                            <strong>{getVacationEventTitle(event)}</strong>
                            {isVacationRequest ? (
                              <span className={`status-pill ${isAuthorized ? "status-live" : "status-warning"}`}>
                                {isAuthorized ? "Autorizado" : "Programado"}
                              </span>
                            ) : null}
                          </div>
                          <span>
                            {event.days} días
                            {formatVacationEventDates(event) ? ` / ${formatVacationEventDates(event)}` : ""}
                          </span>
                          {event.acceptanceOriginalFileName ? <small>Formato: {event.acceptanceOriginalFileName}</small> : null}
                          {isVacationRequest && !isAuthorized ? <small>Pendiente de PDF firmado para autorizar.</small> : null}
                        </div>
                        {event.description ? <small>{event.description}</small> : null}
                        <div className="table-actions">
                          {event.acceptanceOriginalFileName ? (
                            <>
                              <button
                                className="ghost-button"
                                disabled={vacationFileActionId === event.id}
                                onClick={() => void handleVacationAcceptanceDownload(event, "open")}
                                type="button"
                              >
                                Abrir formato
                              </button>
                              <button
                                className="ghost-button"
                                disabled={vacationFileActionId === event.id}
                                onClick={() => void handleVacationAcceptanceDownload(event, "download")}
                                type="button"
                              >
                                Descargar
                              </button>
                            </>
                          ) : null}
                          {canWrite && isVacationRequest && !isAuthorized ? (
                            <label className={`ghost-button labor-file-signed-upload ${signingVacationEventId === event.id ? "is-disabled" : ""}`}>
                              <span>{signingVacationEventId === event.id ? "Cargando..." : "Cargar PDF firmado"}</span>
                              <input
                                accept=".pdf,application/pdf"
                                disabled={signingVacationEventId === event.id}
                                type="file"
                                onChange={(inputEvent) => {
                                  const file = inputEvent.currentTarget.files?.[0];
                                  if (file) {
                                    void handleVacationSignedPdfUpload(event, file);
                                  }
                                  inputEvent.currentTarget.value = "";
                                }}
                              />
                            </label>
                          ) : null}
                          {canDeleteVacationEvent ? (
                            <button
                              className="danger-button"
                              disabled={deletingVacationId === event.id}
                              onClick={() => void handleVacationDelete(event.id)}
                              type="button"
                            >
                              Quitar
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </section>
    </section>
  );
}

interface DocumentRowProps {
  label: string;
  required?: boolean;
  document?: LaborFileDocument;
  canWrite: boolean;
  documentActionId: string | null;
  onDownload: (document: LaborFileDocument, mode: "open" | "download") => Promise<void>;
  onDelete: (document: LaborFileDocument) => Promise<void>;
}

function DocumentRow({
  label,
  required,
  document,
  canWrite,
  documentActionId,
  onDownload,
  onDelete
}: DocumentRowProps) {
  return (
    <div className={`labor-file-document-row ${document ? "is-loaded" : "is-missing"}`}>
      <div>
        <strong>{label}</strong>
        <span>{required ? "Obligatorio" : "Opcional"}</span>
      </div>
      <div>
        <strong>{document?.originalFileName ?? "Pendiente"}</strong>
        <span>{document ? `${formatFileSize(document.fileSizeBytes)} / ${formatDateTime(document.uploadedAt)}` : "-"}</span>
      </div>
      <div className="table-actions">
        {document ? (
          <>
            <button
              className="secondary-button"
              disabled={documentActionId === document.id}
              onClick={() => void onDownload(document, "open")}
              type="button"
            >
              Abrir
            </button>
            <button
              className="secondary-button"
              disabled={documentActionId === document.id}
              onClick={() => void onDownload(document, "download")}
              type="button"
            >
              Descargar
            </button>
            {canWrite ? (
              <button
                className="danger-button"
                disabled={documentActionId === document.id}
                onClick={() => void onDelete(document)}
                type="button"
              >
                Borrar
              </button>
            ) : null}
          </>
        ) : (
          <span className="status-pill status-warning">Falta</span>
        )}
      </div>
    </div>
  );
}

interface MultipleDocumentRowProps {
  label: string;
  required?: boolean;
  documents: LaborFileDocument[];
  maxFiles?: number;
  canWrite: boolean;
  documentActionId: string | null;
  onDownload: (document: LaborFileDocument, mode: "open" | "download") => Promise<void>;
  onDelete: (document: LaborFileDocument) => Promise<void>;
}

function MultipleDocumentRow({
  label,
  required,
  documents,
  maxFiles,
  canWrite,
  documentActionId,
  onDownload,
  onDelete
}: MultipleDocumentRowProps) {
  const limitText = maxFiles ? `${documents.length}/${maxFiles}` : `${documents.length}`;
  const remainingText = maxFiles
    ? documents.length >= maxFiles
      ? "Límite alcanzado"
      : `${maxFiles - documents.length} espacios disponibles`
    : "Múltiples archivos permitidos";

  return (
    <div className={`labor-file-document-row labor-file-document-row-multiple ${documents.length > 0 ? "is-loaded" : "is-missing"}`}>
      <div>
        <strong>{label}</strong>
        <span>{required ? "Obligatorio" : "Opcional"}</span>
      </div>
      <div className="labor-file-multiple-document-summary">
        <strong>{documents.length > 0 ? `${documents.length} archivos cargados` : "Pendiente"}</strong>
        <span>{remainingText}</span>
        {documents.length === 0 ? (
          <small>Sin formatos cargados.</small>
        ) : (
          <div className="labor-file-multiple-document-list">
            {documents.map((document, index) => (
              <div className="labor-file-multiple-document-item" key={document.id}>
                <div>
                  <strong>{index + 1}. {document.originalFileName}</strong>
                  <span>{formatFileSize(document.fileSizeBytes)} / {formatDateTime(document.uploadedAt)}</span>
                </div>
                <div className="table-actions">
                  <button
                    className="ghost-button"
                    disabled={documentActionId === document.id}
                    onClick={() => void onDownload(document, "open")}
                    type="button"
                  >
                    Abrir
                  </button>
                  <button
                    className="ghost-button"
                    disabled={documentActionId === document.id}
                    onClick={() => void onDownload(document, "download")}
                    type="button"
                  >
                    Descargar
                  </button>
                  {canWrite ? (
                    <button
                      className="danger-button"
                      disabled={documentActionId === document.id}
                      onClick={() => void onDelete(document)}
                      type="button"
                    >
                      Borrar
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="table-actions">
        <span className={`status-pill ${documents.length > 0 ? "status-live" : "status-warning"}`}>
          {limitText}
        </span>
      </div>
    </div>
  );
}
