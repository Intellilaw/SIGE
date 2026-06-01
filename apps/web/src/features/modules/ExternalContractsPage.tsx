import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type {
  Client,
  ExternalContract,
  ExternalContractGeneratedDocument,
  ExternalContractInpc,
  ExternalContractPrefillResult,
  ExternalContractRentIncreaseCalculation,
  ExternalContractRenewal,
  ExternalContractRenewalDocument,
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
};

type RenewalFormState = {
  id?: string;
  sequence?: number;
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

type FormatTemplateId = "rent-increase" | "property-delivery" | "termination-agreement";
type ExternalContractsSection = "contracts" | "inpc";
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

const MODULE_TITLE = "Administraci\u00f3n de contratos externos";
const CONTRACT_SECTION_LABEL = "Contratos de arrendamiento";
const INPC_SECTION_LABEL = "INPC";
const FORMAT_SCOPE_ORIGINAL = "original";

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
  renewals: []
};

const formatTemplateLabels: Record<FormatTemplateId, string> = {
  "rent-increase": "Formato de aumento de renta",
  "property-delivery": "Carta de entrega recepcion de inmueble",
  "termination-agreement": "Convenio de rescision"
};

const initialRentCalculatorState: RentCalculatorState = {
  rentMxn: "",
  basePeriod: "",
  targetPeriod: ""
};

const renewalOrdinalLabels = [
  "Primera renovacion",
  "Segunda renovacion",
  "Tercera renovacion",
  "Cuarta renovacion",
  "Quinta renovacion",
  "Sexta renovacion",
  "Septima renovacion",
  "Octava renovacion",
  "Novena renovacion",
  "Decima renovacion"
];

function createEmptyRenewal(): RenewalFormState {
  return {
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

function formatFileSize(value?: number) {
  if (!value) {
    return "Sin archivo";
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

function hasRenewalFormContent(renewal: RenewalFormState) {
  return Boolean(
    renewal.renewalDate.trim()
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
      `La proxima fecha de renovacion registrada es ${renewalDate}. Las partes podran formalizar la actualizacion mediante addendum, aviso o convenio complementario.`
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
  const [selectedContractId, setSelectedContractId] = useState("");
  const [managedRenewals, setManagedRenewals] = useState<RenewalFormState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRenewals, setSavingRenewals] = useState(false);
  const [prefillingContract, setPrefillingContract] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploadingRenewalDocumentId, setUploadingRenewalDocumentId] = useState<string | null>(null);
  const [downloadingRenewalDocumentId, setDownloadingRenewalDocumentId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [formatContractId, setFormatContractId] = useState("");
  const [formatRenewalId, setFormatRenewalId] = useState(FORMAT_SCOPE_ORIGINAL);
  const [formatTemplateId, setFormatTemplateId] = useState<FormatTemplateId>("rent-increase");
  const [formatDateValue, setFormatDateValue] = useState(dateInputValue(new Date()));
  const [generatingFormat, setGeneratingFormat] = useState(false);
  const [downloadingGeneratedDocumentId, setDownloadingGeneratedDocumentId] = useState<string | null>(null);
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

  const filteredContracts = useMemo(() => {
    const search = normalizeSearchValue(query);
    const leaseContracts = contracts.filter((contract) =>
      contract.contractType === "LEASE"
      && (!contractClientFilterId || contract.clientId === contractClientFilterId)
    );

    if (!search) {
      return sortContracts(leaseContracts);
    }

    return sortContracts(leaseContracts.filter((contract) => {
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
  }, [contracts, contractClientFilterId, query]);

  const groupedContracts = useMemo(() => groupContractsByClient(filteredContracts), [filteredContracts]);
  const selectedManagedContract = useMemo(
    () => filteredContracts.find((contract) => contract.id === selectedContractId)
      ?? filteredContracts[0]
      ?? contracts.find((contract) => contract.id === selectedContractId)
      ?? contracts[0],
    [contracts, filteredContracts, selectedContractId]
  );
  const selectedFormatContract = useMemo(
    () => selectedManagedContract ?? contracts.find((contract) => contract.id === formatContractId) ?? contracts[0],
    [contracts, formatContractId, selectedManagedContract]
  );
  const selectedFormatRenewals = selectedFormatContract?.renewals ?? [];
  const selectedFormatRenewal = useMemo(
    () => formatRenewalId === FORMAT_SCOPE_ORIGINAL
      ? undefined
      : selectedFormatRenewals.find((renewal) => renewal.id === formatRenewalId)
      ?? (selectedFormatContract ? getLatestRenewal(selectedFormatContract) : undefined),
    [selectedFormatContract, selectedFormatRenewals, formatRenewalId]
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
      return;
    }

    setFormatRenewalId((current) => {
      if (current === FORMAT_SCOPE_ORIGINAL) {
        return current;
      }

      if (current && selectedFormatContract.renewals.some((renewal) => renewal.id === current)) {
        return current;
      }

      return getLatestRenewal(selectedFormatContract)?.id ?? FORMAT_SCOPE_ORIGINAL;
    });
  }, [selectedFormatContract]);

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

  const activeCount = contracts.filter((contract) => contract.status === "ACTIVE").length;
  const upcomingCount = contracts.filter((contract) =>
    contract.renewals.some((renewal) => deadlineStatus(getRenewalDisplayDate(renewal)) === "soon")
  ).length;

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
      renewals: contract.renewals.map(toRenewalFormState)
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
      setFlash({ tone: "error", text: "La extraccion con IA acepta PDF o DOCX." });
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
      setForm((current) => mergePrefillFields(current, result.fields));
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

  function removeManagedRenewal(index: number) {
    setManagedRenewals((current) => {
      const renewals = current.filter((_renewal, renewalIndex) => renewalIndex !== index);
      setActiveRenewalIndex((currentIndex) => Math.min(currentIndex, Math.max(renewals.length - 1, 0)));
      return renewals;
    });
    setFlash(null);
  }

  function buildRenewalPayload(renewals: RenewalFormState[]) {
    return renewals.map((renewal, index) => ({
      id: renewal.id ?? null,
      renewalDate: renewal.renewalDate || null,
      leaseStartDate: renewal.leaseStartDate || null,
      leaseEndDate: renewal.leaseEndDate || null,
      monthlyRentMxn: parseOptionalNumber(renewal.monthlyRentMxn, `El monto de renta de ${renewalLabel(index).toLowerCase()}`),
      rentIncreasePct: parseOptionalNumber(renewal.rentIncreasePct, `El porcentaje de aumento de ${renewalLabel(index).toLowerCase()}`),
      inpcBasePeriod: renewal.inpcBasePeriod || null,
      inpcTargetPeriod: renewal.inpcTargetPeriod || null,
      notes: renewal.notes
    }));
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
          renewalDate: renewal.renewalDate || null,
          leaseStartDate: renewal.leaseStartDate || null,
          leaseEndDate: renewal.leaseEndDate || null,
          monthlyRentMxn: parseOptionalNumber(renewal.monthlyRentMxn, `El monto de renta de ${renewalLabel(index).toLowerCase()}`),
          rentIncreasePct: parseOptionalNumber(renewal.rentIncreasePct, `El porcentaje de aumento de ${renewalLabel(index).toLowerCase()}`),
          inpcBasePeriod: renewal.inpcBasePeriod || null,
          inpcTargetPeriod: renewal.inpcTargetPeriod || null,
          notes: renewal.notes
        })),
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

  async function handleRenewalDocumentUpload(
    contract: ExternalContract,
    renewal: RenewalFormState,
    file: File | null
  ) {
    if (!file || !renewal.id) {
      setFlash({ tone: "error", text: "Guarda la renovacion antes de cargar documentos." });
      return;
    }

    if (!isSupportedContractFile(file)) {
      setFlash({ tone: "error", text: "El documento debe ser Word (.doc/.docx) o PDF." });
      return;
    }

    setUploadingRenewalDocumentId(renewal.id);
    setFlash(null);

    try {
      const document = await apiPost<ExternalContractRenewalDocument>(
        `/external-contracts/${encodeURIComponent(contract.id)}/renewals/${encodeURIComponent(renewal.id)}/documents`,
        {
          documentType: "RENEWAL_SUPPORT",
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
      setFlash({ tone: "success", text: "Documento de renovacion cargado." });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setUploadingRenewalDocumentId(null);
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

      if (output !== "word") {
        setFlash({ tone: "error", text: "El formato base de actualizacion de renta se genera en Word." });
        return;
      }

      if (!selectedFormatRenewal) {
        setFlash({ tone: "error", text: "Selecciona o agrega una renovacion para generar el formato." });
        return;
      }

      setGeneratingFormat(true);
      setFlash(null);

      try {
        const generatedDocument = await apiPost<ExternalContractGeneratedDocument>(
          `/external-contracts/${encodeURIComponent(selectedFormatContract.id)}/formats/rent-increase`,
          {
            renewalId: selectedFormatRenewal.id,
            documentDate: formatDateValue || null
          }
        );

        setContracts((current) => current.map((entry) => entry.id === selectedFormatContract.id
          ? {
              ...entry,
              generatedDocuments: [
                generatedDocument,
                ...(entry.generatedDocuments ?? []).filter((document) => document.id !== generatedDocument.id)
              ]
            }
          : entry
        ));

        const { blob, filename } = await apiDownload(
          `/external-contracts/${encodeURIComponent(selectedFormatContract.id)}/generated-documents/${encodeURIComponent(generatedDocument.id)}`
        );
        downloadBlobFile(blob, filename ?? generatedDocument.originalFileName);
        setFlash({ tone: "success", text: "Formato de actualizacion de renta generado y guardado con el contrato." });
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

  function renderRenewalsEditor() {
    const activeRenewal = form.renewals[activeRenewalIndex];

    return (
      <section className="external-contract-renewals-editor internal-contracts-wide-field">
        <div className="external-contract-renewals-head">
          <div>
            <h3>Renovaciones</h3>
            <span>{form.renewals.length} registrada{form.renewals.length === 1 ? "" : "s"}</span>
          </div>
          <button className="secondary-button" type="button" onClick={addRenewal} disabled={saving || prefillingContract}>
            Agregar renovacion
          </button>
        </div>

        {form.renewals.length === 0 ? (
          <div className="centered-inline-message">Aun no hay renovaciones cargadas para este contrato.</div>
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
                <label className="form-field">
                  <span>Fecha de renovacion</span>
                  <input
                    type="date"
                    value={activeRenewal.renewalDate}
                    onChange={(event) => updateRenewal(activeRenewalIndex, "renewalDate", event.target.value)}
                    disabled={saving}
                  />
                </label>

                <label className="form-field">
                  <span>Inicio de vigencia</span>
                  <input
                    type="date"
                    value={activeRenewal.leaseStartDate}
                    onChange={(event) => updateRenewal(activeRenewalIndex, "leaseStartDate", event.target.value)}
                    disabled={saving}
                  />
                </label>

                <label className="form-field">
                  <span>Fin de vigencia</span>
                  <input
                    type="date"
                    value={activeRenewal.leaseEndDate}
                    onChange={(event) => updateRenewal(activeRenewalIndex, "leaseEndDate", event.target.value)}
                    disabled={saving}
                  />
                </label>

                <label className="form-field">
                  <span>Monto de renta</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={activeRenewal.monthlyRentMxn}
                    onChange={(event) => updateRenewal(activeRenewalIndex, "monthlyRentMxn", event.target.value)}
                    placeholder="0.00"
                    disabled={saving}
                  />
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
                    disabled={saving}
                  />
                </label>

                <label className="form-field">
                  <span>INPC base</span>
                  <select
                    value={activeRenewal.inpcBasePeriod}
                    onChange={(event) => updateRenewal(activeRenewalIndex, "inpcBasePeriod", event.target.value)}
                    disabled={saving || inpcRowsAsc.length === 0}
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
                  <span>INPC actualizacion</span>
                  <select
                    value={activeRenewal.inpcTargetPeriod}
                    onChange={(event) => updateRenewal(activeRenewalIndex, "inpcTargetPeriod", event.target.value)}
                    disabled={saving || inpcRowsAsc.length === 0}
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
                    placeholder="Observaciones de esta renovacion..."
                    disabled={saving}
                  />
                </label>

                <div className="form-actions external-contract-renewal-actions">
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => removeRenewal(activeRenewalIndex)}
                    disabled={saving || prefillingContract}
                  >
                    Quitar renovacion
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
            <button className="secondary-button" type="button" onClick={addManagedRenewal} disabled={savingRenewals}>
              Agregar renovacion
            </button>
          ) : null}
        </div>

        {managedRenewals.length === 0 ? (
          <div className="centered-inline-message">Aun no hay renovaciones cargadas para este contrato.</div>
        ) : (
          <>
            <div className="external-contract-renewal-tabs" role="tablist" aria-label="Renovaciones del contrato cargado">
              {managedRenewals.map((renewal, index) => (
                <button
                  key={renewal.id ?? `draft-${index}`}
                  type="button"
                  className={`external-contract-renewal-tab ${activeRenewalIndex === index ? "is-active" : ""}`}
                  onClick={() => setActiveRenewalIndex(index)}
                  disabled={savingRenewals}
                >
                  {renewalLabel(index)}
                </button>
              ))}
            </div>

            {activeRenewal ? (
              <div className="external-contract-renewal-fields">
                <label className="form-field">
                  <span>Fecha de renovacion</span>
                  <input
                    type="date"
                    value={activeRenewal.renewalDate}
                    onChange={(event) => updateManagedRenewal(activeRenewalIndex, "renewalDate", event.target.value)}
                    disabled={savingRenewals || !canWrite}
                  />
                </label>

                <label className="form-field">
                  <span>Inicio de vigencia</span>
                  <input
                    type="date"
                    value={activeRenewal.leaseStartDate}
                    onChange={(event) => updateManagedRenewal(activeRenewalIndex, "leaseStartDate", event.target.value)}
                    disabled={savingRenewals || !canWrite}
                  />
                </label>

                <label className="form-field">
                  <span>Fin de vigencia</span>
                  <input
                    type="date"
                    value={activeRenewal.leaseEndDate}
                    onChange={(event) => updateManagedRenewal(activeRenewalIndex, "leaseEndDate", event.target.value)}
                    disabled={savingRenewals || !canWrite}
                  />
                </label>

                <label className="form-field">
                  <span>Monto de renta</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={activeRenewal.monthlyRentMxn}
                    onChange={(event) => updateManagedRenewal(activeRenewalIndex, "monthlyRentMxn", event.target.value)}
                    placeholder="0.00"
                    disabled={savingRenewals || !canWrite}
                  />
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
                    disabled={savingRenewals || !canWrite}
                  />
                </label>

                <label className="form-field">
                  <span>INPC base</span>
                  <select
                    value={activeRenewal.inpcBasePeriod}
                    onChange={(event) => updateManagedRenewal(activeRenewalIndex, "inpcBasePeriod", event.target.value)}
                    disabled={savingRenewals || !canWrite || inpcRowsAsc.length === 0}
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
                  <span>INPC actualizacion</span>
                  <select
                    value={activeRenewal.inpcTargetPeriod}
                    onChange={(event) => updateManagedRenewal(activeRenewalIndex, "inpcTargetPeriod", event.target.value)}
                    disabled={savingRenewals || !canWrite || inpcRowsAsc.length === 0}
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
                    placeholder="Observaciones de esta renovacion..."
                    disabled={savingRenewals || !canWrite}
                  />
                </label>

                <div className="external-contract-renewal-documents internal-contracts-wide-field">
                  <div className="external-contract-renewal-documents-head">
                    <div>
                      <strong>Documentos de renovacion</strong>
                      <span>{activeRenewal.documents?.length ?? 0} archivo{(activeRenewal.documents?.length ?? 0) === 1 ? "" : "s"}</span>
                    </div>
                    {canWrite ? (
                      <label className={`secondary-button external-contract-renewal-document-upload ${!activeRenewal.id ? "is-disabled" : ""}`}>
                        {uploadingRenewalDocumentId === activeRenewal.id ? "Cargando..." : "Cargar documento"}
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          disabled={!activeRenewal.id || uploadingRenewalDocumentId === activeRenewal.id}
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0] ?? null;
                            void handleRenewalDocumentUpload(selectedManagedContract, activeRenewal, file);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    ) : null}
                  </div>

                  {!activeRenewal.id ? (
                    <small>Guarda la renovacion antes de cargar documentos.</small>
                  ) : null}

                  {(activeRenewal.documents ?? []).length === 0 ? (
                    <small>No hay documentos cargados para esta renovacion.</small>
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
                      disabled={savingRenewals}
                    >
                      {savingRenewals ? "Guardando..." : "Guardar renovaciones"}
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => removeManagedRenewal(activeRenewalIndex)}
                      disabled={savingRenewals}
                    >
                      Quitar renovacion
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

  function renderFormatPanel() {
    const scopeValue = formatRenewalId || FORMAT_SCOPE_ORIGINAL;

    return (
      <div className="external-contracts-format-panel">
        <div className="panel-header">
          <h2>Generar formatos</h2>
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
            <span>Base del formato</span>
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

          <label className="form-field internal-contracts-wide-field">
            <span>Fecha del formato</span>
            <input
              type="date"
              value={formatDateValue}
              onChange={(event) => setFormatDateValue(event.target.value)}
              disabled={!selectedManagedContract}
            />
          </label>
        </div>

        <div className="form-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={
              !selectedManagedContract
              || generatingFormat
              || (formatTemplateId === "rent-increase" && (!canWrite || scopeValue === FORMAT_SCOPE_ORIGINAL || !selectedFormatRenewal))
            }
            onClick={() => void handleFormatDownload("word")}
          >
            {generatingFormat
              ? "Generando..."
              : formatTemplateId === "rent-increase"
                ? "Generar y guardar Word"
                : "Descargar Word"}
          </button>
          {formatTemplateId !== "rent-increase" ? (
            <button
              className="primary-button"
              type="button"
              disabled={!selectedManagedContract}
              onClick={() => void handleFormatDownload("pdf")}
            >
              Descargar PDF
            </button>
          ) : null}
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
              <span>INPC actualizacion</span>
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
                {contract.renewals.length} renovacion{contract.renewals.length === 1 ? "" : "es"}
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
            <span>Siguiente renovacion</span>
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
              Modificar
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
          Control de contratos de clientes por empresa, organizados por cliente y con fechas clave de renovacion y aumento de renta.
        </p>
      </header>

      <section className="panel">
        <div className="leads-tabs internal-contracts-tabs" role="tablist" aria-label="Secciones de contratos externos">
          <button
            type="button"
            className={`lead-tab ${activeSection === "contracts" ? "is-active" : ""}`}
            onClick={() => setActiveSection("contracts")}
          >
            {CONTRACT_SECTION_LABEL} ({contracts.length})
          </button>
          <button
            type="button"
            className={`lead-tab ${activeSection === "inpc" ? "is-active" : ""}`}
            onClick={() => setActiveSection("inpc")}
          >
            {INPC_SECTION_LABEL} ({inpcRecords.length})
          </button>
          <span className="external-contracts-summary-pill">{activeCount} activos</span>
          <span className="external-contracts-summary-pill">{upcomingCount} fechas proximas</span>
        </div>
      </section>

      {flash ? (
        <div className={`message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`}>
          {flash.text}
        </div>
      ) : null}

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      {activeSection === "inpc" ? renderInpcSection() : (
        <section className="internal-contracts-layout">
          <section className="panel internal-contracts-form-panel">
            <div className="panel-header">
              <h2>Cargar contrato</h2>
              <span>Contrato original</span>
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

                {contractPrefillNotes.length > 0 ? (
                  <div className="labor-file-contract-prefill-panel">
                    <div>
                      <strong>Notas IA</strong>
                      <span>{contractPrefillNotes.join(" ")}</span>
                    </div>
                  </div>
                ) : null}

                <div className="form-actions">
                  <button className="primary-button" type="submit" disabled={saving || loading || prefillingContract}>
                    {saving ? "Cargando..." : "Cargar contrato"}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => void loadModule()} disabled={saving || loading || prefillingContract}>
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
              <h2>Contratos cargados</h2>
              <span>{filteredContracts.length} registros</span>
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
              <div className="centered-inline-message">No hay contratos de arrendamiento cargados.</div>
            ) : null}

            {selectedManagedContract ? (
              <div className="external-contracts-selected-stack">
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

                  {(selectedManagedContract.generatedDocuments ?? []).length > 0 ? (
                    <div className="external-contract-generated-documents">
                      <span>Formatos generados</span>
                      {(selectedManagedContract.generatedDocuments ?? []).map((document) => {
                        const renewal = selectedManagedContract.renewals.find((entry) => entry.id === document.renewalId);

                        return (
                          <div className="external-contract-generated-document" key={document.id}>
                            <div>
                              <strong>{document.templateTitle}</strong>
                              <small>
                                {document.originalFileName}
                                {renewal ? ` - ${renewalLabel(renewal.sequence - 1)}` : " - Contrato original"}
                                {" - "}
                                {formatDate(document.createdAt)}
                              </small>
                            </div>
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={downloadingGeneratedDocumentId === document.id}
                              onClick={() => void handleGeneratedDocumentDownload(selectedManagedContract, document)}
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
                      disabled={downloadingId === selectedManagedContract.id}
                      onClick={() => void handleDownload(selectedManagedContract)}
                    >
                      {downloadingId === selectedManagedContract.id ? "Descargando..." : "Descargar contrato"}
                    </button>
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

                {renderManagedRenewalsEditor()}
                {renderFormatPanel()}
              </div>
            ) : null}
          </section>
        </section>
      )}
    </section>
  );
}
