import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import {
  LABOR_FILE_DOCUMENT_DEFINITIONS,
  type LaborContractFieldValues,
  type LaborContractPrefillResult,
  type LaborFile,
  type LaborFileDocument,
  type LaborFileDocumentType,
  type LaborGlobalVacationDay,
  type LaborGlobalVacationDayInput,
  type LaborVacationEvent,
  type LaborVacationEventInput
} from "@sige/contracts";

import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { SummaryCard } from "../../components/SummaryCard";
import { useAuth } from "../auth/AuthContext";

type FlashState =
  | {
      tone: "success" | "error";
      text: string;
    }
  | null;

type LaborFileProfileForm = {
  hireDate: string;
  notes: string;
};

const EMPTY_PROFILE_FORM: LaborFileProfileForm = {
  hireDate: "",
  notes: ""
};

const EMPTY_VACATION_FORM: LaborVacationEventInput = {
  eventType: "VACATION",
  startDate: "",
  endDate: "",
  days: 1,
  description: ""
};

const EMPTY_GLOBAL_VACATION_FORM: LaborGlobalVacationDayInput = {
  date: "",
  days: 1,
  description: ""
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
  biweeklyGrossSalary: "",
  biweeklyGrossSalaryText: "",
  signingDate: "",
  signingCity: "Ciudad de México"
};

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

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("es-MX");
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

function getEmployeeSecondaryLabel(laborFile: LaborFile) {
  if (laborFile.employeeShortName) {
    return laborFile.employeeShortName;
  }

  return normalizeComparableText(laborFile.employeeUsername) === normalizeComparableText(laborFile.employeeName)
    ? laborFile.employeeName
    : laborFile.employeeUsername;
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
  const [vacationForm, setVacationForm] = useState<LaborVacationEventInput>(EMPTY_VACATION_FORM);
  const [vacationRange, setVacationRange] = useState({ startDate: "", endDate: "" });
  const [vacationSingleDate, setVacationSingleDate] = useState("");
  const [selectedVacationDates, setSelectedVacationDates] = useState<string[]>([]);
  const [vacationAcceptanceFile, setVacationAcceptanceFile] = useState<File | null>(null);
  const [globalVacationDays, setGlobalVacationDays] = useState<LaborGlobalVacationDay[]>([]);
  const [globalVacationForm, setGlobalVacationForm] = useState<LaborGlobalVacationDayInput>(EMPTY_GLOBAL_VACATION_FORM);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [documentActionId, setDocumentActionId] = useState<string | null>(null);
  const [deletingVacationId, setDeletingVacationId] = useState<string | null>(null);
  const [vacationFileActionId, setVacationFileActionId] = useState<string | null>(null);
  const [deletingGlobalVacationId, setDeletingGlobalVacationId] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canRead = hasPermission(user?.permissions, "labor-file:read") || hasPermission(user?.permissions, "labor-file:write");
  const canWrite = hasPermission(user?.permissions, "labor-file:write");
  const selectedLaborFile = laborFiles.find((laborFile) => laborFile.id === selectedId) ?? laborFiles[0];

  async function loadLaborFiles(preferredId?: string) {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [rows, globalDays] = await Promise.all([
        apiGet<LaborFile[]>("/labor-files"),
        canWrite ? apiGet<LaborGlobalVacationDay[]>("/labor-files/global-vacation-days") : Promise.resolve([])
      ]);
      setLaborFiles(sortLaborFiles(rows));
      setGlobalVacationDays(globalDays);
      setSelectedId((current) => preferredId || current || rows[0]?.id || "");
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
      return;
    }

    setProfileForm({
      hireDate: selectedLaborFile.hireDate.slice(0, 10),
      notes: selectedLaborFile.notes ?? ""
    });
    setContractForm(buildContractFormDefaults(selectedLaborFile));
    setContractFormOpen(false);
    setContractPrefillSources([]);
    setContractPrefillNotes([]);
    setFlash(null);
  }, [selectedLaborFile?.id]);

  const metrics = useMemo(() => ({
    total: laborFiles.length,
    incomplete: laborFiles.filter((laborFile) => laborFile.status === "INCOMPLETE").length,
    complete: laborFiles.filter((laborFile) => laborFile.status === "COMPLETE").length,
    former: laborFiles.filter((laborFile) => laborFile.employmentStatus === "FORMER").length
  }), [laborFiles]);

  const filteredLaborFiles = useMemo(() => {
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
  }, [laborFiles, query]);

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
      await apiPatch<LaborFile>(`/labor-files/${selectedLaborFile.id}`, {
        hireDate: profileForm.hireDate,
        notes: profileForm.notes || null
      });
      setFlash({ tone: "success", text: "Expediente actualizado." });
      await loadLaborFiles(selectedLaborFile.id);
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

  function handleContractFormOpen() {
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

  function handleVacationAcceptanceFileChange(event: ChangeEvent<HTMLInputElement>) {
    setVacationAcceptanceFile(event.target.files?.[0] ?? null);
    setFlash(null);
  }

  function addVacationDates(dates: string[]) {
    if (dates.length === 0) {
      setFlash({ tone: "error", text: "Selecciona al menos un día de vacaciones." });
      return;
    }

    setSelectedVacationDates((current) => sortDateKeys([...current, ...dates]));
    setFlash(null);
  }

  function handleVacationRangeAdd() {
    if (!vacationRange.startDate || !vacationRange.endDate) {
      setFlash({ tone: "error", text: "Captura el inicio y fin del rango de vacaciones." });
      return;
    }

    const dates = enumerateDateKeys(vacationRange.startDate, vacationRange.endDate);
    if (dates.length === 0) {
      setFlash({ tone: "error", text: "La fecha final no puede ser anterior a la inicial." });
      return;
    }

    addVacationDates(dates);
    setVacationRange({ startDate: "", endDate: "" });
  }

  function handleVacationSingleDateAdd() {
    if (!vacationSingleDate) {
      setFlash({ tone: "error", text: "Selecciona un día de vacaciones." });
      return;
    }

    addVacationDates([vacationSingleDate]);
    setVacationSingleDate("");
  }

  function handleVacationDateRemove(date: string) {
    setSelectedVacationDates((current) => current.filter((entry) => entry !== date));
  }

  async function handleVacationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLaborFile || !canWrite) {
      return;
    }

    setSaving(true);
    setFlash(null);

    try {
      if (selectedVacationDates.length === 0) {
        setFlash({ tone: "error", text: "Agrega al menos un día de vacaciones." });
        return;
      }

      if (!vacationAcceptanceFile) {
        setFlash({ tone: "error", text: "Carga el formato de aceptación de vacaciones en PDF." });
        return;
      }

      const isPdf = vacationAcceptanceFile.type === "application/pdf" || vacationAcceptanceFile.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        setFlash({ tone: "error", text: "El formato de aceptación debe ser PDF." });
        return;
      }

      await apiPost(`/labor-files/${selectedLaborFile.id}/vacation-events`, {
        ...vacationForm,
        eventType: "VACATION",
        vacationDates: selectedVacationDates,
        days: selectedVacationDates.length,
        startDate: selectedVacationDates[0] ?? null,
        endDate: selectedVacationDates[selectedVacationDates.length - 1] ?? null,
        acceptanceOriginalFileName: vacationAcceptanceFile.name,
        acceptanceFileMimeType: vacationAcceptanceFile.type || "application/pdf",
        acceptanceFileBase64: await fileToBase64(vacationAcceptanceFile),
        description: vacationForm.description || null
      });
      setVacationForm(EMPTY_VACATION_FORM);
      setVacationRange({ startDate: "", endDate: "" });
      setVacationSingleDate("");
      setSelectedVacationDates([]);
      setVacationAcceptanceFile(null);
      event.currentTarget.reset();
      setFlash({ tone: "success", text: "Vacaciones registradas." });
      await loadLaborFiles(selectedLaborFile.id);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSaving(false);
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

  async function handleGlobalVacationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) {
      return;
    }

    setSaving(true);
    setFlash(null);

    try {
      await apiPost<LaborGlobalVacationDay>("/labor-files/global-vacation-days", {
        date: globalVacationForm.date,
        days: globalVacationForm.days ?? 1,
        description: globalVacationForm.description || null
      });
      setGlobalVacationForm(EMPTY_GLOBAL_VACATION_FORM);
      setFlash({ tone: "success", text: "Día general de vacaciones registrado." });
      await loadLaborFiles(selectedLaborFile?.id);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSaving(false);
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
  const addenda = selectedLaborFile?.documents
    .filter((document) => document.documentType === "ADDENDUM")
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt)) ?? [];
  const documentDefinitions = LABOR_FILE_DOCUMENT_DEFINITIONS.filter((definition) =>
    !definition.contractSection
  );

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
          <SummaryCard label="Expedientes" value={metrics.total} accent="#1d4ed8" />
          <SummaryCard label="Completos" value={metrics.complete} accent="#0f766e" />
          <SummaryCard label="Incompletos" value={metrics.incomplete} accent="#b42318" />
          <SummaryCard label="Extrabajadores" value={metrics.former} accent="#9a6700" />
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
              <span>Estos días se descuentan del conteo de todos los expedientes aplicables.</span>
            </div>
            <span>{globalVacationDays.length} registrados</span>
          </div>

          <form className="labor-file-global-vacation-form" onSubmit={handleGlobalVacationSubmit}>
            <label className="form-field">
              <span>Día</span>
              <input
                required
                type="date"
                value={globalVacationForm.date}
                onChange={(event) => setGlobalVacationForm((current) => ({ ...current, date: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span>Días a descontar</span>
              <input
                min="0.5"
                step="0.5"
                type="number"
                value={globalVacationForm.days ?? 1}
                onChange={(event) => setGlobalVacationForm((current) => ({ ...current, days: Number(event.target.value) }))}
              />
            </label>
            <label className="form-field labor-file-global-vacation-description">
              <span>Descripción</span>
              <input
                value={globalVacationForm.description ?? ""}
                onChange={(event) => setGlobalVacationForm((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <button className="primary-button" disabled={saving} type="submit">
              Marcar para todos
            </button>
          </form>

          <div className="labor-file-global-vacation-list">
            {globalVacationDays.length === 0 ? (
              <div className="centered-inline-message">Sin vacaciones generales registradas.</div>
            ) : globalVacationDays.map((day) => (
              <div className="labor-file-vacation-event" key={day.id}>
                <div>
                  <strong>{formatDate(day.date)}</strong>
                  <span>{day.days} {day.days === 1 ? "día" : "días"} para todos</span>
                </div>
                {day.description ? <small>{day.description}</small> : <small>Vacación general</small>}
                <button
                  className="danger-button"
                  disabled={deletingGlobalVacationId === day.id}
                  onClick={() => void handleGlobalVacationDelete(day.id)}
                  type="button"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="labor-files-layout">
        {canWrite ? (
          <aside className="panel labor-files-sidebar">
            <div className="panel-header">
              <h2>Colaboradores</h2>
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
              {!loading && filteredLaborFiles.map((laborFile) => (
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
                  {laborFile.employmentStatus === "FORMER" ? <small>Extrabajador</small> : null}
                </button>
              ))}
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
                    <h2>{selectedLaborFile.employeeName}</h2>
                    <span>{selectedLaborFile.legacyTeam ?? "Sin equipo"} / {selectedLaborFile.specificRole ?? "Sin rol"}</span>
                  </div>
                  <div className="labor-file-status-group">
                    <span className={`status-pill ${selectedLaborFile.status === "COMPLETE" ? "status-live" : "status-warning"}`}>
                      {selectedLaborFile.status === "COMPLETE" ? "Completo" : "Incompleto"}
                    </span>
                    <span className={`status-pill ${selectedLaborFile.employmentStatus === "FORMER" ? "status-migration" : "status-live"}`}>
                      {selectedLaborFile.employmentStatus === "FORMER" ? "Extrabajador" : "Activo"}
                    </span>
                  </div>
                </div>

                <div className="labor-file-profile-grid">
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
                  <div>
                    <span>Última actualización</span>
                    <strong>{formatDateTime(selectedLaborFile.updatedAt)}</strong>
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
                      <input accept={getUploadAccept(uploadType)} onChange={handleFileChange} type="file" />
                    </label>
                    <button className="primary-button" disabled={saving} type="submit">
                      Cargar
                    </button>
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
                  ))}
                </div>
              </section>

              <section className="panel labor-file-contract-generator-panel">
                <div className="panel-header">
                  <div>
                    <h2>Generación de contrato laboral</h2>
                    <span>Word editable con datos del trabajador y resguardo automático en expediente.</span>
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
                          disabled={prefillingContract || generatingContract}
                          onClick={handleContractFormOpen}
                          type="button"
                        >
                          {prefillingContract ? "Leyendo documentos..." : "Abrir formulario"}
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
                            <span>Pago quincenal bruto</span>
                            <input
                              placeholder="$0.00"
                              value={contractForm.biweeklyGrossSalary}
                              onChange={(event) => updateContractFormField("biweeklyGrossSalary", event.target.value)}
                            />
                          </label>
                          <label className="form-field">
                            <span>Pago quincenal en letra</span>
                            <input
                              value={contractForm.biweeklyGrossSalaryText}
                              onChange={(event) => updateContractFormField("biweeklyGrossSalaryText", event.target.value)}
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

              <section className="panel labor-file-vacations-panel">
                <div className="panel-header">
                  <div>
                    <h2>Contabilización de vacaciones</h2>
                    <span>{selectedLaborFile.vacationSummary.remainingDays} días disponibles</span>
                  </div>
                </div>

                <div className="labor-file-vacation-summary">
                  {selectedLaborFile.vacationSummary.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>

                {canWrite ? (
                  <form className="labor-file-vacation-form" onSubmit={handleVacationSubmit}>
                    <div className="labor-file-vacation-date-tools">
                      <div className="labor-file-vacation-date-group is-range">
                        <h3>Días continuos</h3>
                        <div className="labor-file-vacation-date-row">
                          <label className="form-field">
                            <span>Inicio</span>
                            <input
                              type="date"
                              value={vacationRange.startDate}
                              onChange={(event) => setVacationRange((current) => ({ ...current, startDate: event.target.value }))}
                            />
                          </label>
                          <label className="form-field">
                            <span>Fin</span>
                            <input
                              type="date"
                              value={vacationRange.endDate}
                              onChange={(event) => setVacationRange((current) => ({ ...current, endDate: event.target.value }))}
                            />
                          </label>
                          <button className="secondary-button" onClick={handleVacationRangeAdd} type="button">
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
                              value={vacationSingleDate}
                              onChange={(event) => setVacationSingleDate(event.target.value)}
                            />
                          </label>
                          <button className="secondary-button" onClick={handleVacationSingleDateAdd} type="button">
                            Agregar día
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="labor-file-vacation-selected-days">
                      <div className="labor-file-section-title">
                        <h3>Días seleccionados</h3>
                        <span>{selectedVacationDates.length} días</span>
                      </div>
                      {selectedVacationDates.length === 0 ? (
                        <div className="centered-inline-message">Agrega días continuos o salteados.</div>
                      ) : (
                        <div className="labor-file-vacation-day-chips">
                          {selectedVacationDates.map((date) => (
                            <button key={date} onClick={() => handleVacationDateRemove(date)} type="button">
                              {formatDate(date)} <span>Quitar</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <label className="form-field labor-file-vacation-file">
                      <span>Formato de aceptación (PDF)</span>
                      <input accept=".pdf,application/pdf" required type="file" onChange={handleVacationAcceptanceFileChange} />
                    </label>
                    <label className="form-field labor-file-vacation-description">
                      <span>Descripción</span>
                      <input
                        value={vacationForm.description ?? ""}
                        onChange={(event) => setVacationForm((current) => ({ ...current, description: event.target.value }))}
                      />
                    </label>
                    <button className="primary-button" disabled={saving} type="submit">
                      Agregar vacaciones
                    </button>
                  </form>
                ) : null}

                <div className="labor-file-vacation-events">
                  {selectedLaborFile.vacationEvents.length === 0 ? (
                    <div className="centered-inline-message">Sin vacaciones registradas.</div>
                  ) : selectedLaborFile.vacationEvents.map((event) => (
                    <div className="labor-file-vacation-event" key={event.id}>
                      <div>
                        <strong>{event.eventType === "VACATION" ? "Vacaciones" : "Descuento del año pasado"}</strong>
                        <span>
                          {event.days} días
                          {formatVacationEventDates(event) ? ` / ${formatVacationEventDates(event)}` : ""}
                        </span>
                        {event.acceptanceOriginalFileName ? <small>Formato: {event.acceptanceOriginalFileName}</small> : null}
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
                              Abrir PDF
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
                        {canWrite ? (
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
                  ))}
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
