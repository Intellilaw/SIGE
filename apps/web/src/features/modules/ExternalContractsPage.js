import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canReadModule, canWriteModule } from "../auth/permissions";
const MODULE_TITLE = "Administraci\u00f3n de contratos externos";
const CONTRACT_SECTION_LABEL = "Contratos de arrendamiento";
const INPC_SECTION_LABEL = "INPC";
const FORMAT_SCOPE_ORIGINAL = "original";
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
    renewals: []
};
const formatTemplateLabels = {
    "rent-increase": "Formato de aumento de renta",
    "property-delivery": "Carta de entrega recepcion de inmueble",
    "termination-agreement": "Convenio de rescision"
};
const initialRentCalculatorState = {
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
function createEmptyRenewal() {
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
function formatFileSize(value) {
    if (!value) {
        return "Sin archivo";
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
function hasRenewalFormContent(renewal) {
    return Boolean(renewal.renewalDate.trim()
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
            `La proxima fecha de renovacion registrada es ${renewalDate}. Las partes podran formalizar la actualizacion mediante addendum, aviso o convenio complementario.`
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
    const [selectedContractId, setSelectedContractId] = useState("");
    const [managedRenewals, setManagedRenewals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingRenewals, setSavingRenewals] = useState(false);
    const [prefillingContract, setPrefillingContract] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    const [uploadingRenewalDocumentId, setUploadingRenewalDocumentId] = useState(null);
    const [downloadingRenewalDocumentId, setDownloadingRenewalDocumentId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [fileInputKey, setFileInputKey] = useState(0);
    const [formatContractId, setFormatContractId] = useState("");
    const [formatRenewalId, setFormatRenewalId] = useState(FORMAT_SCOPE_ORIGINAL);
    const [formatTemplateId, setFormatTemplateId] = useState("rent-increase");
    const [formatDateValue, setFormatDateValue] = useState(dateInputValue(new Date()));
    const [generatingFormat, setGeneratingFormat] = useState(false);
    const [downloadingGeneratedDocumentId, setDownloadingGeneratedDocumentId] = useState(null);
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
    const filteredContracts = useMemo(() => {
        const search = normalizeSearchValue(query);
        const leaseContracts = contracts.filter((contract) => contract.contractType === "LEASE"
            && (!contractClientFilterId || contract.clientId === contractClientFilterId));
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
    const selectedManagedContract = useMemo(() => filteredContracts.find((contract) => contract.id === selectedContractId)
        ?? filteredContracts[0]
        ?? contracts.find((contract) => contract.id === selectedContractId)
        ?? contracts[0], [contracts, filteredContracts, selectedContractId]);
    const selectedFormatContract = useMemo(() => selectedManagedContract ?? contracts.find((contract) => contract.id === formatContractId) ?? contracts[0], [contracts, formatContractId, selectedManagedContract]);
    const selectedFormatRenewals = selectedFormatContract?.renewals ?? [];
    const selectedFormatRenewal = useMemo(() => formatRenewalId === FORMAT_SCOPE_ORIGINAL
        ? undefined
        : selectedFormatRenewals.find((renewal) => renewal.id === formatRenewalId)
            ?? (selectedFormatContract ? getLatestRenewal(selectedFormatContract) : undefined), [selectedFormatContract, selectedFormatRenewals, formatRenewalId]);
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
    const upcomingCount = contracts.filter((contract) => contract.renewals.some((renewal) => deadlineStatus(getRenewalDisplayDate(renewal)) === "soon")).length;
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
            const result = await apiPost("/external-contracts/prefill", {
                originalFileName: file.name,
                fileMimeType: file.type || "application/octet-stream",
                fileBase64: await fileToBase64(file)
            });
            setForm((current) => mergePrefillFields(current, result.fields));
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
    function removeManagedRenewal(index) {
        setManagedRenewals((current) => {
            const renewals = current.filter((_renewal, renewalIndex) => renewalIndex !== index);
            setActiveRenewalIndex((currentIndex) => Math.min(currentIndex, Math.max(renewals.length - 1, 0)));
            return renewals;
        });
        setFlash(null);
    }
    function buildRenewalPayload(renewals) {
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
    async function handleRenewalDocumentUpload(contract, renewal, file) {
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
            const document = await apiPost(`/external-contracts/${encodeURIComponent(contract.id)}/renewals/${encodeURIComponent(renewal.id)}/documents`, {
                documentType: "RENEWAL_SUPPORT",
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
            setFlash({ tone: "success", text: "Documento de renovacion cargado." });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setUploadingRenewalDocumentId(null);
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
                const generatedDocument = await apiPost(`/external-contracts/${encodeURIComponent(selectedFormatContract.id)}/formats/rent-increase`, {
                    renewalId: selectedFormatRenewal.id,
                    documentDate: formatDateValue || null
                });
                setContracts((current) => current.map((entry) => entry.id === selectedFormatContract.id
                    ? {
                        ...entry,
                        generatedDocuments: [
                            generatedDocument,
                            ...(entry.generatedDocuments ?? []).filter((document) => document.id !== generatedDocument.id)
                        ]
                    }
                    : entry));
                const { blob, filename } = await apiDownload(`/external-contracts/${encodeURIComponent(selectedFormatContract.id)}/generated-documents/${encodeURIComponent(generatedDocument.id)}`);
                downloadBlobFile(blob, filename ?? generatedDocument.originalFileName);
                setFlash({ tone: "success", text: "Formato de actualizacion de renta generado y guardado con el contrato." });
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
    function renderRenewalsEditor() {
        const activeRenewal = form.renewals[activeRenewalIndex];
        return (_jsxs("section", { className: "external-contract-renewals-editor internal-contracts-wide-field", children: [_jsxs("div", { className: "external-contract-renewals-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Renovaciones" }), _jsxs("span", { children: [form.renewals.length, " registrada", form.renewals.length === 1 ? "" : "s"] })] }), _jsx("button", { className: "secondary-button", type: "button", onClick: addRenewal, disabled: saving || prefillingContract, children: "Agregar renovacion" })] }), form.renewals.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Aun no hay renovaciones cargadas para este contrato." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "external-contract-renewal-tabs", role: "tablist", "aria-label": "Renovaciones del contrato", children: form.renewals.map((_renewal, index) => (_jsx("button", { type: "button", className: `external-contract-renewal-tab ${activeRenewalIndex === index ? "is-active" : ""}`, onClick: () => setActiveRenewalIndex(index), disabled: saving || prefillingContract, children: renewalLabel(index) }, index))) }), activeRenewal ? (_jsxs("div", { className: "external-contract-renewal-fields", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de renovacion" }), _jsx("input", { type: "date", value: activeRenewal.renewalDate, onChange: (event) => updateRenewal(activeRenewalIndex, "renewalDate", event.target.value), disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Inicio de vigencia" }), _jsx("input", { type: "date", value: activeRenewal.leaseStartDate, onChange: (event) => updateRenewal(activeRenewalIndex, "leaseStartDate", event.target.value), disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fin de vigencia" }), _jsx("input", { type: "date", value: activeRenewal.leaseEndDate, onChange: (event) => updateRenewal(activeRenewalIndex, "leaseEndDate", event.target.value), disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Monto de renta" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: activeRenewal.monthlyRentMxn, onChange: (event) => updateRenewal(activeRenewalIndex, "monthlyRentMxn", event.target.value), placeholder: "0.00", disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "% aumento" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: activeRenewal.rentIncreasePct, onChange: (event) => updateRenewal(activeRenewalIndex, "rentIncreasePct", event.target.value), placeholder: "0", disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "INPC base" }), _jsxs("select", { value: activeRenewal.inpcBasePeriod, onChange: (event) => updateRenewal(activeRenewalIndex, "inpcBasePeriod", event.target.value), disabled: saving || inpcRowsAsc.length === 0, children: [_jsx("option", { value: "", children: "-- No aplicar --" }), inpcRowsAsc.map((record) => (_jsxs("option", { value: inpcPeriodKey(record), children: [formatInpcPeriod(record), " - ", formatInpcValue(record.value)] }, record.id)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "INPC actualizacion" }), _jsxs("select", { value: activeRenewal.inpcTargetPeriod, onChange: (event) => updateRenewal(activeRenewalIndex, "inpcTargetPeriod", event.target.value), disabled: saving || inpcRowsAsc.length === 0, children: [_jsx("option", { value: "", children: "-- No aplicar --" }), inpcRowsAsc.map((record) => (_jsxs("option", { value: inpcPeriodKey(record), children: [formatInpcPeriod(record), " - ", formatInpcValue(record.value)] }, record.id)))] })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Notas" }), _jsx("textarea", { value: activeRenewal.notes, onChange: (event) => updateRenewal(activeRenewalIndex, "notes", event.target.value), placeholder: "Observaciones de esta renovacion...", disabled: saving })] }), _jsx("div", { className: "form-actions external-contract-renewal-actions", children: _jsx("button", { className: "danger-button", type: "button", onClick: () => removeRenewal(activeRenewalIndex), disabled: saving || prefillingContract, children: "Quitar renovacion" }) })] })) : null] }))] }));
    }
    function renderManagedRenewalsEditor() {
        if (!selectedManagedContract) {
            return null;
        }
        const activeRenewal = managedRenewals[activeRenewalIndex];
        return (_jsxs("section", { className: "external-contract-renewals-editor", children: [_jsxs("div", { className: "external-contract-renewals-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Renovaciones" }), _jsxs("span", { children: [managedRenewals.length, " registrada", managedRenewals.length === 1 ? "" : "s"] })] }), canWrite ? (_jsx("button", { className: "secondary-button", type: "button", onClick: addManagedRenewal, disabled: savingRenewals, children: "Agregar renovacion" })) : null] }), managedRenewals.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Aun no hay renovaciones cargadas para este contrato." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "external-contract-renewal-tabs", role: "tablist", "aria-label": "Renovaciones del contrato cargado", children: managedRenewals.map((renewal, index) => (_jsx("button", { type: "button", className: `external-contract-renewal-tab ${activeRenewalIndex === index ? "is-active" : ""}`, onClick: () => setActiveRenewalIndex(index), disabled: savingRenewals, children: renewalLabel(index) }, renewal.id ?? `draft-${index}`))) }), activeRenewal ? (_jsxs("div", { className: "external-contract-renewal-fields", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de renovacion" }), _jsx("input", { type: "date", value: activeRenewal.renewalDate, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "renewalDate", event.target.value), disabled: savingRenewals || !canWrite })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Inicio de vigencia" }), _jsx("input", { type: "date", value: activeRenewal.leaseStartDate, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "leaseStartDate", event.target.value), disabled: savingRenewals || !canWrite })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fin de vigencia" }), _jsx("input", { type: "date", value: activeRenewal.leaseEndDate, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "leaseEndDate", event.target.value), disabled: savingRenewals || !canWrite })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Monto de renta" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: activeRenewal.monthlyRentMxn, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "monthlyRentMxn", event.target.value), placeholder: "0.00", disabled: savingRenewals || !canWrite })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "% aumento" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: activeRenewal.rentIncreasePct, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "rentIncreasePct", event.target.value), placeholder: "0", disabled: savingRenewals || !canWrite })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "INPC base" }), _jsxs("select", { value: activeRenewal.inpcBasePeriod, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "inpcBasePeriod", event.target.value), disabled: savingRenewals || !canWrite || inpcRowsAsc.length === 0, children: [_jsx("option", { value: "", children: "-- No aplicar --" }), inpcRowsAsc.map((record) => (_jsxs("option", { value: inpcPeriodKey(record), children: [formatInpcPeriod(record), " - ", formatInpcValue(record.value)] }, record.id)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "INPC actualizacion" }), _jsxs("select", { value: activeRenewal.inpcTargetPeriod, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "inpcTargetPeriod", event.target.value), disabled: savingRenewals || !canWrite || inpcRowsAsc.length === 0, children: [_jsx("option", { value: "", children: "-- No aplicar --" }), inpcRowsAsc.map((record) => (_jsxs("option", { value: inpcPeriodKey(record), children: [formatInpcPeriod(record), " - ", formatInpcValue(record.value)] }, record.id)))] })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Notas" }), _jsx("textarea", { value: activeRenewal.notes, onChange: (event) => updateManagedRenewal(activeRenewalIndex, "notes", event.target.value), placeholder: "Observaciones de esta renovacion...", disabled: savingRenewals || !canWrite })] }), _jsxs("div", { className: "external-contract-renewal-documents internal-contracts-wide-field", children: [_jsxs("div", { className: "external-contract-renewal-documents-head", children: [_jsxs("div", { children: [_jsx("strong", { children: "Documentos de renovacion" }), _jsxs("span", { children: [activeRenewal.documents?.length ?? 0, " archivo", (activeRenewal.documents?.length ?? 0) === 1 ? "" : "s"] })] }), canWrite ? (_jsxs("label", { className: `secondary-button external-contract-renewal-document-upload ${!activeRenewal.id ? "is-disabled" : ""}`, children: [uploadingRenewalDocumentId === activeRenewal.id ? "Cargando..." : "Cargar documento", _jsx("input", { type: "file", accept: ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document", disabled: !activeRenewal.id || uploadingRenewalDocumentId === activeRenewal.id, onChange: (event) => {
                                                                const file = event.currentTarget.files?.[0] ?? null;
                                                                void handleRenewalDocumentUpload(selectedManagedContract, activeRenewal, file);
                                                                event.currentTarget.value = "";
                                                            } })] })) : null] }), !activeRenewal.id ? (_jsx("small", { children: "Guarda la renovacion antes de cargar documentos." })) : null, (activeRenewal.documents ?? []).length === 0 ? (_jsx("small", { children: "No hay documentos cargados para esta renovacion." })) : (_jsx("div", { className: "external-contract-renewal-document-list", children: (activeRenewal.documents ?? []).map((document) => (_jsxs("div", { className: "external-contract-renewal-document-row", children: [_jsxs("div", { children: [_jsx("strong", { children: document.originalFileName }), _jsxs("small", { children: [formatFileSize(document.fileSizeBytes), " - ", formatDate(document.createdAt)] })] }), _jsx("button", { className: "secondary-button", type: "button", disabled: downloadingRenewalDocumentId === document.id, onClick: () => void handleRenewalDocumentDownload(selectedManagedContract, activeRenewal, document), children: downloadingRenewalDocumentId === document.id ? "Descargando..." : "Descargar" })] }, document.id))) }))] }), canWrite ? (_jsxs("div", { className: "form-actions external-contract-renewal-actions", children: [_jsx("button", { className: "primary-button", type: "button", onClick: () => void saveManagedRenewals(), disabled: savingRenewals, children: savingRenewals ? "Guardando..." : "Guardar renovaciones" }), _jsx("button", { className: "danger-button", type: "button", onClick: () => removeManagedRenewal(activeRenewalIndex), disabled: savingRenewals, children: "Quitar renovacion" })] })) : null] })) : null] }))] }));
    }
    function renderFormatPanel() {
        const scopeValue = formatRenewalId || FORMAT_SCOPE_ORIGINAL;
        return (_jsxs("div", { className: "external-contracts-format-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Generar formatos" }), _jsx("span", { children: selectedManagedContract?.contractNumber ?? "Sin contrato" })] }), _jsxs("div", { className: "external-contracts-format-grid", children: [_jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Formato" }), _jsx("select", { value: formatTemplateId, onChange: (event) => setFormatTemplateId(event.target.value), disabled: !selectedManagedContract, children: Object.keys(formatTemplateLabels).map((templateId) => (_jsx("option", { value: templateId, children: formatTemplateLabels[templateId] }, templateId))) })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Base del formato" }), _jsxs("select", { value: scopeValue, onChange: (event) => setFormatRenewalId(event.target.value), disabled: !selectedManagedContract, children: [_jsx("option", { value: FORMAT_SCOPE_ORIGINAL, children: "Contrato original" }), selectedFormatRenewals.map((renewal) => (_jsxs("option", { value: renewal.id, children: [renewalLabel(renewal.sequence - 1), " - ", formatDate(getRenewalDisplayDate(renewal))] }, renewal.id)))] })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Fecha del formato" }), _jsx("input", { type: "date", value: formatDateValue, onChange: (event) => setFormatDateValue(event.target.value), disabled: !selectedManagedContract })] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "secondary-button", type: "button", disabled: !selectedManagedContract
                                || generatingFormat
                                || (formatTemplateId === "rent-increase" && (!canWrite || scopeValue === FORMAT_SCOPE_ORIGINAL || !selectedFormatRenewal)), onClick: () => void handleFormatDownload("word"), children: generatingFormat
                                ? "Generando..."
                                : formatTemplateId === "rent-increase"
                                    ? "Generar y guardar Word"
                                    : "Descargar Word" }), formatTemplateId !== "rent-increase" ? (_jsx("button", { className: "primary-button", type: "button", disabled: !selectedManagedContract, onClick: () => void handleFormatDownload("pdf"), children: "Descargar PDF" })) : null] })] }));
    }
    function renderInpcSection() {
        return (_jsxs("section", { className: "external-contracts-inpc-layout", children: [_jsxs("section", { className: "panel external-contracts-inpc-summary-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: INPC_SECTION_LABEL }), _jsx("span", { children: "Banxico SP1" })] }), _jsxs("div", { className: "external-contracts-inpc-metrics", children: [_jsxs("div", { children: [_jsx("span", { children: "Ultimo periodo" }), _jsx("strong", { children: formatInpcPeriod(latestInpc) }), _jsx("small", { children: latestInpc ? formatInpcValue(latestInpc.value) : "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Indices guardados" }), _jsx("strong", { children: inpcRecords.length }), _jsx("small", { children: "Desde enero 2025" })] }), _jsxs("div", { children: [_jsx("span", { children: "Fuente" }), _jsx("strong", { children: "Banco de Mexico" }), _jsxs("small", { children: ["Serie ", latestInpc?.sourceSeries ?? "SP1"] })] })] }), _jsx("div", { className: "form-actions", children: _jsx("button", { className: "secondary-button", type: "button", onClick: () => void loadModule(), disabled: loading, children: "Refrescar" }) })] }), _jsxs("section", { className: "panel external-contracts-inpc-calculator-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Calcular aumento de renta" }), _jsx("span", { children: "Factor INPC" })] }), _jsxs("div", { className: "external-contracts-inpc-calculator-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Renta actual" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: rentCalculator.rentMxn, onChange: (event) => updateRentCalculator("rentMxn", event.target.value), placeholder: "0.00" })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "INPC base" }), _jsxs("select", { value: rentCalculator.basePeriod, onChange: (event) => updateRentCalculator("basePeriod", event.target.value), disabled: inpcRecords.length === 0, children: [_jsx("option", { value: "", children: "-- Seleccionar --" }), inpcRowsAsc.map((record) => (_jsxs("option", { value: inpcPeriodKey(record), children: [formatInpcPeriod(record), " - ", formatInpcValue(record.value)] }, record.id)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "INPC actualizacion" }), _jsxs("select", { value: rentCalculator.targetPeriod, onChange: (event) => updateRentCalculator("targetPeriod", event.target.value), disabled: inpcRecords.length === 0, children: [_jsx("option", { value: "", children: "-- Seleccionar --" }), inpcRowsAsc.map((record) => (_jsxs("option", { value: inpcPeriodKey(record), children: [formatInpcPeriod(record), " - ", formatInpcValue(record.value)] }, record.id)))] })] })] }), _jsxs("div", { className: "external-contracts-inpc-calculation", children: [_jsxs("div", { children: [_jsx("span", { children: "Nueva renta" }), _jsx("strong", { children: rentIncreaseCalculation ? formatCurrency(rentIncreaseCalculation.updatedRentMxn) : "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Incremento" }), _jsx("strong", { children: rentIncreaseCalculation ? formatCurrency(rentIncreaseCalculation.increaseMxn) : "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Aumento" }), _jsx("strong", { children: rentIncreaseCalculation ? formatSignedPercent(rentIncreaseCalculation.increasePct) : "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Factor" }), _jsx("strong", { children: rentIncreaseCalculation ? rentIncreaseCalculation.factor.toFixed(6) : "-" })] })] })] }), _jsxs("section", { className: "panel external-contracts-inpc-table-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Indices guardados" }), _jsxs("span", { children: [inpcRecords.length, " registros"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table external-contracts-inpc-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Periodo" }), _jsx("th", { children: "INPC" }), _jsx("th", { children: "Variacion mensual" }), _jsx("th", { children: "Importado" })] }) }), _jsxs("tbody", { children: [loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: "Cargando INPC..." }) })) : null, !loading && inpcRowsDesc.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: "No hay indices INPC guardados." }) })) : null, !loading && inpcRowsDesc.map((record) => {
                                                const previous = previousInpcById.get(record.id);
                                                const monthlyChange = previous ? ((record.value - previous.value) / previous.value) * 100 : undefined;
                                                return (_jsxs("tr", { children: [_jsx("td", { children: formatInpcPeriod(record) }), _jsx("td", { children: formatInpcValue(record.value) }), _jsx("td", { children: formatSignedPercent(monthlyChange) }), _jsx("td", { children: formatDate(record.importedAt) })] }, record.id));
                                            })] })] }) })] })] }));
    }
    function renderContractCard(contract) {
        const nextRenewal = getNextRenewal(contract);
        const renewalTone = deadlineStatus(getRenewalDisplayDate(nextRenewal));
        return (_jsxs("article", { className: "internal-contract-card external-contract-card", children: [_jsxs("div", { className: "internal-contract-card-head", children: [_jsxs("div", { children: [_jsx("span", { className: "internal-contract-number", children: contract.contractNumber }), _jsx("h3", { children: contract.title }), _jsx("p", { className: "internal-contract-title", children: contract.propertyAddress || "Inmueble pendiente" })] }), _jsxs("div", { className: "internal-contract-card-tags", children: [_jsx("span", { className: `status-pill ${contract.status === "ACTIVE" ? "status-live" : "status-migration"}`, children: contract.status === "ACTIVE" ? "Activo" : "Archivado" }), _jsx("span", { className: "status-pill status-live", children: "Arrendamiento" }), contract.renewals.length > 0 ? (_jsxs("span", { className: "status-pill status-warning", children: [contract.renewals.length, " renovacion", contract.renewals.length === 1 ? "" : "es"] })) : null] })] }), _jsxs("div", { className: "internal-contract-meta-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Archivo principal" }), _jsx("strong", { children: contract.originalFileName ?? "Sin archivo" }), _jsx("small", { children: formatFileSize(contract.fileSizeBytes) })] }), _jsxs("div", { children: [_jsx("span", { children: "Vigencia" }), _jsxs("strong", { children: [formatDate(contract.leaseStartDate), " - ", formatDate(contract.leaseEndDate)] }), _jsxs("small", { children: [formatCurrency(contract.monthlyRentMxn), " renta mensual"] })] }), _jsxs("div", { children: [_jsx("span", { children: "Partes" }), _jsx("strong", { children: contract.landlordName || "Arrendador pendiente" }), _jsx("small", { children: contract.tenantName || "Arrendatario pendiente" })] })] }), _jsxs("div", { className: "external-contract-deadlines", children: [_jsxs("div", { className: `external-contract-deadline is-${renewalTone}`, children: [_jsx("span", { children: "Siguiente renovacion" }), _jsx("strong", { children: formatDate(getRenewalDisplayDate(nextRenewal)) }), _jsx("small", { children: nextRenewal ? renewalLabel(nextRenewal.sequence - 1) : "Sin renovaciones" })] }), _jsxs("div", { className: "external-contract-deadline is-ok", children: [_jsx("span", { children: "Renta renovada" }), _jsx("strong", { children: formatCurrency(nextRenewal?.monthlyRentMxn) }), _jsx("small", { children: formatPercent(nextRenewal?.rentIncreasePct) })] })] }), contract.notes ? _jsx("p", { className: "internal-contract-notes", children: contract.notes }) : null, (contract.generatedDocuments ?? []).length > 0 ? (_jsxs("div", { className: "external-contract-generated-documents", children: [_jsx("span", { children: "Formatos generados" }), (contract.generatedDocuments ?? []).map((document) => {
                            const renewal = contract.renewals.find((entry) => entry.id === document.renewalId);
                            return (_jsxs("div", { className: "external-contract-generated-document", children: [_jsxs("div", { children: [_jsx("strong", { children: document.templateTitle }), _jsxs("small", { children: [document.originalFileName, renewal ? ` - ${renewalLabel(renewal.sequence - 1)}` : "", " - ", formatDate(document.createdAt)] })] }), _jsx("button", { className: "secondary-button", type: "button", disabled: downloadingGeneratedDocumentId === document.id, onClick: () => void handleGeneratedDocumentDownload(contract, document), children: downloadingGeneratedDocumentId === document.id ? "Descargando..." : "Descargar" })] }, document.id));
                        })] })) : null, _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "secondary-button", type: "button", disabled: downloadingId === contract.id, onClick: () => void handleDownload(contract), children: downloadingId === contract.id ? "Descargando..." : "Descargar" }), canWrite ? (_jsx("button", { className: "secondary-button", type: "button", onClick: () => startEdit(contract), children: "Modificar" })) : null, canWrite ? (_jsx("button", { className: "danger-button", type: "button", disabled: deletingId === contract.id, onClick: () => void handleDelete(contract), children: deletingId === contract.id ? "Borrando..." : "Borrar" })) : null] })] }, contract.id));
    }
    if (!canRead) {
        return (_jsx("section", { className: "page-stack", children: _jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "module-hero-head", children: _jsx("div", { children: _jsx("h2", { children: MODULE_TITLE }) }) }), _jsx("p", { className: "muted", children: "Tu perfil actual no tiene permisos para consultar este modulo." })] }) }));
    }
    return (_jsxs("section", { className: "page-stack internal-contracts-page external-contracts-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Contratos" }), _jsx("div", { children: _jsx("h2", { children: MODULE_TITLE }) })] }), _jsx("p", { className: "muted", children: "Control de contratos de clientes por empresa, organizados por cliente y con fechas clave de renovacion y aumento de renta." })] }), _jsx("section", { className: "panel", children: _jsxs("div", { className: "leads-tabs internal-contracts-tabs", role: "tablist", "aria-label": "Secciones de contratos externos", children: [_jsxs("button", { type: "button", className: `lead-tab ${activeSection === "contracts" ? "is-active" : ""}`, onClick: () => setActiveSection("contracts"), children: [CONTRACT_SECTION_LABEL, " (", contracts.length, ")"] }), _jsxs("button", { type: "button", className: `lead-tab ${activeSection === "inpc" ? "is-active" : ""}`, onClick: () => setActiveSection("inpc"), children: [INPC_SECTION_LABEL, " (", inpcRecords.length, ")"] }), _jsxs("span", { className: "external-contracts-summary-pill", children: [activeCount, " activos"] }), _jsxs("span", { className: "external-contracts-summary-pill", children: [upcomingCount, " fechas proximas"] })] }) }), flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, activeSection === "inpc" ? renderInpcSection() : (_jsxs("section", { className: "internal-contracts-layout", children: [_jsxs("section", { className: "panel internal-contracts-form-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Cargar contrato" }), _jsx("span", { children: "Contrato original" })] }), canWrite ? (_jsxs("form", { className: "internal-contracts-form", onSubmit: handleSubmit, children: [_jsxs("div", { className: "internal-contracts-form-grid", children: [_jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Buscar cliente" }), _jsx("input", { value: clientSearch, onChange: (event) => setClientSearch(event.target.value), placeholder: "Escribe el nombre del cliente...", disabled: saving || loading })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Cliente" }), _jsxs("select", { value: form.clientId, onChange: (event) => updateForm("clientId", event.target.value), disabled: saving || loading, children: [_jsx("option", { value: "", children: "-- Seleccionar cliente --" }), filteredClients.map((client) => (_jsxs("option", { value: client.id, children: [client.clientNumber, " - ", client.name] }, client.id)))] })] }), _jsxs("label", { className: "form-field internal-contracts-file-field", children: [_jsx("span", { children: "Archivo Word/PDF" }), _jsx("input", { type: "file", accept: ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document", onChange: handleFileChange, disabled: saving || prefillingContract }, fileInputKey)] })] }), _jsx("div", { className: "form-actions", children: _jsx("button", { className: "secondary-button", type: "button", onClick: () => void handleContractPrefill(), disabled: saving || loading || prefillingContract || !selectedFile, children: prefillingContract ? "Extrayendo..." : "Extraer con IA" }) }), _jsxs("div", { className: "internal-contracts-form-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Estatus" }), _jsxs("select", { value: form.status, onChange: (event) => updateForm("status", event.target.value), disabled: saving, children: [_jsx("option", { value: "ACTIVE", children: "Activo" }), _jsx("option", { value: "ARCHIVED", children: "Archivado" })] })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Nombre del contrato" }), _jsx("input", { value: form.title, onChange: (event) => updateForm("title", event.target.value), placeholder: "Ej. Arrendamiento local comercial", disabled: saving })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Inmueble" }), _jsx("input", { value: form.propertyAddress, onChange: (event) => updateForm("propertyAddress", event.target.value), placeholder: "Domicilio o identificador del inmueble", disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Arrendador" }), _jsx("input", { value: form.landlordName, onChange: (event) => updateForm("landlordName", event.target.value), placeholder: "Nombre del arrendador", disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Arrendatario" }), _jsx("input", { value: form.tenantName, onChange: (event) => updateForm("tenantName", event.target.value), placeholder: "Nombre del arrendatario", disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Inicio de vigencia" }), _jsx("input", { type: "date", value: form.leaseStartDate, onChange: (event) => updateForm("leaseStartDate", event.target.value), disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fin de vigencia" }), _jsx("input", { type: "date", value: form.leaseEndDate, onChange: (event) => updateForm("leaseEndDate", event.target.value), disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Renta mensual inicial" }), _jsxs("div", { className: "money-input-control", children: [_jsx("span", { className: "money-input-prefix", children: "$" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: form.monthlyRentMxn, onChange: (event) => updateForm("monthlyRentMxn", event.target.value), placeholder: "0.00", disabled: saving })] })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Notas" }), _jsx("textarea", { value: form.notes, onChange: (event) => updateForm("notes", event.target.value), placeholder: "Observaciones internas del contrato...", disabled: saving })] })] }), contractPrefillNotes.length > 0 ? (_jsx("div", { className: "labor-file-contract-prefill-panel", children: _jsxs("div", { children: [_jsx("strong", { children: "Notas IA" }), _jsx("span", { children: contractPrefillNotes.join(" ") })] }) })) : null, _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", type: "submit", disabled: saving || loading || prefillingContract, children: saving ? "Cargando..." : "Cargar contrato" }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => void loadModule(), disabled: saving || loading || prefillingContract, children: "Refrescar" })] })] })) : (_jsx("div", { className: "centered-inline-message", children: "Tu perfil puede consultar contratos externos, pero no cargar nuevos archivos." }))] }), _jsxs("section", { className: "panel internal-contracts-list-panel external-contracts-management-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Contratos cargados" }), _jsxs("span", { children: [filteredContracts.length, " registros"] })] }), _jsxs("div", { className: "internal-contracts-toolbar external-contracts-management-toolbar", children: [_jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { value: query, onChange: (event) => setQuery(event.target.value), placeholder: "Contrato, cliente, inmueble, partes o archivo...", type: "search" })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Cliente" }), _jsxs("select", { value: contractClientFilterId, onChange: (event) => setContractClientFilterId(event.target.value), children: [_jsx("option", { value: "", children: "Todos los clientes" }), sortClients(clients).map((client) => (_jsxs("option", { value: client.id, children: [client.clientNumber, " - ", client.name] }, client.id)))] })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Contrato cargado" }), _jsxs("select", { value: selectedManagedContract?.id ?? "", onChange: (event) => setSelectedContractId(event.target.value), disabled: filteredContracts.length === 0, children: [_jsx("option", { value: "", children: "-- Seleccionar contrato --" }), filteredContracts.map((contract) => (_jsxs("option", { value: contract.id, children: [contract.contractNumber, " - ", contract.title || contract.clientName] }, contract.id)))] })] })] }), loading ? _jsx("div", { className: "centered-inline-message", children: "Cargando contratos externos..." }) : null, !loading && !selectedManagedContract ? (_jsx("div", { className: "centered-inline-message", children: "No hay contratos de arrendamiento cargados." })) : null, selectedManagedContract ? (_jsxs("div", { className: "external-contracts-selected-stack", children: [_jsxs("article", { className: "internal-contract-card external-contract-card", children: [_jsxs("div", { className: "internal-contract-card-head", children: [_jsxs("div", { children: [_jsx("span", { className: "internal-contract-number", children: selectedManagedContract.contractNumber }), _jsx("h3", { children: selectedManagedContract.title }), _jsx("p", { className: "internal-contract-title", children: selectedManagedContract.propertyAddress || "Inmueble pendiente" })] }), _jsxs("div", { className: "internal-contract-card-tags", children: [_jsx("span", { className: `status-pill ${selectedManagedContract.status === "ACTIVE" ? "status-live" : "status-migration"}`, children: selectedManagedContract.status === "ACTIVE" ? "Activo" : "Archivado" }), _jsx("span", { className: "status-pill status-live", children: "Arrendamiento" })] })] }), _jsxs("div", { className: "internal-contract-meta-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Archivo principal" }), _jsx("strong", { children: selectedManagedContract.originalFileName ?? "Sin archivo" }), _jsx("small", { children: formatFileSize(selectedManagedContract.fileSizeBytes) })] }), _jsxs("div", { children: [_jsx("span", { children: "Vigencia" }), _jsxs("strong", { children: [formatDate(selectedManagedContract.leaseStartDate), " - ", formatDate(selectedManagedContract.leaseEndDate)] }), _jsxs("small", { children: [formatCurrency(selectedManagedContract.monthlyRentMxn), " renta mensual inicial"] })] }), _jsxs("div", { children: [_jsx("span", { children: "Partes" }), _jsx("strong", { children: selectedManagedContract.landlordName || "Arrendador pendiente" }), _jsx("small", { children: selectedManagedContract.tenantName || "Arrendatario pendiente" })] })] }), selectedManagedContract.notes ? _jsx("p", { className: "internal-contract-notes", children: selectedManagedContract.notes }) : null, (selectedManagedContract.generatedDocuments ?? []).length > 0 ? (_jsxs("div", { className: "external-contract-generated-documents", children: [_jsx("span", { children: "Formatos generados" }), (selectedManagedContract.generatedDocuments ?? []).map((document) => {
                                                        const renewal = selectedManagedContract.renewals.find((entry) => entry.id === document.renewalId);
                                                        return (_jsxs("div", { className: "external-contract-generated-document", children: [_jsxs("div", { children: [_jsx("strong", { children: document.templateTitle }), _jsxs("small", { children: [document.originalFileName, renewal ? ` - ${renewalLabel(renewal.sequence - 1)}` : " - Contrato original", " - ", formatDate(document.createdAt)] })] }), _jsx("button", { className: "secondary-button", type: "button", disabled: downloadingGeneratedDocumentId === document.id, onClick: () => void handleGeneratedDocumentDownload(selectedManagedContract, document), children: downloadingGeneratedDocumentId === document.id ? "Descargando..." : "Descargar" })] }, document.id));
                                                    })] })) : null, _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "secondary-button", type: "button", disabled: downloadingId === selectedManagedContract.id, onClick: () => void handleDownload(selectedManagedContract), children: downloadingId === selectedManagedContract.id ? "Descargando..." : "Descargar contrato" }), canWrite ? (_jsx("button", { className: "danger-button", type: "button", disabled: deletingId === selectedManagedContract.id, onClick: () => void handleDelete(selectedManagedContract), children: deletingId === selectedManagedContract.id ? "Borrando..." : "Borrar" })) : null] })] }), renderManagedRenewalsEditor(), renderFormatPanel()] })) : null] })] }))] }));
}
