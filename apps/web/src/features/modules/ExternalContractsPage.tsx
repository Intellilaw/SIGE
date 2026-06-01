import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type { Client, ExternalContract, ExternalContractStatus } from "@sige/contracts";

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
  contractNumber: string;
  title: string;
  clientId: string;
  propertyAddress: string;
  landlordName: string;
  tenantName: string;
  leaseStartDate: string;
  leaseEndDate: string;
  renewalDate: string;
  rentIncreaseDate: string;
  monthlyRentMxn: string;
  rentIncreasePct: string;
  status: ExternalContractStatus;
  notes: string;
};

type FormatTemplateId = "rent-increase" | "property-delivery" | "termination-agreement";
type GeneratedFormat = {
  title: string;
  subtitle: string;
  paragraphs: string[];
  signatures: string[];
};

const MODULE_TITLE = "Administraci\u00f3n de contratos externos";
const CONTRACT_SECTION_LABEL = "Contratos de arrendamiento";

const initialFormState: ContractFormState = {
  contractNumber: "",
  title: "",
  clientId: "",
  propertyAddress: "",
  landlordName: "",
  tenantName: "",
  leaseStartDate: "",
  leaseEndDate: "",
  renewalDate: "",
  rentIncreaseDate: "",
  monthlyRentMxn: "",
  rentIncreasePct: "",
  status: "ACTIVE",
  notes: ""
};

const formatTemplateLabels: Record<FormatTemplateId, string> = {
  "rent-increase": "Formato de aumento de renta",
  "property-delivery": "Carta de entrega recepcion de inmueble",
  "termination-agreement": "Convenio de rescision"
};

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

function buildGeneratedFormat(contract: ExternalContract, templateId: FormatTemplateId, documentDate: string): GeneratedFormat {
  const todayLabel = formatLongDate(documentDate);
  const property = valueOrFallback(contract.propertyAddress, "el inmueble materia del contrato");
  const landlord = valueOrFallback(contract.landlordName, "el arrendador");
  const tenant = valueOrFallback(contract.tenantName, "el arrendatario");
  const rent = formatCurrency(contract.monthlyRentMxn);
  const increase = formatPercent(contract.rentIncreasePct);
  const renewalDate = formatLongDate(contract.renewalDate);
  const rentIncreaseDate = formatLongDate(contract.rentIncreaseDate);

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
      `La renta mensual vigente registrada es ${rent}. El porcentaje de aumento registrado es ${increase}, aplicable a partir del ${rentIncreaseDate}.`,
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
  const [contracts, setContracts] = useState<ExternalContract[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState<ContractFormState>(initialFormState);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [formatContractId, setFormatContractId] = useState("");
  const [formatTemplateId, setFormatTemplateId] = useState<FormatTemplateId>("rent-increase");
  const [formatDateValue, setFormatDateValue] = useState(dateInputValue(new Date()));
  const [flash, setFlash] = useState<FlashState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadModule() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [contractRows, clientRows] = await Promise.all([
        canRead ? apiGet<ExternalContract[]>("/external-contracts") : Promise.resolve([]),
        canWrite ? apiGet<Client[]>("/clients") : Promise.resolve([])
      ]);

      setContracts(contractRows);
      setClients(sortClients(clientRows));
      setFormatContractId((current) => current || contractRows[0]?.id || "");
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
    const leaseContracts = contracts.filter((contract) => contract.contractType === "LEASE");

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
        contract.notes
      ].filter(Boolean).join(" "));

      return haystack.includes(search);
    }));
  }, [contracts, query]);

  const groupedContracts = useMemo(() => groupContractsByClient(filteredContracts), [filteredContracts]);
  const selectedFormatContract = useMemo(
    () => contracts.find((contract) => contract.id === formatContractId) ?? contracts[0],
    [contracts, formatContractId]
  );

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
    deadlineStatus(contract.renewalDate) === "soon" || deadlineStatus(contract.rentIncreaseDate) === "soon"
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
    setFileInputKey((current) => current + 1);
    if (clearFlash) {
      setFlash(null);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setFlash(null);
  }

  function startEdit(contract: ExternalContract) {
    setEditingId(contract.id);
    setForm({
      contractNumber: contract.contractNumber,
      title: contract.title,
      clientId: contract.clientId,
      propertyAddress: contract.propertyAddress ?? "",
      landlordName: contract.landlordName ?? "",
      tenantName: contract.tenantName ?? "",
      leaseStartDate: contract.leaseStartDate ?? "",
      leaseEndDate: contract.leaseEndDate ?? "",
      renewalDate: contract.renewalDate ?? "",
      rentIncreaseDate: contract.rentIncreaseDate ?? "",
      monthlyRentMxn: contract.monthlyRentMxn ? String(contract.monthlyRentMxn) : "",
      rentIncreasePct: contract.rentIncreasePct ? String(contract.rentIncreasePct) : "",
      status: contract.status,
      notes: contract.notes ?? ""
    });
    setClientSearch("");
    setSelectedFile(null);
    setFileInputKey((current) => current + 1);
    setFlash(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

    if (!form.contractNumber.trim()) {
      setFlash({ tone: "error", text: "Escribe el numero de contrato." });
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
        contractNumber: form.contractNumber.trim(),
        title: form.title.trim(),
        contractType: "LEASE",
        status: form.status,
        clientId: form.clientId,
        propertyAddress: form.propertyAddress,
        landlordName: form.landlordName,
        tenantName: form.tenantName,
        leaseStartDate: form.leaseStartDate || null,
        leaseEndDate: form.leaseEndDate || null,
        renewalDate: form.renewalDate || null,
        rentIncreaseDate: form.rentIncreaseDate || null,
        monthlyRentMxn: parseOptionalNumber(form.monthlyRentMxn, "La renta mensual"),
        rentIncreasePct: parseOptionalNumber(form.rentIncreasePct, "El porcentaje de aumento"),
        notes: form.notes,
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

  function renderContractCard(contract: ExternalContract) {
    const renewalTone = deadlineStatus(contract.renewalDate);
    const increaseTone = deadlineStatus(contract.rentIncreaseDate);

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
            <span>Renovacion</span>
            <strong>{formatDate(contract.renewalDate)}</strong>
          </div>
          <div className={`external-contract-deadline is-${increaseTone}`}>
            <span>Aumento de renta</span>
            <strong>{formatDate(contract.rentIncreaseDate)}</strong>
            <small>{formatPercent(contract.rentIncreasePct)}</small>
          </div>
        </div>

        {contract.notes ? <p className="internal-contract-notes">{contract.notes}</p> : null}

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
          <button type="button" className="lead-tab is-active">
            {CONTRACT_SECTION_LABEL} ({contracts.length})
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

      <section className="internal-contracts-layout">
        <section className="panel internal-contracts-form-panel">
          <div className="panel-header">
            <h2>{editingId ? "Modificar contrato" : "Cargar contrato"}</h2>
            <span>Arrendamiento</span>
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

                <label className="form-field">
                  <span>Numero de contrato</span>
                  <input
                    value={form.contractNumber}
                    onChange={(event) => updateForm("contractNumber", event.target.value)}
                    placeholder="Ej. ARR-CLIENTE-001"
                    disabled={saving}
                  />
                </label>

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
                  <span>Fecha de renovacion</span>
                  <input
                    type="date"
                    value={form.renewalDate}
                    onChange={(event) => updateForm("renewalDate", event.target.value)}
                    disabled={saving}
                  />
                </label>

                <label className="form-field">
                  <span>Fecha de aumento de renta</span>
                  <input
                    type="date"
                    value={form.rentIncreaseDate}
                    onChange={(event) => updateForm("rentIncreaseDate", event.target.value)}
                    disabled={saving}
                  />
                </label>

                <label className="form-field">
                  <span>Renta mensual</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.monthlyRentMxn}
                    onChange={(event) => updateForm("monthlyRentMxn", event.target.value)}
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
                    value={form.rentIncreasePct}
                    onChange={(event) => updateForm("rentIncreasePct", event.target.value)}
                    placeholder="0"
                    disabled={saving}
                  />
                </label>

                <label className="form-field internal-contracts-file-field">
                  <span>{editingId ? "Reemplazar archivo Word/PDF" : "Archivo Word/PDF"}</span>
                  <input
                    key={fileInputKey}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleFileChange}
                    disabled={saving}
                  />
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

              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={saving || loading}>
                  {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Guardar contrato"}
                </button>
                {editingId ? (
                  <button className="secondary-button" type="button" onClick={() => resetForm()} disabled={saving}>
                    Cancelar edicion
                  </button>
                ) : null}
                <button className="secondary-button" type="button" onClick={() => void loadModule()} disabled={saving || loading}>
                  Refrescar
                </button>
              </div>
            </form>
          ) : (
            <div className="centered-inline-message">Tu perfil puede consultar contratos externos, pero no cargar nuevos archivos.</div>
          )}

          <div className="external-contracts-format-panel">
            <div className="panel-header">
              <h2>Generar formatos</h2>
              <span>Arrendamiento</span>
            </div>

            <div className="external-contracts-format-grid">
              <label className="form-field internal-contracts-wide-field">
                <span>Contrato base</span>
                <select
                  value={selectedFormatContract?.id ?? ""}
                  onChange={(event) => setFormatContractId(event.target.value)}
                  disabled={contracts.length === 0}
                >
                  <option value="">-- Seleccionar contrato --</option>
                  {sortContracts(contracts).map((contract) => (
                    <option key={contract.id} value={contract.id}>
                      {contract.contractNumber} - {contract.clientName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field internal-contracts-wide-field">
                <span>Formato</span>
                <select
                  value={formatTemplateId}
                  onChange={(event) => setFormatTemplateId(event.target.value as FormatTemplateId)}
                  disabled={contracts.length === 0}
                >
                  {(Object.keys(formatTemplateLabels) as FormatTemplateId[]).map((templateId) => (
                    <option key={templateId} value={templateId}>
                      {formatTemplateLabels[templateId]}
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
                  disabled={contracts.length === 0}
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={!selectedFormatContract}
                onClick={() => void handleFormatDownload("word")}
              >
                Descargar Word
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={!selectedFormatContract}
                onClick={() => void handleFormatDownload("pdf")}
              >
                Descargar PDF
              </button>
            </div>
          </div>
        </section>

        <section className="panel internal-contracts-list-panel">
          <div className="panel-header">
            <h2>{CONTRACT_SECTION_LABEL}</h2>
            <span>{filteredContracts.length} registros</span>
          </div>

          <div className="internal-contracts-toolbar">
            <label className="form-field">
              <span>Buscar</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Contrato, cliente, inmueble, partes o archivo..."
                type="search"
              />
            </label>
          </div>

          <div className="internal-contracts-list" aria-live="polite">
            {loading ? <div className="centered-inline-message">Cargando contratos externos...</div> : null}
            {!loading && filteredContracts.length === 0 ? (
              <div className="centered-inline-message">No hay contratos de arrendamiento cargados.</div>
            ) : null}
            {!loading && groupedContracts.map((group) => (
              <section className="internal-contract-group" key={group.key}>
                <div className="internal-contract-group-head">
                  <h3>{group.label}</h3>
                  <span>{group.contracts.length} contrato{group.contracts.length === 1 ? "" : "s"}</span>
                </div>
                <div className="internal-contract-group-list">
                  {group.contracts.map((contract) => renderContractCard(contract))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </section>
    </section>
  );
}
