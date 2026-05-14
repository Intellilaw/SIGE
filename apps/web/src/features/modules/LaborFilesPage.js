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
    return definition?.pdfOnly
        ? ".pdf,application/pdf"
        : ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
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
            return;
        }
        setProfileForm({
            hireDate: selectedLaborFile.hireDate.slice(0, 10),
            notes: selectedLaborFile.notes ?? ""
        });
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
    const addenda = selectedLaborFile?.documents
        .filter((document) => document.documentType === "ADDENDUM")
        .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt)) ?? [];
    const documentDefinitions = LABOR_FILE_DOCUMENT_DEFINITIONS.filter((definition) => !definition.contractSection);
    return (_jsxs("section", { className: "page-stack labor-files-page", children: [_jsxs("header", { className: "hero module-hero labor-files-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Expedientes" }), _jsx("div", { children: _jsx("h2", { children: "Expedientes Laborales" }) })] }), _jsx("p", { className: "muted", children: "Contratos, documentos obligatorios y vacaciones por usuario, conservados tambi\u00E9n para extrabajadores." })] }), canWrite ? (_jsxs("div", { className: "summary-grid", children: [_jsx(SummaryCard, { label: "Expedientes", value: metrics.total, accent: "#1d4ed8" }), _jsx(SummaryCard, { label: "Completos", value: metrics.complete, accent: "#0f766e" }), _jsx(SummaryCard, { label: "Incompletos", value: metrics.incomplete, accent: "#b42318" }), _jsx(SummaryCard, { label: "Extrabajadores", value: metrics.former, accent: "#9a6700" })] })) : null, flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, canWrite ? (_jsxs("section", { className: "panel labor-file-global-vacation-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Vacaciones generales" }), _jsx("span", { children: "Estos d\u00EDas se descuentan del conteo de todos los expedientes aplicables." })] }), _jsxs("span", { children: [globalVacationDays.length, " registrados"] })] }), _jsxs("form", { className: "labor-file-global-vacation-form", onSubmit: handleGlobalVacationSubmit, children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "D\u00EDa" }), _jsx("input", { required: true, type: "date", value: globalVacationForm.date, onChange: (event) => setGlobalVacationForm((current) => ({ ...current, date: event.target.value })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "D\u00EDas a descontar" }), _jsx("input", { min: "0.5", step: "0.5", type: "number", value: globalVacationForm.days ?? 1, onChange: (event) => setGlobalVacationForm((current) => ({ ...current, days: Number(event.target.value) })) })] }), _jsxs("label", { className: "form-field labor-file-global-vacation-description", children: [_jsx("span", { children: "Descripci\u00F3n" }), _jsx("input", { value: globalVacationForm.description ?? "", onChange: (event) => setGlobalVacationForm((current) => ({ ...current, description: event.target.value })) })] }), _jsx("button", { className: "primary-button", disabled: saving, type: "submit", children: "Marcar para todos" })] }), _jsx("div", { className: "labor-file-global-vacation-list", children: globalVacationDays.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Sin vacaciones generales registradas." })) : globalVacationDays.map((day) => (_jsxs("div", { className: "labor-file-vacation-event", children: [_jsxs("div", { children: [_jsx("strong", { children: formatDate(day.date) }), _jsxs("span", { children: [day.days, " ", day.days === 1 ? "día" : "días", " para todos"] })] }), day.description ? _jsx("small", { children: day.description }) : _jsx("small", { children: "Vacaci\u00F3n general" }), _jsx("button", { className: "danger-button", disabled: deletingGlobalVacationId === day.id, onClick: () => void handleGlobalVacationDelete(day.id), type: "button", children: "Quitar" })] }, day.id))) })] })) : null, _jsxs("section", { className: "labor-files-layout", children: [canWrite ? (_jsxs("aside", { className: "panel labor-files-sidebar", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Colaboradores" }), _jsx("span", { children: filteredLaborFiles.length })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { type: "search", value: query, onChange: (event) => setQuery(event.target.value), placeholder: "Nombre, equipo o rol..." })] }), _jsxs("div", { className: "labor-file-selector-list", children: [loading ? _jsx("div", { className: "centered-inline-message", children: "Cargando expedientes..." }) : null, !loading && filteredLaborFiles.map((laborFile) => (_jsxs("button", { className: [
                                            laborFile.id === selectedLaborFile?.id ? "is-active" : "",
                                            laborFile.status === "COMPLETE" ? "is-complete" : "is-incomplete"
                                        ].filter(Boolean).join(" "), onClick: () => setSelectedId(laborFile.id), type: "button", children: [_jsxs("div", { className: "labor-file-selector-head", children: [_jsx("strong", { children: laborFile.employeeName }), _jsx("span", { className: `status-pill labor-file-selector-status ${laborFile.status === "COMPLETE" ? "status-live" : "status-warning"}`, children: laborFile.status === "COMPLETE" ? "Completo" : "Incompleto" })] }), _jsx("span", { children: getEmployeeSecondaryLabel(laborFile) }), laborFile.employmentStatus === "FORMER" ? _jsx("small", { children: "Extrabajador" }) : null] }, laborFile.id)))] })] })) : null, _jsxs("div", { className: "labor-file-main", children: [!selectedLaborFile && !loading ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "No hay expediente laboral disponible." }) })) : null, selectedLaborFile ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel labor-file-profile-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: selectedLaborFile.employeeName }), _jsxs("span", { children: [selectedLaborFile.legacyTeam ?? "Sin equipo", " / ", selectedLaborFile.specificRole ?? "Sin rol"] })] }), _jsxs("div", { className: "labor-file-status-group", children: [_jsx("span", { className: `status-pill ${selectedLaborFile.status === "COMPLETE" ? "status-live" : "status-warning"}`, children: selectedLaborFile.status === "COMPLETE" ? "Completo" : "Incompleto" }), _jsx("span", { className: `status-pill ${selectedLaborFile.employmentStatus === "FORMER" ? "status-migration" : "status-live"}`, children: selectedLaborFile.employmentStatus === "FORMER" ? "Extrabajador" : "Activo" })] })] }), _jsxs("div", { className: "labor-file-profile-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Usuario" }), _jsx("strong", { children: selectedLaborFile.employeeUsername })] }), _jsxs("div", { children: [_jsx("span", { children: "Nombre corto" }), _jsx("strong", { children: selectedLaborFile.employeeShortName ?? "-" })] }), _jsxs("div", { children: [_jsx("span", { children: "Fecha de ingreso" }), _jsx("strong", { children: formatDate(selectedLaborFile.hireDate) })] }), _jsxs("div", { children: [_jsx("span", { children: "\u00DAltima actualizaci\u00F3n" }), _jsx("strong", { children: formatDateTime(selectedLaborFile.updatedAt) })] })] }), canWrite ? (_jsxs("form", { className: "labor-file-profile-form", onSubmit: handleProfileSave, children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de ingreso" }), _jsx("input", { type: "date", value: profileForm.hireDate, onChange: (event) => setProfileForm((current) => ({ ...current, hireDate: event.target.value })) })] }), _jsxs("label", { className: "form-field labor-file-notes-field", children: [_jsx("span", { children: "Notas" }), _jsx("textarea", { value: profileForm.notes, onChange: (event) => setProfileForm((current) => ({ ...current, notes: event.target.value })) })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", disabled: saving, type: "submit", children: "Guardar expediente" }), _jsx("button", { className: "secondary-button", disabled: saving || loading, onClick: () => void loadLaborFiles(selectedLaborFile.id), type: "button", children: "Refrescar" })] })] })) : null] }), _jsxs("section", { className: "panel labor-file-upload-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Carga documental" }), _jsxs("span", { children: [selectedLaborFile.documents.length, " archivos"] })] }), canWrite ? (_jsxs("form", { className: "labor-file-upload-form", onSubmit: handleUpload, children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Tipo de documento" }), _jsx("select", { value: uploadType, onChange: (event) => setUploadType(event.target.value), children: LABOR_FILE_DOCUMENT_DEFINITIONS.map((definition) => (_jsx("option", { value: definition.type, children: definition.label }, definition.type))) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Archivo" }), _jsx("input", { accept: getUploadAccept(uploadType), onChange: handleFileChange, type: "file" })] }), _jsx("button", { className: "primary-button", disabled: saving, type: "submit", children: "Cargar" })] })) : null, _jsxs("div", { className: "labor-file-contract-block", children: [_jsxs("div", { className: "labor-file-section-title", children: [_jsx("h3", { children: "Contrato laboral" }), _jsx("span", { children: contractDocument ? "Cargado" : "Pendiente" })] }), _jsx(DocumentRow, { canWrite: canWrite, document: contractDocument, documentActionId: documentActionId, label: "Contrato laboral", required: true, onDelete: handleDocumentDelete, onDownload: handleDocumentDownload }), _jsxs("div", { className: "labor-file-section-title", children: [_jsx("h3", { children: "Addenda" }), _jsx("span", { children: addenda.length })] }), addenda.length === 0 ? (_jsx("div", { className: "labor-file-document-row is-empty", children: _jsx("span", { children: "Sin addenda cargada" }) })) : addenda.map((document) => (_jsx(DocumentRow, { canWrite: canWrite, document: document, documentActionId: documentActionId, label: "Addendum", onDelete: handleDocumentDelete, onDownload: handleDocumentDownload }, document.id)))] }), _jsxs("div", { className: "labor-file-documents-table", children: [_jsxs("div", { className: "labor-file-section-title", children: [_jsx("h3", { children: "Documentos personales" }), _jsx("span", { children: "Obligatorios y opcionales" })] }), documentDefinitions.map((definition) => (_jsx(DocumentRow, { canWrite: canWrite, document: getLatestDocument(selectedLaborFile.documents, definition.type), documentActionId: documentActionId, label: definition.label, required: isDocumentRequired(definition.type, selectedLaborFile), onDelete: handleDocumentDelete, onDownload: handleDocumentDownload }, definition.type)))] })] }), _jsxs("section", { className: "panel labor-file-vacations-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("h2", { children: "Contabilizaci\u00F3n de vacaciones" }), _jsxs("span", { children: [selectedLaborFile.vacationSummary.remainingDays, " d\u00EDas disponibles"] })] }) }), _jsx("div", { className: "labor-file-vacation-summary", children: selectedLaborFile.vacationSummary.lines.map((line) => (_jsx("p", { children: line }, line))) }), canWrite ? (_jsxs("form", { className: "labor-file-vacation-form", onSubmit: handleVacationSubmit, children: [_jsxs("div", { className: "labor-file-vacation-date-tools", children: [_jsxs("div", { className: "labor-file-vacation-date-group is-range", children: [_jsx("h3", { children: "D\u00EDas continuos" }), _jsxs("div", { className: "labor-file-vacation-date-row", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Inicio" }), _jsx("input", { type: "date", value: vacationRange.startDate, onChange: (event) => setVacationRange((current) => ({ ...current, startDate: event.target.value })) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fin" }), _jsx("input", { type: "date", value: vacationRange.endDate, onChange: (event) => setVacationRange((current) => ({ ...current, endDate: event.target.value })) })] }), _jsx("button", { className: "secondary-button", onClick: handleVacationRangeAdd, type: "button", children: "Agregar rango" })] })] }), _jsxs("div", { className: "labor-file-vacation-date-group is-single", children: [_jsx("h3", { children: "D\u00EDa suelto" }), _jsxs("div", { className: "labor-file-vacation-date-row", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha" }), _jsx("input", { type: "date", value: vacationSingleDate, onChange: (event) => setVacationSingleDate(event.target.value) })] }), _jsx("button", { className: "secondary-button", onClick: handleVacationSingleDateAdd, type: "button", children: "Agregar d\u00EDa" })] })] })] }), _jsxs("div", { className: "labor-file-vacation-selected-days", children: [_jsxs("div", { className: "labor-file-section-title", children: [_jsx("h3", { children: "D\u00EDas seleccionados" }), _jsxs("span", { children: [selectedVacationDates.length, " d\u00EDas"] })] }), selectedVacationDates.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Agrega d\u00EDas continuos o salteados." })) : (_jsx("div", { className: "labor-file-vacation-day-chips", children: selectedVacationDates.map((date) => (_jsxs("button", { onClick: () => handleVacationDateRemove(date), type: "button", children: [formatDate(date), " ", _jsx("span", { children: "Quitar" })] }, date))) }))] }), _jsxs("label", { className: "form-field labor-file-vacation-file", children: [_jsx("span", { children: "Formato de aceptaci\u00F3n (PDF)" }), _jsx("input", { accept: ".pdf,application/pdf", required: true, type: "file", onChange: handleVacationAcceptanceFileChange })] }), _jsxs("label", { className: "form-field labor-file-vacation-description", children: [_jsx("span", { children: "Descripci\u00F3n" }), _jsx("input", { value: vacationForm.description ?? "", onChange: (event) => setVacationForm((current) => ({ ...current, description: event.target.value })) })] }), _jsx("button", { className: "primary-button", disabled: saving, type: "submit", children: "Agregar vacaciones" })] })) : null, _jsx("div", { className: "labor-file-vacation-events", children: selectedLaborFile.vacationEvents.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Sin vacaciones registradas." })) : selectedLaborFile.vacationEvents.map((event) => (_jsxs("div", { className: "labor-file-vacation-event", children: [_jsxs("div", { children: [_jsx("strong", { children: event.eventType === "VACATION" ? "Vacaciones" : "Descuento del año pasado" }), _jsxs("span", { children: [event.days, " d\u00EDas", formatVacationEventDates(event) ? ` / ${formatVacationEventDates(event)}` : ""] }), event.acceptanceOriginalFileName ? _jsxs("small", { children: ["Formato: ", event.acceptanceOriginalFileName] }) : null] }), event.description ? _jsx("small", { children: event.description }) : null, _jsxs("div", { className: "table-actions", children: [event.acceptanceOriginalFileName ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "ghost-button", disabled: vacationFileActionId === event.id, onClick: () => void handleVacationAcceptanceDownload(event, "open"), type: "button", children: "Abrir PDF" }), _jsx("button", { className: "ghost-button", disabled: vacationFileActionId === event.id, onClick: () => void handleVacationAcceptanceDownload(event, "download"), type: "button", children: "Descargar" })] })) : null, canWrite ? (_jsx("button", { className: "danger-button", disabled: deletingVacationId === event.id, onClick: () => void handleVacationDelete(event.id), type: "button", children: "Quitar" })) : null] })] }, event.id))) })] })] })) : null] })] })] }));
}
function DocumentRow({ label, required, document, canWrite, documentActionId, onDownload, onDelete }) {
    return (_jsxs("div", { className: `labor-file-document-row ${document ? "is-loaded" : "is-missing"}`, children: [_jsxs("div", { children: [_jsx("strong", { children: label }), _jsx("span", { children: required ? "Obligatorio" : "Opcional" })] }), _jsxs("div", { children: [_jsx("strong", { children: document?.originalFileName ?? "Pendiente" }), _jsx("span", { children: document ? `${formatFileSize(document.fileSizeBytes)} / ${formatDateTime(document.uploadedAt)}` : "-" })] }), _jsx("div", { className: "table-actions", children: document ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "secondary-button", disabled: documentActionId === document.id, onClick: () => void onDownload(document, "open"), type: "button", children: "Abrir" }), _jsx("button", { className: "secondary-button", disabled: documentActionId === document.id, onClick: () => void onDownload(document, "download"), type: "button", children: "Descargar" }), canWrite ? (_jsx("button", { className: "danger-button", disabled: documentActionId === document.id, onClick: () => void onDelete(document), type: "button", children: "Borrar" })) : null] })) : (_jsx("span", { className: "status-pill status-warning", children: "Falta" })) })] }));
}
