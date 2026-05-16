import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { LABOR_FILE_DOCUMENT_DEFINITIONS } from "@sige/contracts";
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { SummaryCard } from "../../components/SummaryCard";
import { useAuth } from "../auth/AuthContext";
const EMPTY_PROFILE_FORM = {
    hireDate: "",
    notes: ""
};
const EMPTY_VACATION_FORM = {
    eventType: "VACATION",
    startDate: "",
    endDate: "",
    days: 1,
    description: ""
};
const EMPTY_GLOBAL_VACATION_FORM = {
    date: "",
    days: 1,
    description: ""
};
const VACATION_FORMAT_AUTHORIZER = "Mayra Rubí Ordóñez Mendoza";
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
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
    description: ""
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
    biweeklyGrossSalary: "",
    biweeklyGrossSalaryText: "",
    signingDate: "",
    signingCity: "Ciudad de México"
};
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
function formatDateTime(value) {
    if (!value) {
        return "-";
    }
    return new Date(value).toLocaleString("es-MX");
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
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
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
    return {
        ...EMPTY_VACATION_FORMAT_FORM,
        employeeName: laborFile?.employeeName ?? "",
        requestDate: getTodayKey(),
        interestedName: laborFile?.employeeName ?? "",
        hireDate: laborFile?.hireDate.slice(0, 10) ?? "",
        vacationYearStartDate: laborFile?.vacationSummary.currentYearStartDate ?? "",
        completedYearsLabel: laborFile?.vacationSummary.completedYearsLabel ?? "",
        entitlementDays: laborFile?.vacationSummary.entitlementDays ?? 0,
        pendingDays: laborFile?.vacationSummary.remainingDays ?? 0,
        enjoyedDays: laborFile?.vacationSummary.usedDays ?? 0
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
function isPdfFile(file) {
    return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
function isDocxFile(file) {
    return file.type === DOCX_MIME_TYPE || file.name.toLowerCase().endsWith(".docx");
}
function getVacationAcceptanceMimeType(file) {
    if (isDocxFile(file)) {
        return DOCX_MIME_TYPE;
    }
    return file.type || "application/pdf";
}
function getEmployeeSecondaryLabel(laborFile) {
    if (laborFile.employeeShortName) {
        return laborFile.employeeShortName;
    }
    return normalizeComparableText(laborFile.employeeUsername) === normalizeComparableText(laborFile.employeeName)
        ? laborFile.employeeName
        : laborFile.employeeUsername;
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
    const [vacationForm, setVacationForm] = useState(EMPTY_VACATION_FORM);
    const [vacationRange, setVacationRange] = useState({ startDate: "", endDate: "" });
    const [vacationSingleDate, setVacationSingleDate] = useState("");
    const [selectedVacationDates, setSelectedVacationDates] = useState([]);
    const [vacationAcceptanceFile, setVacationAcceptanceFile] = useState(null);
    const [globalVacationDays, setGlobalVacationDays] = useState([]);
    const [globalVacationForm, setGlobalVacationForm] = useState(EMPTY_GLOBAL_VACATION_FORM);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [documentActionId, setDocumentActionId] = useState(null);
    const [deletingVacationId, setDeletingVacationId] = useState(null);
    const [vacationFileActionId, setVacationFileActionId] = useState(null);
    const [deletingGlobalVacationId, setDeletingGlobalVacationId] = useState(null);
    const [flash, setFlash] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const canRead = hasPermission(user?.permissions, "labor-file:read") || hasPermission(user?.permissions, "labor-file:write");
    const canWrite = hasPermission(user?.permissions, "labor-file:write");
    const selectedLaborFile = laborFiles.find((laborFile) => laborFile.id === selectedId) ?? laborFiles[0];
    async function loadLaborFiles(preferredId) {
        setLoading(true);
        setErrorMessage(null);
        try {
            const [rows, globalDays] = await Promise.all([
                apiGet("/labor-files"),
                canWrite ? apiGet("/labor-files/global-vacation-days") : Promise.resolve([])
            ]);
            setLaborFiles(sortLaborFiles(rows));
            setGlobalVacationDays(globalDays);
            setSelectedId((current) => preferredId || current || rows[0]?.id || "");
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
        setVacationFormatForm(buildVacationFormatFormDefaults(selectedLaborFile));
        setVacationFormatFormOpen(false);
        setVacationFormatRange({ startDate: "", endDate: "" });
        setVacationFormatSingleDate("");
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
            await apiPatch(`/labor-files/${selectedLaborFile.id}`, {
                hireDate: profileForm.hireDate,
                notes: profileForm.notes || null
            });
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
    async function handleUpload(event) {
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
            await apiPost(`/labor-files/${selectedLaborFile.id}/vacation-format/generate`, vacationFormatForm);
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
    function handleVacationAcceptanceFileChange(event) {
        setVacationAcceptanceFile(event.target.files?.[0] ?? null);
        setFlash(null);
    }
    function addVacationDates(dates) {
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
    function handleVacationDateRemove(date) {
        setSelectedVacationDates((current) => current.filter((entry) => entry !== date));
    }
    async function handleVacationSubmit(event) {
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
                setFlash({ tone: "error", text: "Carga el formato de aceptación de vacaciones en PDF o Word." });
                return;
            }
            if (!isPdfFile(vacationAcceptanceFile) && !isDocxFile(vacationAcceptanceFile)) {
                setFlash({ tone: "error", text: "El formato de aceptación debe ser PDF o Word." });
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
                acceptanceFileMimeType: getVacationAcceptanceMimeType(vacationAcceptanceFile),
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
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSaving(false);
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
    async function handleGlobalVacationSubmit(event) {
        event.preventDefault();
        if (!canWrite) {
            return;
        }
        setSaving(true);
        setFlash(null);
        try {
            await apiPost("/labor-files/global-vacation-days", {
                date: globalVacationForm.date,
                days: globalVacationForm.days ?? 1,
                description: globalVacationForm.description || null
            });
            setGlobalVacationForm(EMPTY_GLOBAL_VACATION_FORM);
            setFlash({ tone: "success", text: "Día general de vacaciones registrado." });
            await loadLaborFiles(selectedLaborFile?.id);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSaving(false);
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
    const latestVacationFormatEvent = selectedLaborFile?.vacationEvents
        .filter((event) => event.acceptanceOriginalFileName)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    const vacationFormatSelectedDays = vacationFormatForm.vacationDates.length;
    const vacationFormatProjectedPending = selectedLaborFile
        ? Math.max(0, selectedLaborFile.vacationSummary.remainingDays - vacationFormatSelectedDays)
        : vacationFormatForm.pendingDays;
    const vacationFormatProjectedEnjoyed = selectedLaborFile
        ? selectedLaborFile.vacationSummary.usedDays + vacationFormatSelectedDays
        : vacationFormatForm.enjoyedDays;
    const addenda = selectedLaborFile?.documents
        .filter((document) => document.documentType === "ADDENDUM")
        .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt)) ?? [];
    const documentDefinitions = LABOR_FILE_DOCUMENT_DEFINITIONS.filter((definition) => !definition.contractSection);
    return (_jsxs("section", { className: "page-stack labor-files-page", children: [_jsxs("header", { className: "hero module-hero labor-files-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Expedientes" }), _jsx("div", { children: _jsx("h2", { children: "Expedientes Laborales" }) })] }), _jsx("p", { className: "muted", children: "Contratos, documentos obligatorios y vacaciones por usuario, conservados tambi\u00E9n para extrabajadores." })] }), canWrite ? (_jsxs("div", { className: "summary-grid", children: [_jsx(SummaryCard, { label: "Expedientes", value: metrics.total, accent: "#1d4ed8" }), _jsx(SummaryCard, { label: "Completos", value: metrics.complete, accent: "#0f766e" }), _jsx(SummaryCard, { label: "Incompletos", value: metrics.incomplete, accent: "#b42318" }), _jsx(SummaryCard, { label: "Extrabajadores", value: metrics.former, accent: "#9a6700" })] })) : null, flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, canWrite ? (_jsxs("section", { className: "panel labor-file-global-vacation-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Vacaciones generales" }), _jsx("span", { children: "Estos d\u00EDas se descuentan del conteo de todos los expedientes aplicables." })] }), _jsxs("span", { children: [globalVacationDays.length, " registrados"] })] }), _jsxs("form", { className: "labor-file-global-vacation-form", onSubmit: handleGlobalVacationSubmit, children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "D\u00EDa" }), _jsx("input", { required: true, type: "date", value: globalVacationForm.date, onChange: (event) => setGlobalVacationForm((current) => ({ ...current, date: event.target.value })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "D\u00EDas a descontar" }), _jsx("input", { min: "0.5", step: "0.5", type: "number", value: globalVacationForm.days ?? 1, onChange: (event) => setGlobalVacationForm((current) => ({ ...current, days: Number(event.target.value) })) })] }), _jsxs("label", { className: "form-field labor-file-global-vacation-description", children: [_jsx("span", { children: "Descripci\u00F3n" }), _jsx("input", { value: globalVacationForm.description ?? "", onChange: (event) => setGlobalVacationForm((current) => ({ ...current, description: event.target.value })) })] }), _jsx("button", { className: "primary-button", disabled: saving, type: "submit", children: "Marcar para todos" })] }), _jsx("div", { className: "labor-file-global-vacation-list", children: globalVacationDays.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Sin vacaciones generales registradas." })) : globalVacationDays.map((day) => (_jsxs("div", { className: "labor-file-vacation-event", children: [_jsxs("div", { children: [_jsx("strong", { children: formatDate(day.date) }), _jsxs("span", { children: [day.days, " ", day.days === 1 ? "día" : "días", " para todos"] })] }), day.description ? _jsx("small", { children: day.description }) : _jsx("small", { children: "Vacaci\u00F3n general" }), _jsx("button", { className: "danger-button", disabled: deletingGlobalVacationId === day.id, onClick: () => void handleGlobalVacationDelete(day.id), type: "button", children: "Quitar" })] }, day.id))) })] })) : null, _jsxs("section", { className: "labor-files-layout", children: [canWrite ? (_jsxs("aside", { className: "panel labor-files-sidebar", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Colaboradores" }), _jsx("span", { children: filteredLaborFiles.length })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { type: "search", value: query, onChange: (event) => setQuery(event.target.value), placeholder: "Nombre, equipo o rol..." })] }), _jsxs("div", { className: "labor-file-selector-list", children: [loading ? _jsx("div", { className: "centered-inline-message", children: "Cargando expedientes..." }) : null, !loading && filteredLaborFiles.map((laborFile) => (_jsxs("button", { className: [
                                            laborFile.id === selectedLaborFile?.id ? "is-active" : "",
                                            laborFile.status === "COMPLETE" ? "is-complete" : "is-incomplete"
                                        ].filter(Boolean).join(" "), onClick: () => setSelectedId(laborFile.id), type: "button", children: [_jsxs("div", { className: "labor-file-selector-head", children: [_jsx("strong", { children: laborFile.employeeName }), _jsx("span", { className: `status-pill labor-file-selector-status ${laborFile.status === "COMPLETE" ? "status-live" : "status-warning"}`, children: laborFile.status === "COMPLETE" ? "Completo" : "Incompleto" })] }), _jsx("span", { children: getEmployeeSecondaryLabel(laborFile) }), laborFile.employmentStatus === "FORMER" ? _jsx("small", { children: "Extrabajador" }) : null] }, laborFile.id)))] })] })) : null, _jsxs("div", { className: "labor-file-main", children: [!selectedLaborFile && !loading ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "No hay expediente laboral disponible." }) })) : null, selectedLaborFile ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel labor-file-profile-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: selectedLaborFile.employeeName }), _jsxs("span", { children: [selectedLaborFile.legacyTeam ?? "Sin equipo", " / ", selectedLaborFile.specificRole ?? "Sin rol"] })] }), _jsxs("div", { className: "labor-file-status-group", children: [_jsx("span", { className: `status-pill ${selectedLaborFile.status === "COMPLETE" ? "status-live" : "status-warning"}`, children: selectedLaborFile.status === "COMPLETE" ? "Completo" : "Incompleto" }), _jsx("span", { className: `status-pill ${selectedLaborFile.employmentStatus === "FORMER" ? "status-migration" : "status-live"}`, children: selectedLaborFile.employmentStatus === "FORMER" ? "Extrabajador" : "Activo" })] })] }), _jsxs("div", { className: "labor-file-profile-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Usuario" }), _jsx("strong", { children: selectedLaborFile.employeeUsername })] }), _jsxs("div", { children: [_jsx("span", { children: "Nombre corto" }), _jsx("strong", { children: selectedLaborFile.employeeShortName ?? "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Fecha de ingreso" }), _jsx("strong", { children: formatDate(selectedLaborFile.hireDate) })] }), _jsxs("div", { children: [_jsx("span", { children: "\u00DAltima actualizaci\u00F3n" }), _jsx("strong", { children: formatDateTime(selectedLaborFile.updatedAt) })] })] }), canWrite ? (_jsxs("form", { className: "labor-file-profile-form", onSubmit: handleProfileSave, children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de ingreso" }), _jsx("input", { type: "date", value: profileForm.hireDate, onChange: (event) => setProfileForm((current) => ({ ...current, hireDate: event.target.value })) })] }), _jsxs("label", { className: "form-field labor-file-notes-field", children: [_jsx("span", { children: "Notas" }), _jsx("textarea", { value: profileForm.notes, onChange: (event) => setProfileForm((current) => ({ ...current, notes: event.target.value })) })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", disabled: saving, type: "submit", children: "Guardar expediente" }), _jsx("button", { className: "secondary-button", disabled: saving || loading, onClick: () => void loadLaborFiles(selectedLaborFile.id), type: "button", children: "Refrescar" })] })] })) : null] }), _jsxs("section", { className: "panel labor-file-upload-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Carga documental" }), _jsxs("span", { children: [selectedLaborFile.documents.length, " archivos"] })] }), canWrite ? (_jsxs("form", { className: "labor-file-upload-form", onSubmit: handleUpload, children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Tipo de documento" }), _jsx("select", { value: uploadType, onChange: (event) => setUploadType(event.target.value), children: LABOR_FILE_DOCUMENT_DEFINITIONS.map((definition) => (_jsx("option", { value: definition.type, children: definition.label }, definition.type))) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Archivo" }), _jsx("input", { accept: getUploadAccept(uploadType), onChange: handleFileChange, type: "file" })] }), _jsx("button", { className: "primary-button", disabled: saving, type: "submit", children: "Cargar" })] })) : null, _jsxs("div", { className: "labor-file-contract-block", children: [_jsxs("div", { className: "labor-file-section-title", children: [_jsx("h3", { children: "Contrato laboral" }), _jsx("span", { children: contractDocument ? "Cargado" : "Pendiente" })] }), _jsx(DocumentRow, { canWrite: canWrite, document: contractDocument, documentActionId: documentActionId, label: "Contrato laboral", required: true, onDelete: handleDocumentDelete, onDownload: handleDocumentDownload }), _jsxs("div", { className: "labor-file-section-title", children: [_jsx("h3", { children: "Addenda" }), _jsx("span", { children: addenda.length })] }), addenda.length === 0 ? (_jsx("div", { className: "labor-file-document-row is-empty", children: _jsx("span", { children: "Sin addenda cargada" }) })) : addenda.map((document) => (_jsx(DocumentRow, { canWrite: canWrite, document: document, documentActionId: documentActionId, label: "Addendum", onDelete: handleDocumentDelete, onDownload: handleDocumentDownload }, document.id)))] }), _jsxs("div", { className: "labor-file-documents-table", children: [_jsxs("div", { className: "labor-file-section-title", children: [_jsx("h3", { children: "Documentos personales" }), _jsx("span", { children: "Obligatorios y opcionales" })] }), documentDefinitions.map((definition) => (_jsx(DocumentRow, { canWrite: canWrite, document: getLatestDocument(selectedLaborFile.documents, definition.type), documentActionId: documentActionId, label: definition.label, required: isDocumentRequired(definition.type, selectedLaborFile), onDelete: handleDocumentDelete, onDownload: handleDocumentDownload }, definition.type)))] })] }), _jsxs("section", { className: "panel labor-file-contract-generator-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Generaci\u00F3n de contrato laboral" }), _jsx("span", { children: "Word editable con datos del trabajador y resguardo autom\u00E1tico en expediente." })] }), _jsx("span", { className: `status-pill ${contractDocument ? "status-live" : "status-warning"}`, children: contractDocument ? "Contrato guardado" : "Pendiente" })] }), canWrite ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "labor-file-contract-generator-summary", children: [_jsxs("div", { children: [_jsx("strong", { children: contractDocument?.originalFileName ?? "Sin contrato generado" }), _jsx("span", { children: contractDocument
                                                                            ? `${formatFileSize(contractDocument.fileSizeBytes)} / ${formatDateTime(contractDocument.uploadedAt)}`
                                                                            : "El formulario puede prellenarse con IA a partir de los documentos cargados." })] }), _jsx("div", { className: "labor-file-contract-generator-actions", children: _jsx("button", { className: "primary-button", disabled: generatingContract, onClick: handleContractFormToggle, type: "button", children: contractFormOpen ? "Cerrar formulario" : prefillingContract ? "Leyendo documentos..." : "Abrir formulario" }) })] }), contractFormOpen ? (_jsxs("form", { className: "labor-file-contract-form", onSubmit: handleContractGenerate, children: [_jsxs("div", { className: "labor-file-contract-form-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Informaci\u00F3n del trabajador" }), _jsx("span", { children: "Los campos prellenados pueden editarse antes de generar el documento." })] }), _jsx("button", { className: "secondary-button", disabled: prefillingContract || generatingContract, onClick: () => void handleContractPrefill(), type: "button", children: prefillingContract ? "Prellenando..." : "Prellenar con IA" })] }), _jsxs("div", { className: "labor-file-contract-field-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nombre completo" }), _jsx("input", { required: true, value: contractForm.employeeName, onChange: (event) => updateContractFormField("employeeName", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Puesto o labor" }), _jsx("input", { required: true, value: contractForm.position, onChange: (event) => updateContractFormField("position", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "RFC" }), _jsx("input", { value: contractForm.rfc, onChange: (event) => updateContractFormField("rfc", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "CURP" }), _jsx("input", { value: contractForm.curp, onChange: (event) => updateContractFormField("curp", event.target.value) })] }), _jsxs("label", { className: "form-field labor-file-contract-wide-field", children: [_jsx("span", { children: "Domicilio" }), _jsx("textarea", { value: contractForm.employeeAddress, onChange: (event) => updateContractFormField("employeeAddress", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Tel\u00E9fono" }), _jsx("input", { value: contractForm.employeePhone, onChange: (event) => updateContractFormField("employeePhone", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de ingreso/contrato" }), _jsx("input", { type: "date", value: contractForm.originalContractDate, onChange: (event) => updateContractFormField("originalContractDate", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Hora de entrada" }), _jsx("input", { type: "time", value: contractForm.workdayStart, onChange: (event) => updateContractFormField("workdayStart", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Hora de salida" }), _jsx("input", { type: "time", value: contractForm.workdayEnd, onChange: (event) => updateContractFormField("workdayEnd", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Salario mensual bruto" }), _jsx("input", { placeholder: "$0.00", value: contractForm.monthlyGrossSalary, onChange: (event) => updateContractFormField("monthlyGrossSalary", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Salario mensual en letra" }), _jsx("input", { value: contractForm.monthlyGrossSalaryText, onChange: (event) => updateContractFormField("monthlyGrossSalaryText", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Pago quincenal bruto" }), _jsx("input", { placeholder: "$0.00", value: contractForm.biweeklyGrossSalary, onChange: (event) => updateContractFormField("biweeklyGrossSalary", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Pago quincenal en letra" }), _jsx("input", { value: contractForm.biweeklyGrossSalaryText, onChange: (event) => updateContractFormField("biweeklyGrossSalaryText", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de firma" }), _jsx("input", { type: "date", value: contractForm.signingDate, onChange: (event) => updateContractFormField("signingDate", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Ciudad de firma" }), _jsx("input", { value: contractForm.signingCity, onChange: (event) => updateContractFormField("signingCity", event.target.value) })] })] }), contractPrefillSources.length > 0 || contractPrefillNotes.length > 0 ? (_jsxs("div", { className: "labor-file-contract-prefill-panel", children: [contractPrefillSources.length > 0 ? (_jsxs("div", { children: [_jsx("strong", { children: "Campos con soporte documental" }), _jsx("span", { children: contractPrefillSources.map((source) => `${CONTRACT_FIELD_LABELS[source.field]}${source.originalFileName ? ` (${source.originalFileName})` : ""}`).join(", ") })] })) : null, contractPrefillNotes.length > 0 ? (_jsxs("div", { children: [_jsx("strong", { children: "Notas IA" }), _jsx("span", { children: contractPrefillNotes.join(" ") })] })) : null] })) : null, _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", disabled: generatingContract || prefillingContract, type: "submit", children: generatingContract ? "Generando..." : "Generar y guardar .docx" }), contractDocument ? (_jsx("button", { className: "secondary-button", disabled: documentActionId === contractDocument.id, onClick: () => void handleDocumentDownload(contractDocument, "download"), type: "button", children: "Descargar Word" })) : null, _jsx("button", { className: "secondary-button", disabled: generatingContract || prefillingContract, onClick: () => setContractFormOpen(false), type: "button", children: "Cerrar formulario" })] })] })) : null] })) : (_jsx("div", { className: "centered-inline-message", children: "Solo usuarios con permisos de escritura pueden generar contratos laborales." }))] }), _jsxs("section", { className: "panel labor-file-vacation-format-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Generaci\u00F3n de formato de vacaciones" }), _jsx("span", { children: "Word editable con los d\u00EDas solicitados y resguardo autom\u00E1tico en el movimiento de vacaciones." })] }), _jsx("span", { className: `status-pill ${latestVacationFormatEvent ? "status-live" : "status-warning"}`, children: latestVacationFormatEvent ? "Formato guardado" : "Pendiente" })] }), canWrite ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "labor-file-vacation-format-summary", children: [_jsxs("div", { children: [_jsx("strong", { children: latestVacationFormatEvent?.acceptanceOriginalFileName ?? "Sin formato generado" }), _jsx("span", { children: latestVacationFormatEvent
                                                                            ? `${latestVacationFormatEvent.days} días / ${formatVacationEventDates(latestVacationFormatEvent)}`
                                                                            : "Abre el formulario, selecciona los días y genera el Word del formato de vacaciones." })] }), _jsx("div", { className: "labor-file-vacation-format-actions", children: _jsx("button", { className: "primary-button", disabled: generatingVacationFormat, onClick: handleVacationFormatFormToggle, type: "button", children: vacationFormatFormOpen ? "Cerrar formulario" : "Abrir formulario" }) })] }), vacationFormatFormOpen ? (_jsxs("form", { className: "labor-file-vacation-format-form", onSubmit: handleVacationFormatGenerate, children: [_jsxs("div", { className: "labor-file-vacation-format-form-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Datos del formato" }), _jsx("span", { children: "Formulario editable para generar el Word en hoja membretada y guardarlo en el expediente." })] }), _jsx("button", { className: "ghost-button", disabled: generatingVacationFormat, onClick: handleVacationFormatFormReset, type: "button", children: "Restaurar datos" })] }), _jsxs("div", { className: "labor-file-vacation-format-stats", children: [_jsxs("div", { children: [_jsx("span", { children: "D\u00EDas solicitados" }), _jsx("strong", { children: vacationFormatSelectedDays || vacationFormatForm.vacationDays })] }), _jsxs("div", { children: [_jsx("span", { children: "Quedar\u00EDan pendientes" }), _jsx("strong", { children: vacationFormatProjectedPending })] }), _jsxs("div", { children: [_jsx("span", { children: "Disfrutados acumulados" }), _jsx("strong", { children: vacationFormatProjectedEnjoyed })] })] }), _jsxs("div", { className: "labor-file-vacation-format-section", children: [_jsxs("div", { className: "labor-file-vacation-format-section-title", children: [_jsx("h4", { children: "Selecci\u00F3n de d\u00EDas" }), _jsxs("span", { children: [vacationFormatSelectedDays, " d\u00EDas en el formato"] })] }), _jsxs("div", { className: "labor-file-vacation-date-tools", children: [_jsxs("div", { className: "labor-file-vacation-date-group is-range", children: [_jsx("h3", { children: "D\u00EDas continuos" }), _jsxs("div", { className: "labor-file-vacation-date-row", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Inicio" }), _jsx("input", { type: "date", value: vacationFormatRange.startDate, onChange: (event) => setVacationFormatRange((current) => ({ ...current, startDate: event.target.value })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fin" }), _jsx("input", { type: "date", value: vacationFormatRange.endDate, onChange: (event) => setVacationFormatRange((current) => ({ ...current, endDate: event.target.value })) })] }), _jsx("button", { className: "secondary-button", onClick: handleVacationFormatRangeAdd, type: "button", children: "Agregar rango" })] })] }), _jsxs("div", { className: "labor-file-vacation-date-group is-single", children: [_jsx("h3", { children: "D\u00EDa suelto" }), _jsxs("div", { className: "labor-file-vacation-date-row", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha" }), _jsx("input", { type: "date", value: vacationFormatSingleDate, onChange: (event) => setVacationFormatSingleDate(event.target.value) })] }), _jsx("button", { className: "secondary-button", onClick: handleVacationFormatSingleDateAdd, type: "button", children: "Agregar d\u00EDa" })] })] })] }), _jsx("div", { className: "labor-file-vacation-selected-days", children: vacationFormatForm.vacationDates.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Agrega d\u00EDas continuos o salteados." })) : (_jsx("div", { className: "labor-file-vacation-day-chips", children: vacationFormatForm.vacationDates.map((date) => (_jsxs("button", { onClick: () => handleVacationFormatDateRemove(date), type: "button", children: [formatDate(date), " ", _jsx("span", { children: "Quitar" })] }, date))) })) })] }), _jsxs("div", { className: "labor-file-vacation-format-section", children: [_jsxs("div", { className: "labor-file-vacation-format-section-title", children: [_jsx("h4", { children: "Informaci\u00F3n del documento" }), _jsx("span", { children: "Todos los campos pueden editarse antes de generar" })] }), _jsxs("div", { className: "labor-file-vacation-format-field-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nombre" }), _jsx("input", { required: true, value: vacationFormatForm.employeeName, onChange: (event) => updateVacationFormatFormField("employeeName", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha del formato" }), _jsx("input", { required: true, type: "date", value: vacationFormatForm.requestDate, onChange: (event) => updateVacationFormatFormField("requestDate", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "D\u00EDas de vacaciones" }), _jsx("input", { min: "1", type: "number", value: vacationFormatForm.vacationDays, onChange: (event) => updateVacationFormatFormField("vacationDays", Number(event.target.value)) })] }), _jsxs("label", { className: "form-field labor-file-vacation-format-wide-field", children: [_jsx("span", { children: "Texto \"A disfrutar\"" }), _jsx("input", { value: vacationFormatForm.enjoymentText, onChange: (event) => updateVacationFormatFormField("enjoymentText", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "El interesado" }), _jsx("input", { value: vacationFormatForm.interestedName, onChange: (event) => updateVacationFormatFormField("interestedName", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Autoriza" }), _jsx("input", { value: vacationFormatForm.authorizerName, onChange: (event) => updateVacationFormatFormField("authorizerName", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de ingreso" }), _jsx("input", { type: "date", value: vacationFormatForm.hireDate, onChange: (event) => updateVacationFormatFormField("hireDate", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de inicio" }), _jsx("input", { type: "date", value: vacationFormatForm.vacationYearStartDate, onChange: (event) => updateVacationFormatFormField("vacationYearStartDate", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "A\u00F1os cumplidos" }), _jsx("input", { value: vacationFormatForm.completedYearsLabel, onChange: (event) => updateVacationFormatFormField("completedYearsLabel", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "D\u00EDas que corresponden" }), _jsx("input", { min: "0", type: "number", value: vacationFormatForm.entitlementDays, onChange: (event) => updateVacationFormatFormField("entitlementDays", Number(event.target.value)) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "D\u00EDas pendientes" }), _jsx("input", { min: "0", type: "number", value: vacationFormatForm.pendingDays, onChange: (event) => updateVacationFormatFormField("pendingDays", Number(event.target.value)) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "D\u00EDas disfrutados" }), _jsx("input", { min: "0", type: "number", value: vacationFormatForm.enjoyedDays, onChange: (event) => updateVacationFormatFormField("enjoyedDays", Number(event.target.value)) })] }), _jsxs("label", { className: "form-field labor-file-vacation-format-wide-field", children: [_jsx("span", { children: "Descripci\u00F3n" }), _jsx("input", { value: vacationFormatForm.description, onChange: (event) => updateVacationFormatFormField("description", event.target.value) })] })] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", disabled: generatingVacationFormat, type: "submit", children: generatingVacationFormat ? "Generando..." : "Generar, guardar y contabilizar" }), latestVacationFormatEvent ? (_jsx("button", { className: "secondary-button", disabled: vacationFileActionId === latestVacationFormatEvent.id, onClick: () => void handleVacationAcceptanceDownload(latestVacationFormatEvent, "download"), type: "button", children: "Descargar formato" })) : null, _jsx("button", { className: "secondary-button", disabled: generatingVacationFormat, onClick: () => setVacationFormatFormOpen(false), type: "button", children: "Cerrar formulario" })] })] })) : null] })) : (_jsx("div", { className: "centered-inline-message", children: "Solo usuarios con permisos de escritura pueden generar formatos de vacaciones." }))] }), _jsxs("section", { className: "panel labor-file-vacations-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("h2", { children: "Contabilizaci\u00F3n de vacaciones" }), _jsxs("span", { children: [selectedLaborFile.vacationSummary.remainingDays, " d\u00EDas disponibles"] })] }) }), _jsx("div", { className: "labor-file-vacation-summary", children: selectedLaborFile.vacationSummary.lines.map((line) => (_jsx("p", { children: line }, line))) }), canWrite ? (_jsxs("form", { className: "labor-file-vacation-form", onSubmit: handleVacationSubmit, children: [_jsxs("div", { className: "labor-file-vacation-date-tools", children: [_jsxs("div", { className: "labor-file-vacation-date-group is-range", children: [_jsx("h3", { children: "D\u00EDas continuos" }), _jsxs("div", { className: "labor-file-vacation-date-row", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Inicio" }), _jsx("input", { type: "date", value: vacationRange.startDate, onChange: (event) => setVacationRange((current) => ({ ...current, startDate: event.target.value })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fin" }), _jsx("input", { type: "date", value: vacationRange.endDate, onChange: (event) => setVacationRange((current) => ({ ...current, endDate: event.target.value })) })] }), _jsx("button", { className: "secondary-button", onClick: handleVacationRangeAdd, type: "button", children: "Agregar rango" })] })] }), _jsxs("div", { className: "labor-file-vacation-date-group is-single", children: [_jsx("h3", { children: "D\u00EDa suelto" }), _jsxs("div", { className: "labor-file-vacation-date-row", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha" }), _jsx("input", { type: "date", value: vacationSingleDate, onChange: (event) => setVacationSingleDate(event.target.value) })] }), _jsx("button", { className: "secondary-button", onClick: handleVacationSingleDateAdd, type: "button", children: "Agregar d\u00EDa" })] })] })] }), _jsxs("div", { className: "labor-file-vacation-selected-days", children: [_jsxs("div", { className: "labor-file-section-title", children: [_jsx("h3", { children: "D\u00EDas seleccionados" }), _jsxs("span", { children: [selectedVacationDates.length, " d\u00EDas"] })] }), selectedVacationDates.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Agrega d\u00EDas continuos o salteados." })) : (_jsx("div", { className: "labor-file-vacation-day-chips", children: selectedVacationDates.map((date) => (_jsxs("button", { onClick: () => handleVacationDateRemove(date), type: "button", children: [formatDate(date), " ", _jsx("span", { children: "Quitar" })] }, date))) }))] }), _jsxs("label", { className: "form-field labor-file-vacation-file", children: [_jsx("span", { children: "Formato de aceptaci\u00F3n (PDF o Word)" }), _jsx("input", { accept: ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document", required: true, type: "file", onChange: handleVacationAcceptanceFileChange })] }), _jsxs("label", { className: "form-field labor-file-vacation-description", children: [_jsx("span", { children: "Descripci\u00F3n" }), _jsx("input", { value: vacationForm.description ?? "", onChange: (event) => setVacationForm((current) => ({ ...current, description: event.target.value })) })] }), _jsx("button", { className: "primary-button", disabled: saving, type: "submit", children: "Agregar vacaciones" })] })) : null, _jsx("div", { className: "labor-file-vacation-events", children: selectedLaborFile.vacationEvents.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Sin vacaciones registradas." })) : selectedLaborFile.vacationEvents.map((event) => (_jsxs("div", { className: "labor-file-vacation-event", children: [_jsxs("div", { children: [_jsx("strong", { children: event.eventType === "VACATION" ? "Vacaciones" : "Descuento del año pasado" }), _jsxs("span", { children: [event.days, " d\u00EDas", formatVacationEventDates(event) ? ` / ${formatVacationEventDates(event)}` : ""] }), event.acceptanceOriginalFileName ? _jsxs("small", { children: ["Formato: ", event.acceptanceOriginalFileName] }) : null] }), event.description ? _jsx("small", { children: event.description }) : null, _jsxs("div", { className: "table-actions", children: [event.acceptanceOriginalFileName ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "ghost-button", disabled: vacationFileActionId === event.id, onClick: () => void handleVacationAcceptanceDownload(event, "open"), type: "button", children: "Abrir formato" }), _jsx("button", { className: "ghost-button", disabled: vacationFileActionId === event.id, onClick: () => void handleVacationAcceptanceDownload(event, "download"), type: "button", children: "Descargar" })] })) : null, canWrite ? (_jsx("button", { className: "danger-button", disabled: deletingVacationId === event.id, onClick: () => void handleVacationDelete(event.id), type: "button", children: "Quitar" })) : null] })] }, event.id))) })] })] })) : null] })] })] }));
}
function DocumentRow({ label, required, document, canWrite, documentActionId, onDownload, onDelete }) {
    return (_jsxs("div", { className: `labor-file-document-row ${document ? "is-loaded" : "is-missing"}`, children: [_jsxs("div", { children: [_jsx("strong", { children: label }), _jsx("span", { children: required ? "Obligatorio" : "Opcional" })] }), _jsxs("div", { children: [_jsx("strong", { children: document?.originalFileName ?? "Pendiente" }), _jsx("span", { children: document ? `${formatFileSize(document.fileSizeBytes)} / ${formatDateTime(document.uploadedAt)}` : "-" })] }), _jsx("div", { className: "table-actions", children: document ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "secondary-button", disabled: documentActionId === document.id, onClick: () => void onDownload(document, "open"), type: "button", children: "Abrir" }), _jsx("button", { className: "secondary-button", disabled: documentActionId === document.id, onClick: () => void onDownload(document, "download"), type: "button", children: "Descargar" }), canWrite ? (_jsx("button", { className: "danger-button", disabled: documentActionId === document.id, onClick: () => void onDelete(document), type: "button", children: "Borrar" })) : null] })) : (_jsx("span", { className: "status-pill status-warning", children: "Falta" })) })] }));
}
