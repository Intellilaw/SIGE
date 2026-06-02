import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type {
  Client,
  ExternalContract,
  ExternalContractGeneratedDocument,
  ExternalContractInpc,
  ExternalContractMilestone,
  ExternalContractMilestoneSource,
  ExternalContractPrefillResult,
  ExternalContractRentIncreaseCalculation,
  ExternalContractRenewal,
  ExternalContractRenewalDocumentKind,
  ExternalContractRenewalDocument,
  ExternalContractRenewalPrefillResult,
  ExternalContractStatus
} from "@sige/contracts";

import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canReadModule, canWriteModule } from "../auth/permissions";

type FlashState =
  | {
      tone: "success" | "error";
      text: string;
    }
  | null;

type ContractFormState = {
  title: string;
  clientId: string;
  propertyAddress: string;
  landlordName: string;
  tenantName: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRentMxn: string;
  status: ExternalContractStatus;
  notes: string;
  renewals: RenewalFormState[];
  milestones: MilestoneFormState[];
};

type RenewalFormState = {
  id?: string;
  sequence?: number;
  documentKind: ExternalContractRenewalDocumentKind;
  renewalDate: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRentMxn: string;
  rentIncreasePct: string;
  inpcBasePeriod: string;
  inpcTargetPeriod: string;
  documents?: ExternalContractRenewalDocument[];
  notes: string;
};

type MilestoneFormState = {
  id?: string;
  source: ExternalContractMilestoneSource;
  title: string;
  dueDate: string;
  description: string;
};

type FormatTemplateId = "rent-increase" | "property-delivery" | "termination-agreement";
type ExternalContractsSection = "contracts" | "milestones" | "inpc";
type ExternalContractStatusView = "active" | "archived";
type ContractMilestoneKind = "renewal" | "lease-end" | "rent-increase" | "manual" | "extracted";
type ContractMilestoneView = {
  id: string;
  contractId: string;
  contractNumber: string;
  contractTitle: string;
  clientName: string;
  propertyAddress: string;
  dueDate: string;
  title: string;
  description?: string;
  kind: ContractMilestoneKind;
  source: "AUTOMATIC" | ExternalContractMilestoneSource;
};
type ManualAlertFormState = {
  title: string;
  dueDate: string;
  description: string;
};
type GeneratedFormat = {
  title: string;
  subtitle: string;
  paragraphs: string[];
  signatures: string[];
};
type RentCalculatorState = {
  rentMxn: string;
  basePeriod: string;
  targetPeriod: string;
};
type RentUpdateFormatPreview = {
  baseLabel: string;
  documentDate: string;
  effectiveDate: string;
  previousRentMxn?: number;
  updatedRentMxn?: number;
  increaseMxn?: number;
  increasePct?: number;
  factor?: number;
  useRoundedRent?: boolean;
  roundedRentMxn?: number;
  presentedRentMxn?: number;
  presentedIncreaseMxn?: number;
  presentedIncreasePct?: number;
  baseInpc?: ExternalContractInpc;
  targetInpc?: ExternalContractInpc;
  basePeriod?: string;
  targetPeriod?: string;
};
type RentUpdateFormatFormState = {
  effectiveDate: string;
  previousRentMxn: string;
  basePeriod: string;
  targetPeriod: string;
  useRoundedRent: boolean;
  roundedRentMxn: string;
};
type RentUpdateFormatGenerationResult = {
  wordDocument: ExternalContractGeneratedDocument;
  pdfDocument: ExternalContractGeneratedDocument;
};
type GeneratedDocumentFormat = "word" | "pdf" | "other";
type GeneratedDocumentGroup = {
  key: string;
  templateTitle: string;
  renewalId?: string;
  createdAt: string;
  word?: ExternalContractGeneratedDocument;
  pdf?: ExternalContractGeneratedDocument;
  other?: ExternalContractGeneratedDocument;
};

const MODULE_TITLE = "Administraci\u00f3n de contratos externos";
const CONTRACT_SECTION_LABEL = "Contratos de arrendamiento";
const INPC_SECTION_LABEL = "INPC";
const FORMAT_SCOPE_ORIGINAL = "original";
const DEFAULT_RENEWAL_DOCUMENT_KIND: ExternalContractRenewalDocumentKind = "NEW_CONTRACT_OR_AGREEMENT";

const initialFormState: ContractFormState = {
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

const initialManualAlertFormState: ManualAlertFormState = {
  title: "",
  dueDate: "",
  description: ""
};

const initialRentUpdateFormatFormState: RentUpdateFormatFormState = {
  effectiveDate: "",
  previousRentMxn: "",
  basePeriod: "",
  targetPeriod: "",
  useRoundedRent: false,
  roundedRentMxn: ""
};

const formatTemplateLabels: Record<FormatTemplateId, string> = {
  "rent-increase": "Formato de aumento de renta",
  "property-delivery": "Carta de entrega recepcion de inmueble",
  "termination-agreement": "Convenio de rescision"
};

const renewalDocumentKindLabels: Record<ExternalContractRenewalDocumentKind, string> = {
  NEW_CONTRACT_OR_AGREEMENT: "Nuevo contrato o convenio",
  RENT_UPDATE_FORMAT: "Formato de actualizaci\u00f3n de renta"
};

const renewalDocumentKindOptions: Array<{
  value: ExternalContractRenewalDocumentKind;
  label: string;
}> = [
  { value: "NEW_CONTRACT_OR_AGREEMENT", label: renewalDocumentKindLabels.NEW_CONTRACT_OR_AGREEMENT },
  { value: "RENT_UPDATE_FORMAT", label: renewalDocumentKindLabels.RENT_UPDATE_FORMAT }
];

const initialRentCalculatorState: RentCalculatorState = {
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

function createEmptyRenewal(): RenewalFormState {
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

function renewalLabel(index: number) {
  return renewalOrdinalLabels[index] ?? `Renovacion ${index + 1}`;
}

function dateInputValue(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("es-MX");
}

function formatLongDate(value?: string) {
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

function formatCurrency(value?: number) {
  if (!value) {
    return "-";
  }

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(value);
}

function formatPercent(value?: number) {
  if (!value) {
    return "-";
  }

  return `${value.toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`;
}

function formatSignedPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function formatInpcValue(value?: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return value.toLocaleString("es-MX", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 6
  });
}

function formatInpcPeriod(record?: ExternalContractInpc) {
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

function inpcPeriodKey(record: ExternalContractInpc) {
  return `${record.periodYear}-${String(record.periodMonth).padStart(2, "0")}`;
}

function sortInpcAsc(items: ExternalContractInpc[]) {
  return [...items].sort((left, right) => left.periodDate.localeCompare(right.periodDate));
}

function sortInpcDesc(items: ExternalContractInpc[]) {
  return [...items].sort((left, right) => right.periodDate.localeCompare(left.periodDate));
}

function getDefaultInpcTargetPeriod(items: ExternalContractInpc[]) {
  return sortInpcDesc(items)[0] ? inpcPeriodKey(sortInpcDesc(items)[0]) : "";
}

function getDefaultInpcBasePeriod(items: ExternalContractInpc[]) {
  const sortedDesc = sortInpcDesc(items);
  const latest = sortedDesc[0];
  if (!latest) {
    return "";
  }

  const annualBase = items.find((record) => record.periodYear === latest.periodYear - 1 && record.periodMonth === latest.periodMonth);
  return annualBase ? inpcPeriodKey(annualBase) : inpcPeriodKey(sortInpcAsc(items)[0]);
}

function calculateRentIncreaseFromInpc(
  items: ExternalContractInpc[],
  state: RentCalculatorState
): ExternalContractRentIncreaseCalculation | null {
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

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function numberToInputValue(value?: number) {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return "";
  }

  return String(value);
}

function parseEditableNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getBaseRentForRenewal(contract: ExternalContract, renewal: ExternalContractRenewal) {
  const previousRenewal = contract.renewals.find((entry) => entry.sequence === renewal.sequence - 1);
  return renewal.monthlyRentMxn ?? previousRenewal?.monthlyRentMxn ?? contract.monthlyRentMxn;
}

function dateToInpcPeriodKey(value?: string) {
  if (!isValidDateKey(value)) {
    return "";
  }

  return value!.slice(0, 7);
}

function resolveInpcRecord(
  inpcRecords: ExternalContractInpc[],
  periodKey: string,
  fallbackToLatest = false
) {
  const exact = inpcRecords.find((record) => inpcPeriodKey(record) === periodKey);
  if (exact || !fallbackToLatest) {
    return exact;
  }

  return sortInpcDesc(inpcRecords)[0];
}

function resolveInpcRecordOnOrBefore(inpcRecords: ExternalContractInpc[], periodKey: string) {
  const sorted = sortInpcAsc(inpcRecords);
  const previous = sorted.filter((record) => inpcPeriodKey(record) <= periodKey).at(-1);

  return previous ?? sorted[0];
}

function resolveRentUpdateBaseInpc(
  inpcRecords: ExternalContractInpc[],
  renewal: ExternalContractRenewal,
  desiredBasePeriod: string,
  selectedBasePeriod?: string
) {
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

function buildRentUpdateFormatPreview(
  contract: ExternalContract,
  renewal: ExternalContractRenewal,
  documentDate: string,
  inpcRecords: ExternalContractInpc[],
  overrides: Partial<RentUpdateFormatFormState> = {}
): RentUpdateFormatPreview {
  const baseEffectiveDate = renewal.leaseStartDate || renewal.renewalDate || documentDate;
  const effectiveDate = isValidDateKey(overrides.effectiveDate) ? overrides.effectiveDate! : addYearsDateKey(baseEffectiveDate, 1);
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

function formatFileSize(value?: number) {
  if (!value) {
    return "Sin archivo";
  }

  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function inferGeneratedDocumentFormat(document: ExternalContractGeneratedDocument): GeneratedDocumentFormat {
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

function generatedDocumentStem(document: ExternalContractGeneratedDocument) {
  return document.originalFileName
    .trim()
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase();
}

function groupGeneratedDocuments(documents: ExternalContractGeneratedDocument[]): GeneratedDocumentGroup[] {
  const groups = new Map<string, GeneratedDocumentGroup>();

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
    } else if (format === "word") {
      group.word = document;
    } else {
      group.other = document;
    }

    if (document.createdAt > group.createdAt) {
      group.createdAt = document.createdAt;
    }

    groups.set(key, group);
  });

  return [...groups.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function getGeneratedDocumentGroupDocuments(group: GeneratedDocumentGroup) {
  return [group.word, group.pdf, group.other].filter(
    (document): document is ExternalContractGeneratedDocument => Boolean(document)
  );
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

function sortClients(items: Client[]) {
  return [...items].sort((left, right) =>
    left.name.localeCompare(right.name, "es-MX", { numeric: true, sensitivity: "base" })
  );
}

function sortContracts(items: ExternalContract[]) {
  return [...items].sort((left, right) =>
    left.contractNumber.localeCompare(right.contractNumber, "es-MX", { numeric: true, sensitivity: "base" })
  );
}

function groupContractsByClient(items: ExternalContract[]) {
  const groups = new Map<string, { key: string; label: string; contracts: ExternalContract[] }>();

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

  return [...groups.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "es-MX", { numeric: true, sensitivity: "base" })
  );
}

function parseOptionalNumber(value: string, label: string) {
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

function isSupportedContractFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    file.type === "application/pdf"
    || file.type === "application/msword"
    || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || name.endsWith(".pdf")
    || name.endsWith(".doc")
    || name.endsWith(".docx")
  );
}

function isSupportedContractPrefillFile(file: File) {
  const name = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();
  return (
    mimeType === "application/pdf"
    || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || name.endsWith(".pdf")
    || name.endsWith(".docx")
  );
}

function toRenewalDocumentKind(value?: string | null): ExternalContractRenewalDocumentKind {
  return value === "RENT_UPDATE_FORMAT" ? "RENT_UPDATE_FORMAT" : DEFAULT_RENEWAL_DOCUMENT_KIND;
}

function hasRenewalFormContent(renewal: RenewalFormState) {
  return Boolean(
    renewal.documentKind
    || renewal.renewalDate.trim()
    || renewal.leaseStartDate.trim()
    || renewal.leaseEndDate.trim()
    || renewal.monthlyRentMxn.trim()
    || renewal.rentIncreasePct.trim()
    || renewal.inpcBasePeriod.trim()
    || renewal.inpcTargetPeriod.trim()
    || renewal.notes.trim()
  );
}

function toRenewalFormState(renewal: ExternalContractRenewal): RenewalFormState {
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

function toMilestoneFormState(milestone: ExternalContractMilestone): MilestoneFormState {
  return {
    id: milestone.id,
    source: milestone.source,
    title: milestone.title,
    dueDate: milestone.dueDate,
    description: milestone.description ?? ""
  };
}

function createExtractedMilestone(date: ExternalContractPrefillResult["importantDates"][number]): MilestoneFormState {
  return {
    source: "EXTRACTED",
    title: date.title,
    dueDate: date.dueDate,
    description: date.description
  };
}

function mergeMilestoneForms(current: MilestoneFormState[], incoming: MilestoneFormState[]) {
  const seen = new Set<string>();

  return [...current, ...incoming].filter((milestone) => {
    const key = `${normalizeSearchValue(milestone.source)}|${normalizeSearchValue(milestone.title)}|${milestone.dueDate}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return Boolean(milestone.title.trim() && milestone.dueDate.trim());
  });
}

function mergePrefillFields(current: ContractFormState, fields: ExternalContractPrefillResult["fields"]): ContractFormState {
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

function mergeRenewalPrefillFields(
  current: RenewalFormState,
  fields: ExternalContractRenewalPrefillResult["fields"]
): RenewalFormState {
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

function isRentUpdateRenewal(renewal: RenewalFormState) {
  return renewal.documentKind === "RENT_UPDATE_FORMAT";
}

function getRenewalDateLabel(renewal: RenewalFormState) {
  return isRentUpdateRenewal(renewal) ? "Fecha de formato" : "Fecha de renovación";
}

function getRenewalStartDateLabel(renewal: RenewalFormState) {
  return isRentUpdateRenewal(renewal) ? "Inicio de aplicación de nueva renta" : "Inicio de vigencia";
}

function deadlineStatus(value?: string) {
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

function valueOrFallback(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function getRenewalDisplayDate(renewal?: ExternalContractRenewal) {
  return renewal?.renewalDate || renewal?.leaseStartDate || renewal?.leaseEndDate;
}

function getNextRenewal(contract: ExternalContract) {
  const today = dateInputValue(new Date());
  const datedRenewals = contract.renewals
    .map((renewal) => ({ renewal, date: getRenewalDisplayDate(renewal) }))
    .filter((entry): entry is { renewal: ExternalContractRenewal; date: string } => Boolean(entry.date))
    .sort((left, right) => left.date.localeCompare(right.date));

  return datedRenewals.find((entry) => entry.date >= today)?.renewal ?? datedRenewals.at(-1)?.renewal;
}

function getLatestRenewal(contract: ExternalContract) {
  return [...contract.renewals].sort((left, right) => right.sequence - left.sequence)[0];
}

function isValidDateKey(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isFutureOrToday(value?: string) {
  return Boolean(isValidDateKey(value) && value! >= dateInputValue(new Date()));
}

function addYearsDateKey(value: string, years: number) {
  const source = new Date(`${value}T12:00:00`);
  if (Number.isNaN(source.getTime())) {
    return "";
  }

  const next = new Date(source);
  next.setFullYear(source.getFullYear() + years);
  return dateInputValue(next);
}

function nextAnnualDateFrom(value?: string) {
  if (!isValidDateKey(value)) {
    return "";
  }

  let next = value!.slice(0, 10);
  const today = dateInputValue(new Date());
  while (next < today) {
    next = addYearsDateKey(next, 1);
  }

  return next;
}

function getLatestRenewalBasisDate(contract: ExternalContract) {
  const datedRenewals = contract.renewals
    .map((renewal) => getRenewalDisplayDate(renewal) || renewal.leaseStartDate)
    .filter((value): value is string => isValidDateKey(value))
    .sort((left, right) => right.localeCompare(left));

  return datedRenewals[0] ?? contract.leaseStartDate;
}

function getNextRentIncreaseDate(contract: ExternalContract) {
  if (isValidDateKey(contract.rentIncreaseDate)) {
    return nextAnnualDateFrom(contract.rentIncreaseDate);
  }

  const basisDate = getLatestRenewalBasisDate(contract);
  if (!isValidDateKey(basisDate)) {
    return "";
  }

  return nextAnnualDateFrom(addYearsDateKey(basisDate, 1));
}

function baseContractMilestone(contract: ExternalContract, dueDate: string, title: string, kind: ContractMilestoneKind, description?: string): ContractMilestoneView {
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

function getContractMilestones(contract: ExternalContract) {
  const milestones: ContractMilestoneView[] = [];

  if (isFutureOrToday(contract.renewalDate)) {
    milestones.push(baseContractMilestone(contract, contract.renewalDate!, "Renovación del contrato", "renewal"));
  }

  contract.renewals.forEach((renewal) => {
    const renewalDate = getRenewalDisplayDate(renewal);
    if (isFutureOrToday(renewalDate)) {
      milestones.push(baseContractMilestone(contract, renewalDate!, `${renewalLabel(renewal.sequence - 1)}`, "renewal"));
    }

    if (isFutureOrToday(renewal.leaseEndDate)) {
      milestones.push(baseContractMilestone(contract, renewal.leaseEndDate!, `Fin de vigencia - ${renewalLabel(renewal.sequence - 1)}`, "lease-end"));
    }
  });

  if (isFutureOrToday(contract.leaseEndDate)) {
    milestones.push(baseContractMilestone(contract, contract.leaseEndDate!, "Fin de vigencia del contrato", "lease-end"));
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

function mergeContractMilestones(milestones: ContractMilestoneView[]) {
  const grouped = new Map<string, ContractMilestoneView>();

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

function milestoneKindLabel(kind: ContractMilestoneKind) {
  const labels: Record<ContractMilestoneKind, string> = {
    renewal: "Renovación",
    "lease-end": "Fin de vigencia",
    "rent-increase": "Aumento de renta",
    manual: "Alerta manual",
    extracted: "Fecha extraída"
  };

  return labels[kind];
}

function buildGeneratedFormat(contract: ExternalContract, templateId: FormatTemplateId, documentDate: string): GeneratedFormat {
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

function formatFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "formato";
}

function downloadWordFormat(format: GeneratedFormat, filename: string) {
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

async function downloadPdfFormat(format: GeneratedFormat, filename: string) {
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
  const [activeSection, setActiveSection] = useState<ExternalContractsSection>("contracts");
  const [contracts, setContracts] = useState<ExternalContract[]>([]);
  const [inpcRecords, setInpcRecords] = useState<ExternalContractInpc[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState<ContractFormState>(initialFormState);
  const [rentCalculator, setRentCalculator] = useState<RentCalculatorState>(initialRentCalculatorState);
  const [activeRenewalIndex, setActiveRenewalIndex] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [query, setQuery] = useState("");
  const [contractClientFilterId, setContractClientFilterId] = useState("");
  const [contractStatusView, setContractStatusView] = useState<ExternalContractStatusView>("active");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [managedRenewals, setManagedRenewals] = useState<RenewalFormState[]>([]);
  const [manualAlertForm, setManualAlertForm] = useState<ManualAlertFormState>(initialManualAlertFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRenewals, setSavingRenewals] = useState(false);
  const [savingManualAlert, setSavingManualAlert] = useState(false);
  const [prefillingContract, setPrefillingContract] = useState(false);
  const [prefillingRenewalKey, setPrefillingRenewalKey] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploadingRenewalDocumentId, setUploadingRenewalDocumentId] = useState<string | null>(null);
  const [downloadingRenewalDocumentId, setDownloadingRenewalDocumentId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [formatContractId, setFormatContractId] = useState("");
  const [formatRenewalId, setFormatRenewalId] = useState(FORMAT_SCOPE_ORIGINAL);
  const [formatTemplateId, setFormatTemplateId] = useState<FormatTemplateId>("rent-increase");
  const [formatDateValue, setFormatDateValue] = useState(dateInputValue(new Date()));
  const [rentUpdateFormatForm, setRentUpdateFormatForm] = useState<RentUpdateFormatFormState>(initialRentUpdateFormatFormState);
  const [generatingFormat, setGeneratingFormat] = useState(false);
  const [downloadingGeneratedDocumentId, setDownloadingGeneratedDocumentId] = useState<string | null>(null);
  const [deletingGeneratedDocumentGroupKey, setDeletingGeneratedDocumentGroupKey] = useState<string | null>(null);
  const [contractPrefillNotes, setContractPrefillNotes] = useState<string[]>([]);
  const [flash, setFlash] = useState<FlashState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadModule() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [contractRows, clientRows, inpcRows] = await Promise.all([
        canRead ? apiGet<ExternalContract[]>("/external-contracts") : Promise.resolve([]),
        canWrite ? apiGet<Client[]>("/clients") : Promise.resolve([]),
        canRead ? apiGet<ExternalContractInpc[]>("/external-contracts/inpc") : Promise.resolve([])
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

    void loadModule();
  }, [canRead, canWrite]);

  const leaseContracts = useMemo(
    () => contracts.filter((contract) => contract.contractType === "LEASE"),
    [contracts]
  );
  const activeLeaseCount = useMemo(
    () => leaseContracts.filter((contract) => contract.status === "ACTIVE").length,
    [leaseContracts]
  );
  const archivedLeaseCount = useMemo(
    () => leaseContracts.filter((contract) => contract.status !== "ACTIVE").length,
    [leaseContracts]
  );

  const filteredContracts = useMemo(() => {
    const search = normalizeSearchValue(query);
    const visibleContracts = leaseContracts.filter((contract) =>
      (contractStatusView === "active" ? contract.status === "ACTIVE" : contract.status !== "ACTIVE")
      && (!contractClientFilterId || contract.clientId === contractClientFilterId)
    );

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
  const selectedManagedContract = useMemo(
    () => filteredContracts.find((contract) => contract.id === selectedContractId)
      ?? filteredContracts[0],
    [filteredContracts, selectedContractId]
  );
  const selectedFormatContract = useMemo(
    () => selectedManagedContract ?? contracts.find((contract) => contract.id === formatContractId) ?? contracts[0],
    [contracts, formatContractId, selectedManagedContract]
  );
  const selectedFormatRenewals = useMemo(() => {
    const storedRenewals = selectedFormatContract?.renewals ?? [];

    if (!selectedFormatContract || selectedFormatContract.id !== selectedManagedContract?.id) {
      return storedRenewals;
    }

    const retainedSavedRenewalIds = new Set(
      managedRenewals
        .map((renewal) => renewal.id)
        .filter((id): id is string => Boolean(id))
    );

    return storedRenewals.filter((renewal) => retainedSavedRenewalIds.has(renewal.id));
  }, [managedRenewals, selectedFormatContract, selectedManagedContract?.id]);
  const latestSelectedFormatRenewal = useMemo(
    () => [...selectedFormatRenewals].sort((left, right) => right.sequence - left.sequence)[0],
    [selectedFormatRenewals]
  );
  const selectedFormatRenewal = useMemo(
    () => formatRenewalId === FORMAT_SCOPE_ORIGINAL
      ? undefined
      : selectedFormatRenewals.find((renewal) => renewal.id === formatRenewalId)
      ?? latestSelectedFormatRenewal,
    [latestSelectedFormatRenewal, selectedFormatRenewals, formatRenewalId]
  );
  const inpcRowsAsc = useMemo(() => sortInpcAsc(inpcRecords), [inpcRecords]);
  const inpcRowsDesc = useMemo(() => sortInpcDesc(inpcRecords), [inpcRecords]);
  const latestInpc = inpcRowsDesc[0];
  const previousInpcById = useMemo(() => {
    const recordsById = new Map<string, ExternalContractInpc>();
    inpcRowsAsc.forEach((record, index) => {
      const previous = inpcRowsAsc[index - 1];
      if (previous) {
        recordsById.set(record.id, previous);
      }
    });

    return recordsById;
  }, [inpcRowsAsc]);
  const rentIncreaseCalculation = useMemo(
    () => calculateRentIncreaseFromInpc(inpcRecords, rentCalculator),
    [inpcRecords, rentCalculator]
  );
  const allContractMilestones = useMemo(
    () => contracts.flatMap((contract) => getContractMilestones(contract)),
    [contracts]
  );

  useEffect(() => {
    if (filteredContracts.length === 0) {
      setSelectedContractId("");
      return;
    }

    setSelectedContractId((current) =>
      current && filteredContracts.some((contract) => contract.id === current)
        ? current
        : filteredContracts[0].id
    );
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

    const preview = buildRentUpdateFormatPreview(
      selectedFormatContract,
      selectedFormatRenewal,
      formatDateValue || dateInputValue(new Date()),
      inpcRecords
    );
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

  function updateForm<K extends keyof ContractFormState>(key: K, value: ContractFormState[K]) {
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

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setContractPrefillNotes([]);
    setFlash(null);

    if (file && isSupportedContractPrefillFile(file)) {
      void handleContractPrefill(file);
    }
  }

  function startEdit(contract: ExternalContract) {
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
      const result = await apiPost<ExternalContractPrefillResult>("/external-contracts/prefill", {
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
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
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

  function updateRenewal<K extends keyof RenewalFormState>(index: number, key: K, value: RenewalFormState[K]) {
    setForm((current) => ({
      ...current,
      renewals: current.renewals.map((renewal, renewalIndex) =>
        renewalIndex === index ? { ...renewal, [key]: value } : renewal
      )
    }));
    setFlash(null);
  }

  function removeRenewal(index: number) {
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

  function updateManagedRenewal<K extends keyof RenewalFormState>(index: number, key: K, value: RenewalFormState[K]) {
    setManagedRenewals((current) => current.map((renewal, renewalIndex) =>
      renewalIndex === index ? { ...renewal, [key]: value } : renewal
    ));
    setFlash(null);
  }

  async function removeManagedRenewal(index: number) {
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
      const updated = await apiPatch<ExternalContract>(
        `/external-contracts/${encodeURIComponent(selectedManagedContract.id)}`,
        { renewals: buildRenewalPayload(nextRenewals) }
      );
      const updatedRenewals = updated.renewals.map(toRenewalFormState);

      setContracts((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setManagedRenewals(updatedRenewals);
      setActiveRenewalIndex((currentIndex) => Math.min(currentIndex, Math.max(updatedRenewals.length - 1, 0)));
      setFormatRenewalId((current) =>
        current === renewalToRemove.id
          ? getLatestRenewal(updated)?.id ?? FORMAT_SCOPE_ORIGINAL
          : current
      );
      setFlash({ tone: "success", text: "Renovación eliminada del contrato." });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSavingRenewals(false);
    }
  }

  function buildRenewalPayload(renewals: RenewalFormState[]) {
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

  function buildMilestonePayload(milestones: MilestoneFormState[]) {
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

  function contractMilestonesToForm(contract: ExternalContract) {
    return (contract.milestones ?? []).map(toMilestoneFormState);
  }

  async function saveManagedRenewals() {
    if (!canWrite || !selectedManagedContract) {
      return;
    }

    setSavingRenewals(true);
    setFlash(null);

    try {
      const updated = await apiPatch<ExternalContract>(
        `/external-contracts/${encodeURIComponent(selectedManagedContract.id)}`,
        { renewals: buildRenewalPayload(managedRenewals) }
      );
      setContracts((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setManagedRenewals(updated.renewals.map(toRenewalFormState));
      setFormatRenewalId(getLatestRenewal(updated)?.id ?? FORMAT_SCOPE_ORIGINAL);
      setFlash({ tone: "success", text: "Renovaciones actualizadas." });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSavingRenewals(false);
    }
  }

  function updateManualAlertForm<K extends keyof ManualAlertFormState>(key: K, value: ManualAlertFormState[K]) {
    setManualAlertForm((current) => ({ ...current, [key]: value }));
    setFlash(null);
  }

  function updateRentUpdateFormatForm<K extends keyof RentUpdateFormatFormState>(
    key: K,
    value: RentUpdateFormatFormState[K]
  ) {
    setRentUpdateFormatForm((current) => ({ ...current, [key]: value }));
    setFlash(null);
  }

  async function saveManualAlert(contract: ExternalContract) {
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
          source: "MANUAL" as const,
          title: manualAlertForm.title,
          dueDate: manualAlertForm.dueDate,
          description: manualAlertForm.description
        }
      ];
      const updated = await apiPatch<ExternalContract>(
        `/external-contracts/${encodeURIComponent(contract.id)}`,
        { milestones: buildMilestonePayload(milestones) }
      );

      setContracts((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setManualAlertForm(initialManualAlertFormState);
      setFlash({ tone: "success", text: "Alerta agregada al contrato." });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSavingManualAlert(false);
    }
  }

  async function removeContractMilestone(contract: ExternalContract, milestoneId: string) {
    if (!canWrite) {
      return;
    }

    setSavingManualAlert(true);
    setFlash(null);

    try {
      const updated = await apiPatch<ExternalContract>(
        `/external-contracts/${encodeURIComponent(contract.id)}`,
        {
          milestones: buildMilestonePayload(
            contractMilestonesToForm(contract).filter((milestone) => milestone.id !== milestoneId)
          )
        }
      );

      setContracts((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setFlash({ tone: "success", text: "Alerta retirada del contrato." });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSavingManualAlert(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
        const updated = await apiPatch<ExternalContract>(`/external-contracts/${encodeURIComponent(editingId)}`, payload);
        setContracts((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
        setFlash({ tone: "success", text: `Contrato ${updated.contractNumber} actualizado.` });
      } else {
        const created = await apiPost<ExternalContract>("/external-contracts", payload);
        setContracts((current) => [created, ...current]);
        setFormatContractId((current) => current || created.id);
        setSelectedContractId(created.id);
        setFlash({ tone: "success", text: `Contrato ${created.contractNumber} cargado correctamente.` });
      }

      resetForm(false);
      event.currentTarget.reset();
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload(contract: ExternalContract) {
    setDownloadingId(contract.id);
    setFlash(null);

    try {
      const { blob, filename } = await apiDownload(`/external-contracts/${encodeURIComponent(contract.id)}/document`);
      downloadBlobFile(blob, filename ?? contract.originalFileName ?? `${contract.contractNumber}.bin`);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleGeneratedDocumentDownload(
    contract: ExternalContract,
    document: ExternalContractGeneratedDocument
  ) {
    setDownloadingGeneratedDocumentId(document.id);
    setFlash(null);

    try {
      const { blob, filename } = await apiDownload(
        `/external-contracts/${encodeURIComponent(contract.id)}/generated-documents/${encodeURIComponent(document.id)}`
      );
      downloadBlobFile(blob, filename ?? document.originalFileName);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDownloadingGeneratedDocumentId(null);
    }
  }

  async function handleGeneratedDocumentGroupDelete(contract: ExternalContract, group: GeneratedDocumentGroup) {
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
      const results = await Promise.allSettled(
        documents.map((document) =>
          apiDelete(`/external-contracts/${encodeURIComponent(contract.id)}/generated-documents/${encodeURIComponent(document.id)}`)
        )
      );
      const deletedIds = new Set(
        documents
          .filter((_, index) => results[index]?.status === "fulfilled")
          .map((document) => document.id)
      );
      const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");

      if (deletedIds.size > 0) {
        setContracts((current) => current.map((entry) => entry.id === contract.id
          ? {
              ...entry,
              generatedDocuments: (entry.generatedDocuments ?? []).filter((document) => !deletedIds.has(document.id))
            }
          : entry
        ));
      }

      if (failed) {
        setFlash({ tone: "error", text: `No se pudieron borrar todos los archivos del formato. ${toErrorMessage(failed.reason)}` });
        return;
      }

      setFlash({ tone: "success", text: "Formato borrado." });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDeletingGeneratedDocumentGroupKey(null);
    }
  }

  async function uploadRenewalDocument(
    contract: ExternalContract,
    renewal: RenewalFormState,
    file: File | null
  ): Promise<ExternalContractRenewalDocument | null> {
    if (!file || !renewal.id) {
      return null;
    }

    if (!isSupportedContractFile(file)) {
      throw new Error("El documento debe ser Word (.doc/.docx) o PDF.");
    }

    setUploadingRenewalDocumentId(renewal.id);

    try {
      const document = await apiPost<ExternalContractRenewalDocument>(
        `/external-contracts/${encodeURIComponent(contract.id)}/renewals/${encodeURIComponent(renewal.id)}/documents`,
        {
          documentType: renewal.documentKind,
          originalFileName: file.name,
          fileMimeType: file.type || "application/octet-stream",
          fileBase64: await fileToBase64(file)
        }
      );

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
        : entry
      ));
      setManagedRenewals((current) => current.map((entry) => entry.id === renewal.id
        ? {
            ...entry,
            documents: [
              document,
              ...(entry.documents ?? []).filter((item) => item.id !== document.id)
            ]
          }
        : entry
      ));
      return document;
    } finally {
      setUploadingRenewalDocumentId(null);
    }
  }

  async function handleRenewalDocumentSelection(
    source: "form" | "managed",
    index: number,
    renewal: RenewalFormState,
    file: File | null,
    contract?: ExternalContract
  ) {
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

      const result = await apiPost<ExternalContractRenewalPrefillResult>("/external-contracts/renewals/prefill", {
        documentKind: renewal.documentKind,
        originalFileName: file.name,
        fileMimeType: file.type || "application/octet-stream",
        fileBase64: await fileToBase64(file)
      });

      if (source === "form") {
        setForm((current) => ({
          ...current,
          renewals: current.renewals.map((entry, entryIndex) =>
            entryIndex === index ? mergeRenewalPrefillFields(entry, result.fields) : entry
          )
        }));
      } else {
        setManagedRenewals((current) => current.map((entry, entryIndex) =>
          entryIndex === index ? mergeRenewalPrefillFields(entry, result.fields) : entry
        ));
      }

      setFlash({
        tone: "success",
        text: uploadedDocument
          ? "Documento de renovación cargado y datos extraídos con IA."
          : "Datos de la renovación extraídos con IA. Guarda la renovación para conservarlos."
      });
    } catch (error) {
      setFlash({
        tone: "error",
        text: uploadedDocument ? `El documento se cargo, pero ${toErrorMessage(error)}` : toErrorMessage(error)
      });
    } finally {
      setPrefillingRenewalKey(null);
    }
  }

  async function handleRenewalDocumentDownload(
    contract: ExternalContract,
    renewal: RenewalFormState,
    document: ExternalContractRenewalDocument
  ) {
    if (!renewal.id) {
      return;
    }

    setDownloadingRenewalDocumentId(document.id);
    setFlash(null);

    try {
      const { blob, filename } = await apiDownload(
        `/external-contracts/${encodeURIComponent(contract.id)}/renewals/${encodeURIComponent(renewal.id)}/documents/${encodeURIComponent(document.id)}`
      );
      downloadBlobFile(blob, filename ?? document.originalFileName);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDownloadingRenewalDocumentId(null);
    }
  }

  async function handleDelete(contract: ExternalContract) {
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
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDeletingId(null);
    }
  }

  function buildRentUpdateFormatPayload(preview: RentUpdateFormatPreview) {
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

  function getRentUpdateFormatIssue(preview: RentUpdateFormatPreview | null, scopeValue: string) {
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

  async function handleFormatDownload(output: "word" | "pdf") {
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
        const rentUpdatePreview = buildRentUpdateFormatPreview(
          selectedFormatContract,
          selectedFormatRenewal,
          formatDateValue || dateInputValue(new Date()),
          inpcRecords,
          rentUpdateFormatForm
        );
        const generated = await apiPost<RentUpdateFormatGenerationResult>(
          `/external-contracts/${encodeURIComponent(selectedFormatContract.id)}/formats/rent-increase`,
          buildRentUpdateFormatPayload(rentUpdatePreview)
        );
        const generatedDocuments = [generated.wordDocument, generated.pdfDocument];
        const downloadDocument = output === "pdf" ? generated.pdfDocument : generated.wordDocument;

        setContracts((current) => current.map((entry) => entry.id === selectedFormatContract.id
          ? {
              ...entry,
              generatedDocuments: [
                ...generatedDocuments,
                ...(entry.generatedDocuments ?? []).filter((document) =>
                  !generatedDocuments.some((generatedDocument) => generatedDocument.id === document.id)
                )
              ]
            }
          : entry
        ));

        const { blob, filename } = await apiDownload(
          `/external-contracts/${encodeURIComponent(selectedFormatContract.id)}/generated-documents/${encodeURIComponent(downloadDocument.id)}`
        );
        downloadBlobFile(blob, filename ?? downloadDocument.originalFileName);
        await loadModule();
        if (generated.wordDocument.renewalId) {
          setFormatRenewalId(generated.wordDocument.renewalId);
        }
        setFlash({ tone: "success", text: "Formato de actualización de renta generado y guardado con Word y PDF." });
      } catch (error) {
        setFlash({ tone: "error", text: toErrorMessage(error) });
      } finally {
        setGeneratingFormat(false);
      }

      return;
    }

    const generatedFormat = buildGeneratedFormat(selectedFormatContract, formatTemplateId, formatDateValue);
    const filename = formatFilename(`${formatTemplateLabels[formatTemplateId]} ${selectedFormatContract.contractNumber}`);

    try {
      if (output === "pdf") {
        await downloadPdfFormat(generatedFormat, filename);
      } else {
        downloadWordFormat(generatedFormat, filename);
      }
      setFlash({ tone: "success", text: `${formatTemplateLabels[formatTemplateId]} generado.` });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    }
  }

  function updateRentCalculator<K extends keyof RentCalculatorState>(key: K, value: RentCalculatorState[K]) {
    setRentCalculator((current) => ({ ...current, [key]: value }));
    setFlash(null);
  }

  function renderRenewalDocumentKindField(
    source: "form" | "managed",
    index: number,
    renewal: RenewalFormState,
    disabled: boolean
  ) {
    return (
      <label className="form-field">
        <span>Documento a cargar</span>
        <select
          value={renewal.documentKind}
          onChange={(event) => {
            const value = toRenewalDocumentKind(event.target.value);
            if (source === "form") {
              updateRenewal(index, "documentKind", value);
            } else {
              updateManagedRenewal(index, "documentKind", value);
            }
          }}
          disabled={disabled}
        >
          {renewalDocumentKindOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderRenewalExtractionPanel(
    source: "form" | "managed",
    index: number,
    renewal: RenewalFormState,
    disabled: boolean,
    contract?: ExternalContract
  ) {
    const renewalKey = `${source}-${renewal.id ?? index}`;
    const busy = prefillingRenewalKey === renewalKey || uploadingRenewalDocumentId === renewal.id;

    return (
      <div className="external-contract-renewal-extraction internal-contracts-wide-field">
        <div>
          <strong>Documento para extraer datos</strong>
          <span>{renewalDocumentKindLabels[renewal.documentKind]}</span>
        </div>
        <label className={`secondary-button external-contract-renewal-document-upload ${disabled || busy ? "is-disabled" : ""}`}>
          {busy ? "Procesando..." : "Cargar documento"}
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              void handleRenewalDocumentSelection(source, index, renewal, file, contract);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
    );
  }

  function renderRenewalsEditor() {
    const activeRenewal = form.renewals[activeRenewalIndex];

    return (
      <section className="external-contract-renewals-editor internal-contracts-wide-field">
        <div className="external-contract-renewals-head">
          <div>
            <h3>Renovaciones</h3>
            <span>{form.renewals.length} registrada{form.renewals.length === 1 ? "" : "s"}</span>
          </div>
          <button className="secondary-button" type="button" onClick={addRenewal} disabled={saving || prefillingContract || Boolean(prefillingRenewalKey)}>
            Agregar renovación
          </button>
        </div>

        {form.renewals.length === 0 ? (
          <div className="centered-inline-message">Aún no hay renovaciones cargadas para este contrato.</div>
        ) : (
          <>
            <div className="external-contract-renewal-tabs" role="tablist" aria-label="Renovaciones del contrato">
              {form.renewals.map((_renewal, index) => (
                <button
                  key={index}
                  type="button"
                  className={`external-contract-renewal-tab ${activeRenewalIndex === index ? "is-active" : ""}`}
                  onClick={() => setActiveRenewalIndex(index)}
                  disabled={saving || prefillingContract}
                >
                  {renewalLabel(index)}
                </button>
              ))}
            </div>

            {activeRenewal ? (
              <div className="external-contract-renewal-fields">
                {renderRenewalDocumentKindField(
                  "form",
                  activeRenewalIndex,
                  activeRenewal,
                  saving || prefillingContract || Boolean(prefillingRenewalKey)
                )}

                {renderRenewalExtractionPanel(
                  "form",
                  activeRenewalIndex,
                  activeRenewal,
                  saving || prefillingContract
                )}

                <label className="form-field">
                  <span>{getRenewalDateLabel(activeRenewal)}</span>
                  <input
                    type="date"
                    value={activeRenewal.renewalDate}
                    onChange={(event) => updateRenewal(activeRenewalIndex, "renewalDate", event.target.value)}
                    disabled={saving || Boolean(prefillingRenewalKey)}
                  />
                </label>

                <label className="form-field">
                  <span>{getRenewalStartDateLabel(activeRenewal)}</span>
                  <input
                    type="date"
                    value={activeRenewal.leaseStartDate}
                    onChange={(event) => updateRenewal(activeRenewalIndex, "leaseStartDate", event.target.value)}
                    disabled={saving || Boolean(prefillingRenewalKey)}
                  />
                </label>

                {!isRentUpdateRenewal(activeRenewal) ? (
                  <label className="form-field">
                    <span>Fin de vigencia</span>
                    <input
                      type="date"
                      value={activeRenewal.leaseEndDate}
                      onChange={(event) => updateRenewal(activeRenewalIndex, "leaseEndDate", event.target.value)}
                      disabled={saving || Boolean(prefillingRenewalKey)}
                    />
                  </label>
                ) : null}

                <label className="form-field">
                  <span>Monto de renta</span>
                  <div className="money-input-control has-suffix">
                    <span className="money-input-prefix">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={activeRenewal.monthlyRentMxn}
                      onChange={(event) => updateRenewal(activeRenewalIndex, "monthlyRentMxn", event.target.value)}
                      placeholder="0.00"
                      disabled={saving || Boolean(prefillingRenewalKey)}
                    />
                    <span className="money-input-suffix">MXN</span>
                  </div>
                </label>

                <label className="form-field">
                  <span>% aumento</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={activeRenewal.rentIncreasePct}
                    onChange={(event) => updateRenewal(activeRenewalIndex, "rentIncreasePct", event.target.value)}
                    placeholder="0"
                    disabled={saving || Boolean(prefillingRenewalKey)}
                  />
                </label>

                <label className="form-field">
                  <span>INPC base</span>
                  <select
                    value={activeRenewal.inpcBasePeriod}
                    onChange={(event) => updateRenewal(activeRenewalIndex, "inpcBasePeriod", event.target.value)}
                    disabled={saving || Boolean(prefillingRenewalKey) || inpcRowsAsc.length === 0}
                  >
                    <option value="">-- No aplicar --</option>
                    {inpcRowsAsc.map((record) => (
                      <option key={record.id} value={inpcPeriodKey(record)}>
                        {formatInpcPeriod(record)} - {formatInpcValue(record.value)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span>INPC actualización</span>
                  <select
                    value={activeRenewal.inpcTargetPeriod}
                    onChange={(event) => updateRenewal(activeRenewalIndex, "inpcTargetPeriod", event.target.value)}
                    disabled={saving || Boolean(prefillingRenewalKey) || inpcRowsAsc.length === 0}
                  >
                    <option value="">-- No aplicar --</option>
                    {inpcRowsAsc.map((record) => (
                      <option key={record.id} value={inpcPeriodKey(record)}>
                        {formatInpcPeriod(record)} - {formatInpcValue(record.value)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field internal-contracts-wide-field">
                  <span>Notas</span>
                  <textarea
                    value={activeRenewal.notes}
                    onChange={(event) => updateRenewal(activeRenewalIndex, "notes", event.target.value)}
                    placeholder="Observaciones de esta renovación..."
                    disabled={saving || Boolean(prefillingRenewalKey)}
                  />
                </label>

                <div className="form-actions external-contract-renewal-actions">
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => removeRenewal(activeRenewalIndex)}
                    disabled={saving || prefillingContract || Boolean(prefillingRenewalKey)}
                  >
                    Quitar renovación
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    );
  }

  function renderManagedRenewalsEditor() {
    if (!selectedManagedContract) {
      return null;
    }

    const activeRenewal = managedRenewals[activeRenewalIndex];

    return (
      <section className="external-contract-renewals-editor">
        <div className="external-contract-renewals-head">
          <div>
            <h3>Renovaciones</h3>
            <span>{managedRenewals.length} registrada{managedRenewals.length === 1 ? "" : "s"}</span>
          </div>
          {canWrite ? (
            <button className="secondary-button" type="button" onClick={addManagedRenewal} disabled={savingRenewals || Boolean(prefillingRenewalKey)}>
              Agregar renovación
            </button>
          ) : null}
        </div>

        {managedRenewals.length === 0 ? (
          <div className="centered-inline-message">Aún no hay renovaciones cargadas para este contrato.</div>
        ) : (
          <>
            <div className="external-contract-renewal-tabs" role="tablist" aria-label="Renovaciones del contrato cargado">
              {managedRenewals.map((renewal, index) => (
                <button
                  key={renewal.id ?? `draft-${index}`}
                  type="button"
                  className={`external-contract-renewal-tab ${activeRenewalIndex === index ? "is-active" : ""}`}
                  onClick={() => setActiveRenewalIndex(index)}
                  disabled={savingRenewals || Boolean(prefillingRenewalKey)}
                >
                  {renewalLabel(index)}
                </button>
              ))}
            </div>

            {activeRenewal ? (
              <div className="external-contract-renewal-fields">
                {renderRenewalDocumentKindField(
                  "managed",
                  activeRenewalIndex,
                  activeRenewal,
                  savingRenewals || !canWrite || Boolean(prefillingRenewalKey)
                )}

                {renderRenewalExtractionPanel(
                  "managed",
                  activeRenewalIndex,
                  activeRenewal,
                  savingRenewals || !canWrite,
                  selectedManagedContract
                )}

                <label className="form-field">
                  <span>{getRenewalDateLabel(activeRenewal)}</span>
                  <input
                    type="date"
                    value={activeRenewal.renewalDate}
                    onChange={(event) => updateManagedRenewal(activeRenewalIndex, "renewalDate", event.target.value)}
                    disabled={savingRenewals || !canWrite || Boolean(prefillingRenewalKey)}
                  />
                </label>

                <label className="form-field">
                  <span>{getRenewalStartDateLabel(activeRenewal)}</span>
                  <input
                    type="date"
                    value={activeRenewal.leaseStartDate}
                    onChange={(event) => updateManagedRenewal(activeRenewalIndex, "leaseStartDate", event.target.value)}
                    disabled={savingRenewals || !canWrite || Boolean(prefillingRenewalKey)}
                  />
                </label>

                {!isRentUpdateRenewal(activeRenewal) ? (
                  <label className="form-field">
                    <span>Fin de vigencia</span>
                    <input
                      type="date"
                      value={activeRenewal.leaseEndDate}
                      onChange={(event) => updateManagedRenewal(activeRenewalIndex, "leaseEndDate", event.target.value)}
                      disabled={savingRenewals || !canWrite || Boolean(prefillingRenewalKey)}
                    />
                  </label>
                ) : null}

                <label className="form-field">
                  <span>Monto de renta</span>
                  <div className="money-input-control has-suffix">
                    <span className="money-input-prefix">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={activeRenewal.monthlyRentMxn}
                      onChange={(event) => updateManagedRenewal(activeRenewalIndex, "monthlyRentMxn", event.target.value)}
                      placeholder="0.00"
                      disabled={savingRenewals || !canWrite || Boolean(prefillingRenewalKey)}
                    />
                    <span className="money-input-suffix">MXN</span>
                  </div>
                </label>

                <label className="form-field">
                  <span>% aumento</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={activeRenewal.rentIncreasePct}
                    onChange={(event) => updateManagedRenewal(activeRenewalIndex, "rentIncreasePct", event.target.value)}
                    placeholder="0"
                    disabled={savingRenewals || !canWrite || Boolean(prefillingRenewalKey)}
                  />
                </label>

                <label className="form-field">
                  <span>INPC base</span>
                  <select
                    value={activeRenewal.inpcBasePeriod}
                    onChange={(event) => updateManagedRenewal(activeRenewalIndex, "inpcBasePeriod", event.target.value)}
                    disabled={savingRenewals || !canWrite || Boolean(prefillingRenewalKey) || inpcRowsAsc.length === 0}
                  >
                    <option value="">-- No aplicar --</option>
                    {inpcRowsAsc.map((record) => (
                      <option key={record.id} value={inpcPeriodKey(record)}>
                        {formatInpcPeriod(record)} - {formatInpcValue(record.value)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span>INPC actualización</span>
                  <select
                    value={activeRenewal.inpcTargetPeriod}
                    onChange={(event) => updateManagedRenewal(activeRenewalIndex, "inpcTargetPeriod", event.target.value)}
                    disabled={savingRenewals || !canWrite || Boolean(prefillingRenewalKey) || inpcRowsAsc.length === 0}
                  >
                    <option value="">-- No aplicar --</option>
                    {inpcRowsAsc.map((record) => (
                      <option key={record.id} value={inpcPeriodKey(record)}>
                        {formatInpcPeriod(record)} - {formatInpcValue(record.value)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field internal-contracts-wide-field">
                  <span>Notas</span>
                  <textarea
                    value={activeRenewal.notes}
                    onChange={(event) => updateManagedRenewal(activeRenewalIndex, "notes", event.target.value)}
                    placeholder="Observaciones de esta renovación..."
                    disabled={savingRenewals || !canWrite || Boolean(prefillingRenewalKey)}
                  />
                </label>

                <div className="external-contract-renewal-documents internal-contracts-wide-field">
                  <div className="external-contract-renewal-documents-head">
                    <div>
                      <strong>Documentos de renovación</strong>
                      <span>{activeRenewal.documents?.length ?? 0} archivo{(activeRenewal.documents?.length ?? 0) === 1 ? "" : "s"}</span>
                    </div>
                  </div>

                  {!activeRenewal.id ? (
                    <small>La carga se conservará cuando la renovación esté guardada.</small>
                  ) : null}

                  {(activeRenewal.documents ?? []).length === 0 ? (
                    <small>No hay documentos cargados para esta renovación.</small>
                  ) : (
                    <div className="external-contract-renewal-document-list">
                      {(activeRenewal.documents ?? []).map((document) => (
                        <div className="external-contract-renewal-document-row" key={document.id}>
                          <div>
                            <strong>{document.originalFileName}</strong>
                            <small>{formatFileSize(document.fileSizeBytes)} - {formatDate(document.createdAt)}</small>
                          </div>
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={downloadingRenewalDocumentId === document.id}
                            onClick={() => void handleRenewalDocumentDownload(selectedManagedContract, activeRenewal, document)}
                          >
                            {downloadingRenewalDocumentId === document.id ? "Descargando..." : "Descargar"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {canWrite ? (
                  <div className="form-actions external-contract-renewal-actions">
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void saveManagedRenewals()}
                      disabled={savingRenewals || Boolean(prefillingRenewalKey)}
                    >
                      {savingRenewals ? "Guardando..." : activeRenewal.id ? "Actualizar información" : "Guardar renovación"}
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => void removeManagedRenewal(activeRenewalIndex)}
                      disabled={savingRenewals || Boolean(prefillingRenewalKey)}
                    >
                      Quitar renovación
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>
    );
  }

  function renderMilestoneRow(milestone: ContractMilestoneView, contract?: ExternalContract) {
    const storedMilestone = contract?.milestones.find((entry) => entry.id === milestone.id);
    const contractSummary = [milestone.contractTitle, milestone.propertyAddress].filter(Boolean).join(" · ") || milestone.clientName;
    const contractSummaryTitle = [
      milestone.contractNumber,
      milestone.clientName,
      milestone.contractTitle,
      milestone.propertyAddress
    ].filter(Boolean).join(" · ");

    return (
      <div className={`external-contract-milestone-row is-${milestone.kind}`} key={milestone.id}>
        <div className="external-contract-milestone-date">
          <strong>{formatDate(milestone.dueDate)}</strong>
          <span>{milestoneKindLabel(milestone.kind)}</span>
        </div>
        <div className="external-contract-milestone-body">
          <strong>{milestone.title}</strong>
          {milestone.description ? <small>{milestone.description}</small> : null}
        </div>
        <div className="external-contract-milestone-summary" title={contractSummaryTitle}>
          <strong>{milestone.contractNumber} · {milestone.clientName}</strong>
          <span>{contractSummary}</span>
        </div>
        {contract && storedMilestone && canWrite ? (
          <button
            className="secondary-button"
            type="button"
            disabled={savingManualAlert}
            onClick={() => void removeContractMilestone(contract, storedMilestone.id)}
          >
            Quitar
          </button>
        ) : null}
      </div>
    );
  }

  function renderContractNextActionPanel(contract: ExternalContract) {
    const milestones = getContractMilestones(contract);
    const nextMilestones = milestones.slice(0, 8);

    return (
      <div className="external-contract-next-actions">
        <div className="external-contract-next-actions-head">
          <div>
            <strong>Hitos y alertas de este contrato</strong>
            <span>{nextMilestones.length} hito{nextMilestones.length === 1 ? "" : "s"} futuro{nextMilestones.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        {nextMilestones.length === 0 ? (
          <small>No hay hitos futuros registrados para este contrato.</small>
        ) : (
          <div className="external-contract-milestone-list">
            {nextMilestones.map((milestone) => renderMilestoneRow(milestone, contract))}
          </div>
        )}

        {canWrite ? (
          <div className="external-contract-manual-alert">
            <label className="form-field">
              <span>Nueva alerta</span>
              <input
                value={manualAlertForm.title}
                onChange={(event) => updateManualAlertForm("title", event.target.value)}
                placeholder="Ej. Aviso previo al arrendador"
                disabled={savingManualAlert}
              />
            </label>
            <label className="form-field">
              <span>Fecha</span>
              <input
                type="date"
                value={manualAlertForm.dueDate}
                onChange={(event) => updateManualAlertForm("dueDate", event.target.value)}
                disabled={savingManualAlert}
              />
            </label>
            <label className="form-field internal-contracts-wide-field">
              <span>Detalle</span>
              <textarea
                value={manualAlertForm.description}
                onChange={(event) => updateManualAlertForm("description", event.target.value)}
                placeholder="Notas de seguimiento..."
                disabled={savingManualAlert}
              />
            </label>
            <div className="form-actions external-contract-renewal-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={savingManualAlert}
                onClick={() => void saveManualAlert(contract)}
              >
                {savingManualAlert ? "Guardando..." : "Agregar alerta"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderGeneratedDocumentsArea(contract: ExternalContract) {
    const documents = contract.generatedDocuments ?? [];
    const groups = groupGeneratedDocuments(documents);

    return (
      <div className="external-contract-generated-documents">
        {documents.length === 0 ? (
          <div className="centered-inline-message">No hay formatos generados para este contrato.</div>
        ) : (
          groups.map((group) => {
            const renewal = contract.renewals.find((entry) => entry.id === group.renewalId);
            const displayDocument = group.word ?? group.pdf ?? group.other;
            const deletingGroup = deletingGeneratedDocumentGroupKey === group.key;

            return (
              <div className="external-contract-generated-document" key={group.key}>
                <div>
                  <strong>{group.templateTitle}</strong>
                  <small>
                    {displayDocument?.originalFileName ?? "Formato generado"}
                    {renewal ? ` - ${renewalLabel(renewal.sequence - 1)}` : " - Contrato original"}
                    {" - "}
                    {formatDate(group.createdAt)}
                  </small>
                </div>
                <div className="external-contract-generated-document-actions">
                  {group.word ? (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={deletingGroup || downloadingGeneratedDocumentId === group.word.id}
                      onClick={() => void handleGeneratedDocumentDownload(contract, group.word!)}
                    >
                      {downloadingGeneratedDocumentId === group.word.id ? "Descargando..." : "Word"}
                    </button>
                  ) : null}
                  {group.pdf ? (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={deletingGroup || downloadingGeneratedDocumentId === group.pdf.id}
                      onClick={() => void handleGeneratedDocumentDownload(contract, group.pdf!)}
                    >
                      {downloadingGeneratedDocumentId === group.pdf.id ? "Descargando..." : "PDF"}
                    </button>
                  ) : null}
                  {!group.word && !group.pdf && group.other ? (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={deletingGroup || downloadingGeneratedDocumentId === group.other.id}
                      onClick={() => void handleGeneratedDocumentDownload(contract, group.other!)}
                    >
                      {downloadingGeneratedDocumentId === group.other.id ? "Descargando..." : "Descargar"}
                    </button>
                  ) : null}
                  {canWrite ? (
                    <button
                      className="danger-button"
                      type="button"
                      disabled={deletingGroup}
                      onClick={() => void handleGeneratedDocumentGroupDelete(contract, group)}
                    >
                      {deletingGroup ? "Borrando..." : "Borrar"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  function renderMilestonesSection() {
    const milestones = allContractMilestones
      .filter((milestone) => !contractClientFilterId || contracts.find((contract) => contract.id === milestone.contractId)?.clientId === contractClientFilterId)
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.contractNumber.localeCompare(right.contractNumber, "es-MX"));

    return (
      <section className="external-contracts-milestones-layout">
        <section className="panel external-contracts-milestones-panel">
          <div className="panel-header">
            <h2>Próximos hitos y alertas</h2>
            <span>{milestones.length} fecha{milestones.length === 1 ? "" : "s"} futura{milestones.length === 1 ? "" : "s"}</span>
          </div>

          <div className="internal-contracts-toolbar external-contracts-management-toolbar">
            <label className="form-field internal-contracts-wide-field">
              <span>Cliente</span>
              <select value={contractClientFilterId} onChange={(event) => setContractClientFilterId(event.target.value)}>
                <option value="">Todos los clientes</option>
                {sortClients(clients).map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.clientNumber} - {client.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {milestones.length === 0 ? (
            <div className="centered-inline-message">No hay hitos o alertas futuras.</div>
          ) : (
            <div className="external-contract-milestone-list">
              {milestones.map((milestone) => renderMilestoneRow(milestone))}
            </div>
          )}
        </section>
      </section>
    );
  }

  function renderRentUpdateFormatPreview(preview: RentUpdateFormatPreview | null) {
    if (!preview) {
      return (
        <div className="external-contracts-format-preview">
          <strong>Información del formato</strong>
          <span>Selecciona una renovación como documento base para ver el cálculo antes de generar el Word.</span>
        </div>
      );
    }

    return (
      <div className="external-contracts-format-preview">
        <div className="external-contracts-format-preview-head">
          <div>
            <strong>Información que se usará para generar el formato</strong>
            <span>Al generarlo, se registrará como nueva renovación de actualización de renta.</span>
          </div>
        </div>

        <div className="external-contracts-format-preview-grid">
          <div>
            <span>Documento base</span>
            <strong>{preview.baseLabel}</strong>
          </div>
          <label className="external-contracts-format-preview-field">
            <span>Fecha del formato</span>
            <input
              type="date"
              value={formatDateValue}
              onChange={(event) => setFormatDateValue(event.target.value)}
              disabled={generatingFormat}
            />
          </label>
          <label className="external-contracts-format-preview-field">
            <span>Inicio de nueva renta</span>
            <input
              type="date"
              value={rentUpdateFormatForm.effectiveDate}
              onChange={(event) => updateRentUpdateFormatForm("effectiveDate", event.target.value)}
              disabled={generatingFormat}
            />
          </label>
          <label className="external-contracts-format-preview-field">
            <span>Renta anterior</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={rentUpdateFormatForm.previousRentMxn}
              onChange={(event) => updateRentUpdateFormatForm("previousRentMxn", event.target.value)}
              placeholder="0.00"
              disabled={generatingFormat}
            />
          </label>
          <label className="external-contracts-format-preview-field">
              <span>INPC base</span>
              <select
                value={rentUpdateFormatForm.basePeriod || preview.basePeriod || ""}
                onChange={(event) => updateRentUpdateFormatForm("basePeriod", event.target.value)}
                disabled={generatingFormat || inpcRowsAsc.length === 0}
              >
              <option value="">-- Seleccionar --</option>
              {inpcRowsAsc.map((record) => (
                <option key={record.id} value={inpcPeriodKey(record)}>
                  {formatInpcPeriod(record)}
                </option>
              ))}
            </select>
            <small>{formatInpcValue(preview.baseInpc?.value)}</small>
          </label>
          <label className="external-contracts-format-preview-field">
              <span>INPC actualización</span>
              <select
                value={rentUpdateFormatForm.targetPeriod || preview.targetPeriod || ""}
                onChange={(event) => updateRentUpdateFormatForm("targetPeriod", event.target.value)}
                disabled={generatingFormat || inpcRowsAsc.length === 0}
              >
              <option value="">-- Seleccionar --</option>
              {inpcRowsAsc.map((record) => (
                <option key={record.id} value={inpcPeriodKey(record)}>
                  {formatInpcPeriod(record)}
                </option>
              ))}
            </select>
            <small>{formatInpcValue(preview.targetInpc?.value)}</small>
          </label>
          <div>
            <span>Factor</span>
            <strong>{preview.factor ? preview.factor.toFixed(6) : "-"}</strong>
          </div>
          <div>
            <span>Aumento</span>
            <strong>{formatCurrency(preview.increaseMxn)}</strong>
            <small>{formatSignedPercent(preview.increasePct)}</small>
          </div>
          <div>
            <span>Nueva renta calculada</span>
            <strong>{formatCurrency(preview.updatedRentMxn)}</strong>
          </div>
          <label className="external-contracts-format-preview-field external-contracts-format-preview-rounding">
            <span>Renta redondeada</span>
            <span className="external-contracts-format-preview-check">
              <input
                type="checkbox"
                checked={rentUpdateFormatForm.useRoundedRent}
                onChange={(event) => updateRentUpdateFormatForm("useRoundedRent", event.target.checked)}
                disabled={generatingFormat}
              />
              Usar renta redondeada
            </span>
            <span className="external-contracts-format-money-input">
              <span className="external-contracts-format-money-prefix">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rentUpdateFormatForm.roundedRentMxn}
                onChange={(event) => updateRentUpdateFormatForm("roundedRentMxn", event.target.value)}
                placeholder="0.00"
                disabled={generatingFormat || !rentUpdateFormatForm.useRoundedRent}
              />
              <span className="external-contracts-format-money-suffix">MXN</span>
            </span>
          </label>
          <div>
            <span>Renta a presentar</span>
            <strong>{formatCurrency(preview.presentedRentMxn)}</strong>
            <small>{preview.useRoundedRent ? formatSignedPercent(preview.presentedIncreasePct) : "Sin redondeo"}</small>
          </div>
        </div>
      </div>
    );
  }

  function renderFormatPanel() {
    const scopeValue = formatRenewalId || FORMAT_SCOPE_ORIGINAL;
    const rentUpdateDocumentDate = formatDateValue || dateInputValue(new Date());
    const rentUpdatePreview = formatTemplateId === "rent-increase" && selectedFormatContract && selectedFormatRenewal
      ? buildRentUpdateFormatPreview(
          selectedFormatContract,
          selectedFormatRenewal,
          rentUpdateDocumentDate,
          inpcRecords,
          rentUpdateFormatForm
        )
      : null;
    const rentUpdateFormatIssue = formatTemplateId === "rent-increase"
      ? getRentUpdateFormatIssue(rentUpdatePreview, scopeValue)
      : null;

    return (
      <div className="external-contracts-format-panel">
        <div className="panel-header">
          <h2>Generar nuevo formato</h2>
          <span>{selectedManagedContract?.contractNumber ?? "Sin contrato"}</span>
        </div>

        <div className="external-contracts-format-grid">
          <label className="form-field internal-contracts-wide-field">
            <span>Formato</span>
            <select
              value={formatTemplateId}
              onChange={(event) => setFormatTemplateId(event.target.value as FormatTemplateId)}
              disabled={!selectedManagedContract}
            >
              {(Object.keys(formatTemplateLabels) as FormatTemplateId[]).map((templateId) => (
                <option key={templateId} value={templateId}>
                  {formatTemplateLabels[templateId]}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field internal-contracts-wide-field">
            <span>Documento base para la generación de este formato</span>
            <select
              value={scopeValue}
              onChange={(event) => setFormatRenewalId(event.target.value)}
              disabled={!selectedManagedContract}
            >
              <option value={FORMAT_SCOPE_ORIGINAL}>Contrato original</option>
              {selectedFormatRenewals.map((renewal) => (
                <option key={renewal.id} value={renewal.id}>
                  {renewalLabel(renewal.sequence - 1)} - {formatDate(getRenewalDisplayDate(renewal))}
                </option>
              ))}
            </select>
          </label>

          {formatTemplateId !== "rent-increase" ? (
            <label className="form-field internal-contracts-wide-field">
              <span>Fecha del formato</span>
              <input
                type="date"
                value={formatDateValue}
                onChange={(event) => setFormatDateValue(event.target.value)}
                disabled={!selectedManagedContract}
              />
            </label>
          ) : null}
        </div>

        {formatTemplateId === "rent-increase" ? renderRentUpdateFormatPreview(rentUpdatePreview) : null}

        <div className="form-actions">
          {formatTemplateId === "rent-increase" ? (
            <>
              <button
                className="secondary-button"
                type="button"
                disabled={generatingFormat || Boolean(rentUpdateFormatIssue)}
                onClick={() => void handleFormatDownload("word")}
              >
                {generatingFormat ? "Generando..." : "Generar y guardar Word"}
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={generatingFormat || Boolean(rentUpdateFormatIssue)}
                onClick={() => void handleFormatDownload("pdf")}
              >
                {generatingFormat ? "Generando..." : "Generar y guardar PDF"}
              </button>
              {rentUpdateFormatIssue ? (
                <div className="external-contracts-format-action-message message-banner message-warning">
                  {rentUpdateFormatIssue}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <button
                className="secondary-button"
                type="button"
                disabled={!selectedManagedContract || generatingFormat}
                onClick={() => void handleFormatDownload("word")}
              >
                Descargar Word
              </button>
            <button
              className="primary-button"
              type="button"
              disabled={!selectedManagedContract}
              onClick={() => void handleFormatDownload("pdf")}
            >
              Descargar PDF
            </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderInpcSection() {
    return (
      <section className="external-contracts-inpc-layout">
        <section className="panel external-contracts-inpc-summary-panel">
          <div className="panel-header">
            <h2>{INPC_SECTION_LABEL}</h2>
            <span>Banxico SP1</span>
          </div>

          <div className="external-contracts-inpc-metrics">
            <div>
              <span>Ultimo periodo</span>
              <strong>{formatInpcPeriod(latestInpc)}</strong>
              <small>{latestInpc ? formatInpcValue(latestInpc.value) : "-"}</small>
            </div>
            <div>
              <span>Indices guardados</span>
              <strong>{inpcRecords.length}</strong>
              <small>Desde enero 2025</small>
            </div>
            <div>
              <span>Fuente</span>
              <strong>Banco de Mexico</strong>
              <small>Serie {latestInpc?.sourceSeries ?? "SP1"}</small>
            </div>
          </div>

          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => void loadModule()} disabled={loading}>
              Refrescar
            </button>
          </div>
        </section>

        <section className="panel external-contracts-inpc-calculator-panel">
          <div className="panel-header">
            <h2>Calcular aumento de renta</h2>
            <span>Factor INPC</span>
          </div>

          <div className="external-contracts-inpc-calculator-grid">
            <label className="form-field">
              <span>Renta actual</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rentCalculator.rentMxn}
                onChange={(event) => updateRentCalculator("rentMxn", event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label className="form-field">
              <span>INPC base</span>
              <select
                value={rentCalculator.basePeriod}
                onChange={(event) => updateRentCalculator("basePeriod", event.target.value)}
                disabled={inpcRecords.length === 0}
              >
                <option value="">-- Seleccionar --</option>
                {inpcRowsAsc.map((record) => (
                  <option key={record.id} value={inpcPeriodKey(record)}>
                    {formatInpcPeriod(record)} - {formatInpcValue(record.value)}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>INPC actualización</span>
              <select
                value={rentCalculator.targetPeriod}
                onChange={(event) => updateRentCalculator("targetPeriod", event.target.value)}
                disabled={inpcRecords.length === 0}
              >
                <option value="">-- Seleccionar --</option>
                {inpcRowsAsc.map((record) => (
                  <option key={record.id} value={inpcPeriodKey(record)}>
                    {formatInpcPeriod(record)} - {formatInpcValue(record.value)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="external-contracts-inpc-calculation">
            <div>
              <span>Nueva renta</span>
              <strong>{rentIncreaseCalculation ? formatCurrency(rentIncreaseCalculation.updatedRentMxn) : "-"}</strong>
            </div>
            <div>
              <span>Incremento</span>
              <strong>{rentIncreaseCalculation ? formatCurrency(rentIncreaseCalculation.increaseMxn) : "-"}</strong>
            </div>
            <div>
              <span>Aumento</span>
              <strong>{rentIncreaseCalculation ? formatSignedPercent(rentIncreaseCalculation.increasePct) : "-"}</strong>
            </div>
            <div>
              <span>Factor</span>
              <strong>{rentIncreaseCalculation ? rentIncreaseCalculation.factor.toFixed(6) : "-"}</strong>
            </div>
          </div>
        </section>

        <section className="panel external-contracts-inpc-table-panel">
          <div className="panel-header">
            <h2>Indices guardados</h2>
            <span>{inpcRecords.length} registros</span>
          </div>

          <div className="table-scroll">
            <table className="data-table external-contracts-inpc-table">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>INPC</th>
                  <th>Variacion mensual</th>
                  <th>Importado</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4}>Cargando INPC...</td>
                  </tr>
                ) : null}
                {!loading && inpcRowsDesc.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No hay indices INPC guardados.</td>
                  </tr>
                ) : null}
                {!loading && inpcRowsDesc.map((record) => {
                  const previous = previousInpcById.get(record.id);
                  const monthlyChange = previous ? ((record.value - previous.value) / previous.value) * 100 : undefined;

                  return (
                    <tr key={record.id}>
                      <td>{formatInpcPeriod(record)}</td>
                      <td>{formatInpcValue(record.value)}</td>
                      <td>{formatSignedPercent(monthlyChange)}</td>
                      <td>{formatDate(record.importedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    );
  }

  function renderContractCard(contract: ExternalContract) {
    const nextRenewal = getNextRenewal(contract);
    const renewalTone = deadlineStatus(getRenewalDisplayDate(nextRenewal));

    return (
      <article className="internal-contract-card external-contract-card" key={contract.id}>
        <div className="internal-contract-card-head">
          <div>
            <span className="internal-contract-number">{contract.contractNumber}</span>
            <h3>{contract.title}</h3>
            <p className="internal-contract-title">{contract.propertyAddress || "Inmueble pendiente"}</p>
          </div>
          <div className="internal-contract-card-tags">
            <span className={`status-pill ${contract.status === "ACTIVE" ? "status-live" : "status-migration"}`}>
              {contract.status === "ACTIVE" ? "Activo" : "Archivado"}
            </span>
            <span className="status-pill status-live">Arrendamiento</span>
            {contract.renewals.length > 0 ? (
              <span className="status-pill status-warning">
                {contract.renewals.length} {contract.renewals.length === 1 ? "renovación" : "renovaciones"}
              </span>
            ) : null}
          </div>
        </div>

        <div className="internal-contract-meta-grid">
          <div>
            <span>Archivo principal</span>
            <strong>{contract.originalFileName ?? "Sin archivo"}</strong>
            <small>{formatFileSize(contract.fileSizeBytes)}</small>
          </div>
          <div>
            <span>Vigencia</span>
            <strong>{formatDate(contract.leaseStartDate)} - {formatDate(contract.leaseEndDate)}</strong>
            <small>{formatCurrency(contract.monthlyRentMxn)} renta mensual</small>
          </div>
          <div>
            <span>Partes</span>
            <strong>{contract.landlordName || "Arrendador pendiente"}</strong>
            <small>{contract.tenantName || "Arrendatario pendiente"}</small>
          </div>
        </div>

        <div className="external-contract-deadlines">
          <div className={`external-contract-deadline is-${renewalTone}`}>
            <span>Siguiente renovación</span>
            <strong>{formatDate(getRenewalDisplayDate(nextRenewal))}</strong>
            <small>{nextRenewal ? renewalLabel(nextRenewal.sequence - 1) : "Sin renovaciones"}</small>
          </div>
          <div className="external-contract-deadline is-ok">
            <span>Renta renovada</span>
            <strong>{formatCurrency(nextRenewal?.monthlyRentMxn)}</strong>
            <small>{formatPercent(nextRenewal?.rentIncreasePct)}</small>
          </div>
        </div>

        {contract.notes ? <p className="internal-contract-notes">{contract.notes}</p> : null}

        {renderContractNextActionPanel(contract)}

        {(contract.generatedDocuments ?? []).length > 0 ? (
          <div className="external-contract-generated-documents">
            <span>Formatos generados</span>
            {(contract.generatedDocuments ?? []).map((document) => {
              const renewal = contract.renewals.find((entry) => entry.id === document.renewalId);

              return (
                <div className="external-contract-generated-document" key={document.id}>
                  <div>
                    <strong>{document.templateTitle}</strong>
                    <small>
                      {document.originalFileName}
                      {renewal ? ` - ${renewalLabel(renewal.sequence - 1)}` : ""}
                      {" - "}
                      {formatDate(document.createdAt)}
                    </small>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={downloadingGeneratedDocumentId === document.id}
                    onClick={() => void handleGeneratedDocumentDownload(contract, document)}
                  >
                    {downloadingGeneratedDocumentId === document.id ? "Descargando..." : "Descargar"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="table-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={downloadingId === contract.id}
            onClick={() => void handleDownload(contract)}
          >
            {downloadingId === contract.id ? "Descargando..." : "Descargar"}
          </button>
          {canWrite ? (
            <button className="secondary-button" type="button" onClick={() => startEdit(contract)}>
              Editar información
            </button>
          ) : null}
          {canWrite ? (
            <button
              className="danger-button"
              type="button"
              disabled={deletingId === contract.id}
              onClick={() => void handleDelete(contract)}
            >
              {deletingId === contract.id ? "Borrando..." : "Borrar"}
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  if (!canRead) {
    return (
      <section className="page-stack">
        <header className="hero module-hero">
          <div className="module-hero-head">
            <div>
              <h2>{MODULE_TITLE}</h2>
            </div>
          </div>
          <p className="muted">Tu perfil actual no tiene permisos para consultar este modulo.</p>
        </header>
      </section>
    );
  }

  return (
    <section className="page-stack internal-contracts-page external-contracts-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            Contratos
          </span>
          <div>
            <h2>{MODULE_TITLE}</h2>
          </div>
        </div>
        <p className="muted">
          Control de contratos de clientes por empresa, organizados por cliente y con fechas clave de renovación y aumento de renta.
        </p>
      </header>

      <section className="panel external-contracts-navigation-panel">
        <div className="external-contracts-navigation-head">
          <div className="external-contracts-navigation-title">
            <span>Tipos de contratos</span>
            <strong>Contratos externos</strong>
          </div>
          <div className="external-contracts-summary-group" aria-label="Resumen de contratos externos">
            <span className="external-contracts-summary-pill">{activeCount} activos</span>
            <span className="external-contracts-summary-pill">{upcomingCount} fechas próximas</span>
          </div>
        </div>
        <div className="external-contracts-navigation-body">
          <div className="leads-tabs internal-contracts-tabs external-contracts-type-tabs" role="tablist" aria-label="Tipos de contratos externos">
            <button
              type="button"
              className={`lead-tab ${activeSection === "contracts" ? "is-active" : ""}`}
              onClick={() => setActiveSection("contracts")}
            >
              {CONTRACT_SECTION_LABEL} ({activeLeaseCount})
            </button>
          </div>
          <div className="external-contracts-utility-nav" aria-label="Herramientas de contratos externos">
            <button
              type="button"
              className={`external-contracts-utility-button is-alerts ${activeSection === "milestones" ? "is-active" : ""}`}
              onClick={() => setActiveSection("milestones")}
            >
              <span>Próximos hitos y alertas</span>
              <strong>{allContractMilestones.length}</strong>
            </button>
            <button
              type="button"
              className={`external-contracts-utility-button ${activeSection === "inpc" ? "is-active" : ""}`}
              onClick={() => setActiveSection("inpc")}
            >
              <span>{INPC_SECTION_LABEL}</span>
              <strong>{inpcRecords.length}</strong>
            </button>
          </div>
        </div>
      </section>

      {flash ? (
        <div className={`message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`}>
          {flash.text}
        </div>
      ) : null}

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      {activeSection === "inpc" ? renderInpcSection() : activeSection === "milestones" ? renderMilestonesSection() : (
        <section className="internal-contracts-layout">
          <section className="panel internal-contracts-form-panel">
            <div className="panel-header">
              <h2>{editingId ? "Editar contrato" : "Cargar contrato"}</h2>
              <span>{editingId ? "Información guardada" : "Contrato original"}</span>
            </div>

            {canWrite ? (
              <form className="internal-contracts-form" onSubmit={handleSubmit}>
                <div className="internal-contracts-form-grid">
                  <label className="form-field internal-contracts-wide-field">
                    <span>Buscar cliente</span>
                    <input
                      value={clientSearch}
                      onChange={(event) => setClientSearch(event.target.value)}
                      placeholder="Escribe el nombre del cliente..."
                      disabled={saving || loading}
                    />
                  </label>

                  <label className="form-field internal-contracts-wide-field">
                    <span>Cliente</span>
                    <select
                      value={form.clientId}
                      onChange={(event) => updateForm("clientId", event.target.value)}
                      disabled={saving || loading}
                    >
                      <option value="">-- Seleccionar cliente --</option>
                      {filteredClients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.clientNumber} - {client.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="form-field internal-contracts-file-field">
                    <span>Archivo Word/PDF</span>
                    <input
                      key={fileInputKey}
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={handleFileChange}
                      disabled={saving || prefillingContract}
                    />
                  </label>
                </div>

                <div className="form-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleContractPrefill()}
                    disabled={saving || loading || prefillingContract || !selectedFile}
                  >
                    {prefillingContract ? "Extrayendo..." : "Extraer con IA"}
                  </button>
                </div>

                <div className="internal-contracts-form-grid">
                  <label className="form-field">
                    <span>Estatus</span>
                    <select
                      value={form.status}
                      onChange={(event) => updateForm("status", event.target.value as ExternalContractStatus)}
                      disabled={saving}
                    >
                      <option value="ACTIVE">Activo</option>
                      <option value="ARCHIVED">Archivado</option>
                    </select>
                  </label>

                  <label className="form-field internal-contracts-wide-field">
                    <span>Nombre del contrato</span>
                    <input
                      value={form.title}
                      onChange={(event) => updateForm("title", event.target.value)}
                      placeholder="Ej. Arrendamiento local comercial"
                      disabled={saving}
                    />
                  </label>

                  <label className="form-field internal-contracts-wide-field">
                    <span>Inmueble</span>
                    <input
                      value={form.propertyAddress}
                      onChange={(event) => updateForm("propertyAddress", event.target.value)}
                      placeholder="Domicilio o identificador del inmueble"
                      disabled={saving}
                    />
                  </label>

                  <label className="form-field">
                    <span>Arrendador</span>
                    <input
                      value={form.landlordName}
                      onChange={(event) => updateForm("landlordName", event.target.value)}
                      placeholder="Nombre del arrendador"
                      disabled={saving}
                    />
                  </label>

                  <label className="form-field">
                    <span>Arrendatario</span>
                    <input
                      value={form.tenantName}
                      onChange={(event) => updateForm("tenantName", event.target.value)}
                      placeholder="Nombre del arrendatario"
                      disabled={saving}
                    />
                  </label>

                  <label className="form-field">
                    <span>Inicio de vigencia</span>
                    <input
                      type="date"
                      value={form.leaseStartDate}
                      onChange={(event) => updateForm("leaseStartDate", event.target.value)}
                      disabled={saving}
                    />
                  </label>

                  <label className="form-field">
                    <span>Fin de vigencia</span>
                    <input
                      type="date"
                      value={form.leaseEndDate}
                      onChange={(event) => updateForm("leaseEndDate", event.target.value)}
                      disabled={saving}
                    />
                  </label>

                  <label className="form-field">
                    <span>Renta mensual inicial</span>
                    <div className="money-input-control">
                      <span className="money-input-prefix">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.monthlyRentMxn}
                        onChange={(event) => updateForm("monthlyRentMxn", event.target.value)}
                        placeholder="0.00"
                        disabled={saving}
                      />
                    </div>
                  </label>

                  <label className="form-field internal-contracts-wide-field">
                    <span>Notas</span>
                    <textarea
                      value={form.notes}
                      onChange={(event) => updateForm("notes", event.target.value)}
                      placeholder="Observaciones internas del contrato..."
                      disabled={saving}
                    />
                  </label>
                </div>

                {renderRenewalsEditor()}

                {contractPrefillNotes.length > 0 ? (
                  <div className="labor-file-contract-prefill-panel">
                    <div>
                      <strong>Notas IA</strong>
                      <span>{contractPrefillNotes.join(" ")}</span>
                    </div>
                  </div>
                ) : null}

                <div className="form-actions">
                  <button className="primary-button" type="submit" disabled={saving || loading || prefillingContract || Boolean(prefillingRenewalKey)}>
                    {saving ? (editingId ? "Actualizando..." : "Cargando...") : editingId ? "Actualizar contrato" : "Cargar contrato"}
                  </button>
                  {editingId ? (
                    <button className="secondary-button" type="button" onClick={() => resetForm()} disabled={saving || loading || prefillingContract || Boolean(prefillingRenewalKey)}>
                      Cancelar edición
                    </button>
                  ) : null}
                  <button className="secondary-button" type="button" onClick={() => void loadModule()} disabled={saving || loading || prefillingContract || Boolean(prefillingRenewalKey)}>
                    Refrescar
                  </button>
                </div>
              </form>
            ) : (
              <div className="centered-inline-message">Tu perfil puede consultar contratos externos, pero no cargar nuevos archivos.</div>
            )}
          </section>

          <section className="panel internal-contracts-list-panel external-contracts-management-panel">
            <div className="panel-header">
              <h2>{contractStatusView === "active" ? "Contratos activos" : "Contratos archivados"}</h2>
              <span>{filteredContracts.length} registros</span>
            </div>

            <div className="external-contracts-side-area">
              <div className="external-contracts-side-area-head">
                <div>
                  <h3>Buscador de contratos</h3>
                  <span>{filteredContracts.length} resultado{filteredContracts.length === 1 ? "" : "s"}</span>
                </div>
              </div>

              <div className="external-contracts-status-tabs" role="tablist" aria-label="Estatus de contratos de arrendamiento">
                <button
                  type="button"
                  className={`external-contracts-status-tab ${contractStatusView === "active" ? "is-active" : ""}`}
                  onClick={() => setContractStatusView("active")}
                >
                  <span>Activos</span>
                  <strong>{activeLeaseCount}</strong>
                </button>
                <button
                  type="button"
                  className={`external-contracts-status-tab ${contractStatusView === "archived" ? "is-active" : ""}`}
                  onClick={() => setContractStatusView("archived")}
                >
                  <span>Archivados</span>
                  <strong>{archivedLeaseCount}</strong>
                </button>
              </div>

              <div className="internal-contracts-toolbar external-contracts-management-toolbar">
                <label className="form-field internal-contracts-wide-field">
                  <span>Buscar</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Contrato, cliente, inmueble, partes o archivo..."
                    type="search"
                  />
                </label>

                <label className="form-field internal-contracts-wide-field">
                  <span>Cliente</span>
                  <select value={contractClientFilterId} onChange={(event) => setContractClientFilterId(event.target.value)}>
                    <option value="">Todos los clientes</option>
                    {sortClients(clients).map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.clientNumber} - {client.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="external-contracts-side-area">
              <div className="external-contracts-side-area-head">
                <div>
                  <h3>Contrato cargado</h3>
                  <span>{selectedManagedContract?.contractNumber ?? "Sin selección"}</span>
                </div>
              </div>

              <div className="internal-contracts-toolbar external-contracts-management-toolbar">
                <label className="form-field internal-contracts-wide-field">
                  <span>Contrato cargado</span>
                  <select
                    value={selectedManagedContract?.id ?? ""}
                    onChange={(event) => setSelectedContractId(event.target.value)}
                    disabled={filteredContracts.length === 0}
                  >
                    <option value="">-- Seleccionar contrato --</option>
                    {filteredContracts.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.contractNumber} - {contract.title || contract.clientName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {loading ? <div className="centered-inline-message">Cargando contratos externos...</div> : null}
              {!loading && !selectedManagedContract ? (
                <div className="centered-inline-message">
                  {contractStatusView === "active"
                    ? "No hay contratos de arrendamiento activos."
                    : "No hay contratos de arrendamiento archivados."}
                </div>
              ) : null}

              {selectedManagedContract ? (
                <article className="internal-contract-card external-contract-card">
                  <div className="internal-contract-card-head">
                    <div>
                      <span className="internal-contract-number">{selectedManagedContract.contractNumber}</span>
                      <h3>{selectedManagedContract.title}</h3>
                      <p className="internal-contract-title">{selectedManagedContract.propertyAddress || "Inmueble pendiente"}</p>
                    </div>
                    <div className="internal-contract-card-tags">
                      <span className={`status-pill ${selectedManagedContract.status === "ACTIVE" ? "status-live" : "status-migration"}`}>
                        {selectedManagedContract.status === "ACTIVE" ? "Activo" : "Archivado"}
                      </span>
                      <span className="status-pill status-live">Arrendamiento</span>
                    </div>
                  </div>

                  <div className="internal-contract-meta-grid">
                    <div>
                      <span>Archivo principal</span>
                      <strong>{selectedManagedContract.originalFileName ?? "Sin archivo"}</strong>
                      <small>{formatFileSize(selectedManagedContract.fileSizeBytes)}</small>
                    </div>
                    <div>
                      <span>Vigencia</span>
                      <strong>{formatDate(selectedManagedContract.leaseStartDate)} - {formatDate(selectedManagedContract.leaseEndDate)}</strong>
                      <small>{formatCurrency(selectedManagedContract.monthlyRentMxn)} renta mensual inicial</small>
                    </div>
                    <div>
                      <span>Partes</span>
                      <strong>{selectedManagedContract.landlordName || "Arrendador pendiente"}</strong>
                      <small>{selectedManagedContract.tenantName || "Arrendatario pendiente"}</small>
                    </div>
                  </div>

                  {selectedManagedContract.notes ? <p className="internal-contract-notes">{selectedManagedContract.notes}</p> : null}

                  <div className="table-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={downloadingId === selectedManagedContract.id}
                      onClick={() => void handleDownload(selectedManagedContract)}
                    >
                      {downloadingId === selectedManagedContract.id ? "Descargando..." : "Descargar contrato"}
                    </button>
                    {canWrite ? (
                      <button className="secondary-button" type="button" onClick={() => startEdit(selectedManagedContract)}>
                        Editar información
                      </button>
                    ) : null}
                    {canWrite ? (
                      <button
                        className="danger-button"
                        type="button"
                        disabled={deletingId === selectedManagedContract.id}
                        onClick={() => void handleDelete(selectedManagedContract)}
                      >
                        {deletingId === selectedManagedContract.id ? "Borrando..." : "Borrar"}
                      </button>
                    ) : null}
                  </div>
                </article>
              ) : null}
            </div>

            {selectedManagedContract ? (
              <>
                <div className="external-contracts-side-area is-subordinate">
                  {renderContractNextActionPanel(selectedManagedContract)}
                </div>

                <div className="external-contracts-side-area is-subordinate">
                  <div className="external-contracts-side-area-head">
                    <div>
                      <h3>Formatos de este contrato</h3>
                      <span>{(selectedManagedContract.generatedDocuments ?? []).length} generado{(selectedManagedContract.generatedDocuments ?? []).length === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  {renderGeneratedDocumentsArea(selectedManagedContract)}
                </div>

                <div className="external-contracts-side-area is-subordinate">
                  {renderManagedRenewalsEditor()}
                </div>

                <div className="external-contracts-side-area is-subordinate">
                  {renderFormatPanel()}
                </div>
              </>
            ) : null}
          </section>
        </section>
      )}
    </section>
  );
}
