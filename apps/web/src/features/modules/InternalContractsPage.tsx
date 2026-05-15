import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type {
  Client,
  InternalContract,
  InternalContractCollaborator,
  InternalContractPaymentMilestone,
  InternalContractTemplate,
  InternalContractType,
  Quote
} from "@sige/contracts";

import { apiDelete, apiDownload, apiGet, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

type FlashState =
  | {
      tone: "success" | "error";
      text: string;
    }
  | null;

type ContractFormState = {
  contractNumber: string;
  templateTitle: string;
  clientId: string;
  collaboratorName: string;
  documentKind: InternalContract["documentKind"];
  milestonesText: string;
  notes: string;
};

type InternalContractSection = InternalContractType | "TEMPLATES";

const MODULE_TITLE = "Administraci\u00f3n de contratos internos";
const LABOR_FILE_CONTRACT_ID_PREFIX = "labor-file-document:";

const SECTION_LABELS: Record<InternalContractSection, string> = {
  PROFESSIONAL_SERVICES: "Contratos de prestaci\u00f3n de servicios profesionales",
  LABOR: "Contratos laborales",
  TEMPLATES: "Contratos machote"
};

const initialFormState: ContractFormState = {
  contractNumber: "",
  templateTitle: "",
  clientId: "",
  collaboratorName: "",
  documentKind: "CONTRACT",
  milestonesText: "",
  notes: ""
};

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function hasPermission(permissions: string[] | undefined, permission: string) {
  return Boolean(permissions?.includes("*") || permissions?.includes(permission));
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

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("es-MX");
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

function formatMilestone(milestone: InternalContractPaymentMilestone) {
  const parts = [
    milestone.dueDate ? formatDate(milestone.dueDate) : "",
    milestone.label,
    milestone.amountMxn ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(milestone.amountMxn) : "",
    milestone.notes ?? ""
  ].filter(Boolean);

  return parts.join(" - ");
}

function dateFromSlashFormat(value: string) {
  const match = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!match) {
    return "";
  }

  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  return `${match[3]}-${month}-${day}`;
}

function parseMilestoneLines(value: string): InternalContractPaymentMilestone[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const isoDate = line.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? dateFromSlashFormat(line);
      const amountMatch = line.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/) ?? line.match(/\bMXN\s?(\d[\d,]*(?:\.\d{1,2})?)/i);
      const amountMxn = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : 0;
      const label = line
        .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
        .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, "")
        .replace(/\$?\s?\d[\d,]*(?:\.\d{1,2})?/g, "")
        .replace(/[|:;-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      return {
        id: `milestone-${index + 1}`,
        label: label || line,
        dueDate: isoDate || undefined,
        amountMxn: Number.isFinite(amountMxn) && amountMxn > 0 ? amountMxn : undefined
      };
    });
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

function sortContracts(items: InternalContract[]) {
  return [...items].sort((left, right) =>
    left.contractNumber.localeCompare(right.contractNumber, "es-MX", { numeric: true, sensitivity: "base" })
  );
}

function sortContractTemplates(items: InternalContractTemplate[]) {
  return [...items].sort((left, right) =>
    left.title.localeCompare(right.title, "es-MX", { numeric: true, sensitivity: "base" })
  );
}

function sortQuotes(items: Quote[]) {
  return [...items].sort((left, right) =>
    left.quoteNumber.localeCompare(right.quoteNumber, "es-MX", { numeric: true, sensitivity: "base" })
  );
}

async function fetchOptionalRows<T>(request: Promise<T[]>) {
  try {
    return await request;
  } catch {
    return [];
  }
}

function normalizeIdentifierSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function buildLaborContractNumber(form: ContractFormState) {
  const collaborator = normalizeIdentifierSegment(form.collaboratorName || "COLABORADOR");
  const documentKind = form.documentKind === "ADDENDUM" ? "ADD" : "LAB";
  return `RC-${documentKind}-${collaborator}-${Date.now()}`;
}

function contractOwnerLabel(contract: InternalContract) {
  if (contract.contractType === "PROFESSIONAL_SERVICES") {
    return [contract.clientNumber, contract.clientName].filter(Boolean).join(" - ") || "-";
  }

  return contract.collaboratorName ?? "-";
}

function isLaborFileBackedContract(contract: InternalContract) {
  return contract.id.startsWith(LABOR_FILE_CONTRACT_ID_PREFIX);
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function InternalContractsPage() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<InternalContractSection>("PROFESSIONAL_SERVICES");
  const [contracts, setContracts] = useState<InternalContract[]>([]);
  const [templates, setTemplates] = useState<InternalContractTemplate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [collaborators, setCollaborators] = useState<InternalContractCollaborator[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [form, setForm] = useState<ContractFormState>(initialFormState);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canReadContracts = hasPermission(user?.permissions, "internal-contracts:read") || hasPermission(user?.permissions, "internal-contracts:write");
  const canReadTemplates = hasPermission(user?.permissions, "internal-contract-templates:read");
  const canRead = canReadContracts || canReadTemplates;
  const canWrite = hasPermission(user?.permissions, "internal-contracts:write");
  const isSuperadmin = user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN";
  const canUploadTemplate = Boolean(isSuperadmin);
  const canSubmitActiveSection = activeSection === "TEMPLATES" ? canUploadTemplate : canWrite;
  const isTemplateSection = activeSection === "TEMPLATES";

  async function loadModule() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [contractRows, templateRows, clientRows, collaboratorRows, quoteRows] = await Promise.all([
        canReadContracts ? apiGet<InternalContract[]>("/internal-contracts") : Promise.resolve([]),
        canReadTemplates ? apiGet<InternalContractTemplate[]>("/internal-contracts/templates") : Promise.resolve([]),
        canWrite ? fetchOptionalRows(apiGet<Client[]>("/clients")) : Promise.resolve([]),
        canWrite ? fetchOptionalRows(apiGet<InternalContractCollaborator[]>("/internal-contracts/collaborators")) : Promise.resolve([]),
        canWrite ? fetchOptionalRows(apiGet<Quote[]>("/quotes")) : Promise.resolve([])
      ]);

      setContracts(contractRows);
      setTemplates(templateRows);
      setClients(sortClients(clientRows));
      setCollaborators(collaboratorRows);
      setQuotes(quoteRows);
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
  }, [canRead, canReadContracts, canReadTemplates, canWrite]);

  const visibleSections = useMemo(() => {
    const sections: InternalContractSection[] = [];

    if (canReadContracts) {
      sections.push("PROFESSIONAL_SERVICES", "LABOR");
    }

    if (canReadTemplates) {
      sections.push("TEMPLATES");
    }

    return sections;
  }, [canReadContracts, canReadTemplates]);

  useEffect(() => {
    if (visibleSections.length > 0 && !visibleSections.includes(activeSection)) {
      setActiveSection(visibleSections[0]);
    }
  }, [activeSection, visibleSections]);

  const sectionCounts = useMemo(() => ({
    PROFESSIONAL_SERVICES: contracts.filter((contract) => contract.contractType === "PROFESSIONAL_SERVICES").length,
    LABOR: contracts.filter((contract) => contract.contractType === "LABOR").length,
    TEMPLATES: templates.length
  }), [contracts, templates]);

  const filteredContracts = useMemo(() => {
    if (activeSection === "TEMPLATES") {
      return [];
    }

    const search = normalizeSearchValue(query);
    const sectionContracts = contracts.filter((contract) => contract.contractType === activeSection);

    if (!search) {
      return sortContracts(sectionContracts);
    }

    return sortContracts(sectionContracts.filter((contract) => {
      const haystack = normalizeSearchValue([
        contract.contractNumber,
        contract.clientNumber,
        contract.clientName,
        contract.collaboratorName,
        contract.originalFileName,
        contract.notes,
        ...contract.paymentMilestones.map(formatMilestone)
      ].filter(Boolean).join(" "));

      return haystack.includes(search);
    }));
  }, [activeSection, contracts, query]);

  const filteredTemplates = useMemo(() => {
    const search = normalizeSearchValue(query);

    if (!search) {
      return sortContractTemplates(templates);
    }

    return sortContractTemplates(templates.filter((template) => {
      const haystack = normalizeSearchValue([
        template.title,
        template.originalFileName,
        template.notes
      ].filter(Boolean).join(" "));

      return haystack.includes(search);
    }));
  }, [query, templates]);

  const selectedClientQuotes = useMemo(
    () => sortQuotes(quotes.filter((quote) => quote.clientId === form.clientId)),
    [form.clientId, quotes]
  );
  const parsedMilestones = useMemo(() => parseMilestoneLines(form.milestonesText), [form.milestonesText]);

  function updateForm<K extends keyof ContractFormState>(key: K, value: ContractFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFlash(null);
  }

  function handleSectionChange(section: InternalContractSection) {
    setActiveSection(section);
    setForm(initialFormState);
    setSelectedFile(null);
    setFlash(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setFlash(null);
  }

  function handleClientChange(clientId: string) {
    setForm((current) => ({ ...current, clientId, contractNumber: "" }));
    setFlash(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (activeSection === "TEMPLATES") {
      if (!canUploadTemplate) {
        setFlash({ tone: "error", text: "Solo el superadmin puede cargar contratos machote." });
        return;
      }

      const title = form.templateTitle.trim();

      if (!title) {
        setFlash({ tone: "error", text: "Escribe el nombre del contrato machote." });
        return;
      }

      if (!selectedFile) {
        setFlash({ tone: "error", text: "Carga el archivo del contrato machote." });
        return;
      }

      setSaving(true);
      setFlash(null);

      try {
        const created = await apiPost<InternalContractTemplate>("/internal-contracts/templates", {
          title,
          notes: form.notes,
          originalFileName: selectedFile.name,
          fileMimeType: selectedFile.type || "application/octet-stream",
          fileBase64: await fileToBase64(selectedFile)
        });

        setTemplates((current) => [created, ...current]);
        setForm(initialFormState);
        setSelectedFile(null);
        setFlash({ tone: "success", text: `Machote ${created.title} cargado correctamente.` });
        event.currentTarget.reset();
      } catch (error) {
        setFlash({ tone: "error", text: toErrorMessage(error) });
      } finally {
        setSaving(false);
      }

      return;
    }

    if (activeSection === "PROFESSIONAL_SERVICES" && !form.clientId) {
      setFlash({ tone: "error", text: "Selecciona un cliente del padron." });
      return;
    }

    const contractNumber = activeSection === "LABOR" ? buildLaborContractNumber(form) : form.contractNumber.trim();

    if (!contractNumber) {
      setFlash({ tone: "error", text: "Selecciona una cotizacion registrada del cliente." });
      return;
    }

    if (activeSection === "LABOR" && !form.collaboratorName) {
      setFlash({ tone: "error", text: "Selecciona un colaborador interno." });
      return;
    }

    if (!selectedFile) {
      setFlash({ tone: "error", text: "Carga el archivo del contrato o addendum." });
      return;
    }

    if (activeSection === "LABOR" && !isPdfFile(selectedFile)) {
      setFlash({ tone: "error", text: "Los contratos laborales firmados deben cargarse en PDF." });
      return;
    }

    setSaving(true);
    setFlash(null);

    try {
      const created = await apiPost<InternalContract>("/internal-contracts", {
        contractNumber,
        contractType: activeSection,
        documentKind: activeSection === "LABOR" ? form.documentKind : "CONTRACT",
        clientId: activeSection === "PROFESSIONAL_SERVICES" ? form.clientId : null,
        collaboratorName: activeSection === "LABOR" ? form.collaboratorName : null,
        paymentMilestones: parsedMilestones,
        notes: form.notes,
        originalFileName: selectedFile.name,
        fileMimeType: selectedFile.type || "application/octet-stream",
        fileBase64: await fileToBase64(selectedFile)
      });

      setContracts((current) => [created, ...current]);
      setForm(initialFormState);
      setSelectedFile(null);
      setFlash({ tone: "success", text: `Contrato ${created.contractNumber} cargado correctamente.` });
      event.currentTarget.reset();
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload(contract: InternalContract) {
    setDownloadingId(contract.id);
    setFlash(null);

    try {
      const { blob, filename } = await apiDownload(`/internal-contracts/${encodeURIComponent(contract.id)}/document`);
      downloadBlobFile(blob, filename ?? contract.originalFileName ?? `${contract.contractNumber}.bin`);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleTemplateDownload(template: InternalContractTemplate) {
    setDownloadingId(template.id);
    setFlash(null);

    try {
      const { blob, filename } = await apiDownload(`/internal-contracts/templates/${template.id}/document`);
      downloadBlobFile(blob, filename ?? template.originalFileName);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(contract: InternalContract) {
    if (isLaborFileBackedContract(contract)) {
      setFlash({
        tone: "error",
        text: "Este PDF viene de Expedientes Laborales. Para borrarlo, usa el expediente laboral del trabajador."
      });
      return;
    }

    if (!window.confirm(`Seguro que deseas borrar el contrato ${contract.contractNumber}?`)) {
      return;
    }

    setDeletingId(contract.id);
    setFlash(null);

    try {
      await apiDelete(`/internal-contracts/${contract.id}`);
      setContracts((current) => current.filter((entry) => entry.id !== contract.id));
      setFlash({ tone: "success", text: `Contrato ${contract.contractNumber} borrado.` });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleTemplateDelete(template: InternalContractTemplate) {
    if (!window.confirm(`Seguro que deseas borrar el machote ${template.title}?`)) {
      return;
    }

    setDeletingId(template.id);
    setFlash(null);

    try {
      await apiDelete(`/internal-contracts/templates/${template.id}`);
      setTemplates((current) => current.filter((entry) => entry.id !== template.id));
      setFlash({ tone: "success", text: `Machote ${template.title} borrado.` });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDeletingId(null);
    }
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
    <section className="page-stack internal-contracts-page">
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
          Control de contratos por cliente, contratos laborales, addenda y machotes internos de Rusconii Consulting.
        </p>
      </header>

      <section className="panel">
        <div className="leads-tabs internal-contracts-tabs" role="tablist" aria-label="Secciones de contratos internos">
          {visibleSections.map((section) => (
            <button
              key={section}
              type="button"
              className={`lead-tab ${activeSection === section ? "is-active" : ""}`}
              onClick={() => handleSectionChange(section)}
            >
              {SECTION_LABELS[section]} ({sectionCounts[section]})
            </button>
          ))}
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
            <h2>{isTemplateSection ? "Cargar machote" : "Cargar contrato"}</h2>
            <span>
              {activeSection === "TEMPLATES"
                ? "Machotes de empresa"
                : activeSection === "LABOR"
                  ? "Laboral / addendum"
                  : "Servicios profesionales"}
            </span>
          </div>

          {canSubmitActiveSection ? (
            <form className="internal-contracts-form" onSubmit={handleSubmit}>
              <div className="internal-contracts-form-grid">
                {activeSection === "TEMPLATES" ? (
                  <label className="form-field internal-contracts-wide-field">
                    <span>Nombre del machote</span>
                    <input
                      value={form.templateTitle}
                      onChange={(event) => updateForm("templateTitle", event.target.value)}
                      placeholder="Ej. Contrato de prestacion de servicios"
                      disabled={saving || loading}
                    />
                  </label>
                ) : activeSection === "PROFESSIONAL_SERVICES" ? (
                  <>
                    <label className="form-field">
                      <span>Cliente</span>
                      <select
                        value={form.clientId}
                        onChange={(event) => handleClientChange(event.target.value)}
                        disabled={saving || loading}
                      >
                        <option value="">-- Seleccionar cliente --</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.clientNumber} - {client.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="form-field">
                      <span>Numero de contrato</span>
                      <select
                        value={form.contractNumber}
                        onChange={(event) => updateForm("contractNumber", event.target.value)}
                        disabled={saving || loading || !form.clientId || selectedClientQuotes.length === 0}
                      >
                        <option value="">
                          {!form.clientId
                            ? "-- Selecciona cliente primero --"
                            : selectedClientQuotes.length === 0
                              ? "-- Sin cotizaciones registradas --"
                              : "-- Seleccionar cotizacion --"}
                        </option>
                        {selectedClientQuotes.map((quote) => (
                          <option key={quote.id} value={quote.quoteNumber}>
                            {quote.quoteNumber} - {quote.subject}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="form-field">
                      <span>Colaborador interno</span>
                      <select
                        value={form.collaboratorName}
                        onChange={(event) => updateForm("collaboratorName", event.target.value)}
                        disabled={saving || loading}
                      >
                        <option value="">-- Seleccionar colaborador --</option>
                        {collaborators.map((collaborator) => (
                          <option key={collaborator.id} value={collaborator.name}>
                            {collaborator.shortName ? `${collaborator.shortName} - ` : ""}
                            {collaborator.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="form-field">
                      <span>Tipo de documento</span>
                      <select
                        value={form.documentKind}
                        onChange={(event) => updateForm("documentKind", event.target.value as InternalContract["documentKind"])}
                        disabled={saving}
                      >
                        <option value="CONTRACT">Contrato laboral</option>
                        <option value="ADDENDUM">Addendum</option>
                      </select>
                    </label>
                  </>
                )}

                <label className="form-field internal-contracts-file-field">
                  <span>Archivo</span>
                  <input
                    type="file"
                    accept={activeSection === "LABOR" ? ".pdf,application/pdf" : ".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"}
                    onChange={handleFileChange}
                    disabled={saving}
                  />
                </label>

                {activeSection === "PROFESSIONAL_SERVICES" ? (
                  <label className="form-field internal-contracts-wide-field">
                    <span>Fechas o hitos de pago</span>
                    <textarea
                      value={form.milestonesText}
                      onChange={(event) => updateForm("milestonesText", event.target.value)}
                      placeholder={"Una linea por hito. Ej.\n2026-05-15 - Anticipo $50000\n2026-06-30 - Segundo pago"}
                      disabled={saving}
                    />
                  </label>
                ) : null}

                <label className="form-field internal-contracts-wide-field">
                  <span>Notas</span>
                  <textarea
                    value={form.notes}
                    onChange={(event) => updateForm("notes", event.target.value)}
                    placeholder={isTemplateSection ? "Notas internas sobre el uso del machote..." : "Observaciones internas del contrato..."}
                    disabled={saving}
                  />
                </label>
              </div>

              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={saving || loading}>
                  {saving ? "Cargando..." : isTemplateSection ? "Guardar machote" : "Guardar contrato"}
                </button>
                <button className="secondary-button" type="button" onClick={() => void loadModule()} disabled={saving || loading}>
                  Refrescar
                </button>
              </div>
            </form>
          ) : (
            <div className="centered-inline-message">
              {isTemplateSection
                ? "Tu perfil puede ver y descargar machotes, pero solo el superadmin puede cargar nuevos archivos."
                : "Tu perfil puede consultar contratos, pero no cargar nuevos archivos."}
            </div>
          )}
        </section>

        <section className="panel internal-contracts-list-panel">
          <div className="panel-header">
            <h2>{SECTION_LABELS[activeSection]}</h2>
            <span>{isTemplateSection ? filteredTemplates.length : filteredContracts.length} registros</span>
          </div>

          <div className="internal-contracts-toolbar">
            <label className="form-field">
              <span>Buscar</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  isTemplateSection
                    ? "Machote, archivo o notas..."
                    : activeSection === "LABOR"
                      ? "Contrato, colaborador, expediente o archivo..."
                      : "Contrato, cliente, colaborador, archivo o hito..."
                }
                type="search"
              />
            </label>
          </div>

          <div className="internal-contracts-list" aria-live="polite">
            {loading ? (
              <div className="centered-inline-message">{isTemplateSection ? "Cargando machotes..." : "Cargando contratos..."}</div>
            ) : null}
            {!loading && isTemplateSection && filteredTemplates.length === 0 ? (
              <div className="centered-inline-message">No hay machotes cargados.</div>
            ) : null}
            {!loading && !isTemplateSection && filteredContracts.length === 0 ? (
              <div className="centered-inline-message">No hay contratos en esta seccion.</div>
            ) : null}
            {!loading && isTemplateSection && filteredTemplates.map((template) => (
              <article className="internal-contract-card" key={template.id}>
                <div className="internal-contract-card-head">
                  <div>
                    <span className="internal-contract-number">{template.title}</span>
                    <h3>{template.originalFileName}</h3>
                  </div>
                  <span className="status-pill status-live">Machote</span>
                </div>

                <div className="internal-contract-meta-grid">
                  <div>
                    <span>Archivo</span>
                    <strong>{template.originalFileName}</strong>
                    <small>{formatFileSize(template.fileSizeBytes)}</small>
                  </div>
                  <div>
                    <span>Alta</span>
                    <strong>{formatDate(template.createdAt)}</strong>
                    <small>{template.fileMimeType ?? "Tipo no registrado"}</small>
                  </div>
                </div>

                {template.notes ? <p className="internal-contract-notes">{template.notes}</p> : null}

                <div className="table-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={downloadingId === template.id}
                    onClick={() => void handleTemplateDownload(template)}
                  >
                    {downloadingId === template.id ? "Descargando..." : "Descargar"}
                  </button>
                  {canUploadTemplate ? (
                    <button
                      className="danger-button"
                      type="button"
                      disabled={deletingId === template.id}
                      onClick={() => void handleTemplateDelete(template)}
                    >
                      {deletingId === template.id ? "Borrando..." : "Borrar"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {!loading && !isTemplateSection && filteredContracts.map((contract) => (
              <article className="internal-contract-card" key={contract.id}>
                <div className="internal-contract-card-head">
                  <div>
                    <span className="internal-contract-number">{contract.contractNumber}</span>
                    <h3>{contractOwnerLabel(contract)}</h3>
                  </div>
                  <div className="internal-contract-card-tags">
                    <span className="status-pill status-live">
                      {contract.documentKind === "ADDENDUM" ? "Addendum" : "Contrato"}
                    </span>
                    {isLaborFileBackedContract(contract) ? (
                      <span className="status-pill status-migration">Expediente laboral</span>
                    ) : null}
                  </div>
                </div>

                <div className="internal-contract-meta-grid">
                  <div>
                    <span>Archivo</span>
                    <strong>{contract.originalFileName ?? "Sin archivo"}</strong>
                    <small>{formatFileSize(contract.fileSizeBytes)}</small>
                  </div>
                  <div>
                    <span>Alta</span>
                    <strong>{formatDate(contract.createdAt)}</strong>
                    <small>{contract.fileMimeType ?? "Tipo no registrado"}</small>
                  </div>
                </div>

                {contract.paymentMilestones.length > 0 ? (
                  <ul className="internal-contract-milestones">
                    {contract.paymentMilestones.map((milestone) => (
                      <li key={milestone.id}>{formatMilestone(milestone)}</li>
                    ))}
                  </ul>
                ) : contract.contractType === "PROFESSIONAL_SERVICES" ? (
                  <p className="muted internal-contract-empty-milestones">Sin hitos de pago capturados.</p>
                ) : null}

                {contract.notes ? <p className="internal-contract-notes">{contract.notes}</p> : null}

                <div className="table-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!contract.originalFileName || downloadingId === contract.id}
                    onClick={() => void handleDownload(contract)}
                  >
                    {downloadingId === contract.id ? "Descargando..." : "Descargar"}
                  </button>
                  {canWrite && !isLaborFileBackedContract(contract) ? (
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
            ))}
          </div>
        </section>
      </section>
    </section>
  );
}
