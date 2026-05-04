import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiDownload, apiGet, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
const MODULE_TITLE = "Administraci\u00f3n de contratos internos";
const SECTION_LABELS = {
    PROFESSIONAL_SERVICES: "Contratos de prestaci\u00f3n de servicios profesionales",
    LABOR: "Contratos laborales"
};
const initialFormState = {
    contractNumber: "",
    clientId: "",
    collaboratorName: "",
    documentKind: "CONTRACT",
    milestonesText: "",
    notes: ""
};
function toErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "Ocurrio un error inesperado.";
}
function hasPermission(permissions, permission) {
    return Boolean(permissions?.includes("*") || permissions?.includes(permission));
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
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleDateString("es-MX");
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
function formatMilestone(milestone) {
    const parts = [
        milestone.dueDate ? formatDate(milestone.dueDate) : "",
        milestone.label,
        milestone.amountMxn ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(milestone.amountMxn) : "",
        milestone.notes ?? ""
    ].filter(Boolean);
    return parts.join(" - ");
}
function dateFromSlashFormat(value) {
    const match = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (!match) {
        return "";
    }
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    return `${match[3]}-${month}-${day}`;
}
function parseMilestoneLines(value) {
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
function sortQuotes(items) {
    return [...items].sort((left, right) => left.quoteNumber.localeCompare(right.quoteNumber, "es-MX", { numeric: true, sensitivity: "base" }));
}
function normalizeIdentifierSegment(value) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toUpperCase();
}
function buildLaborContractNumber(form) {
    const collaborator = normalizeIdentifierSegment(form.collaboratorName || "COLABORADOR");
    const documentKind = form.documentKind === "ADDENDUM" ? "ADD" : "LAB";
    return `RC-${documentKind}-${collaborator}-${Date.now()}`;
}
function contractOwnerLabel(contract) {
    if (contract.contractType === "PROFESSIONAL_SERVICES") {
        return [contract.clientNumber, contract.clientName].filter(Boolean).join(" - ") || "-";
    }
    return contract.collaboratorName ?? "-";
}
export function InternalContractsPage() {
    const { user } = useAuth();
    const [activeSection, setActiveSection] = useState("PROFESSIONAL_SERVICES");
    const [contracts, setContracts] = useState([]);
    const [clients, setClients] = useState([]);
    const [collaborators, setCollaborators] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [form, setForm] = useState(initialFormState);
    const [selectedFile, setSelectedFile] = useState(null);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [flash, setFlash] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const canRead = hasPermission(user?.permissions, "internal-contracts:read") || hasPermission(user?.permissions, "internal-contracts:write");
    const canWrite = hasPermission(user?.permissions, "internal-contracts:write");
    async function loadModule() {
        setLoading(true);
        setErrorMessage(null);
        try {
            const [contractRows, clientRows, collaboratorRows, quoteRows] = await Promise.all([
                apiGet("/internal-contracts"),
                apiGet("/clients"),
                apiGet("/internal-contracts/collaborators"),
                apiGet("/quotes")
            ]);
            setContracts(contractRows);
            setClients(sortClients(clientRows));
            setCollaborators(collaboratorRows);
            setQuotes(quoteRows);
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
    }, [canRead]);
    const sectionCounts = useMemo(() => ({
        PROFESSIONAL_SERVICES: contracts.filter((contract) => contract.contractType === "PROFESSIONAL_SERVICES").length,
        LABOR: contracts.filter((contract) => contract.contractType === "LABOR").length
    }), [contracts]);
    const filteredContracts = useMemo(() => {
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
    const selectedClientQuotes = useMemo(() => sortQuotes(quotes.filter((quote) => quote.clientId === form.clientId)), [form.clientId, quotes]);
    const parsedMilestones = useMemo(() => parseMilestoneLines(form.milestonesText), [form.milestonesText]);
    function updateForm(key, value) {
        setForm((current) => ({ ...current, [key]: value }));
        setFlash(null);
    }
    function handleSectionChange(section) {
        setActiveSection(section);
        setForm(initialFormState);
        setSelectedFile(null);
        setFlash(null);
    }
    function handleFileChange(event) {
        setSelectedFile(event.target.files?.[0] ?? null);
        setFlash(null);
    }
    function handleClientChange(clientId) {
        setForm((current) => ({ ...current, clientId, contractNumber: "" }));
        setFlash(null);
    }
    async function handleSubmit(event) {
        event.preventDefault();
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
        setSaving(true);
        setFlash(null);
        try {
            const created = await apiPost("/internal-contracts", {
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
            const { blob, filename } = await apiDownload(`/internal-contracts/${contract.id}/document`);
            downloadBlobFile(blob, filename ?? contract.originalFileName ?? `${contract.contractNumber}.bin`);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDownloadingId(null);
        }
    }
    async function handleDelete(contract) {
        if (!window.confirm(`Seguro que deseas borrar el contrato ${contract.contractNumber}?`)) {
            return;
        }
        setDeletingId(contract.id);
        setFlash(null);
        try {
            await apiDelete(`/internal-contracts/${contract.id}`);
            setContracts((current) => current.filter((entry) => entry.id !== contract.id));
            setFlash({ tone: "success", text: `Contrato ${contract.contractNumber} borrado.` });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDeletingId(null);
        }
    }
    if (!canRead) {
        return (_jsx("section", { className: "page-stack", children: _jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "module-hero-head", children: _jsx("div", { children: _jsx("h2", { children: MODULE_TITLE }) }) }), _jsx("p", { className: "muted", children: "Tu perfil actual no tiene permisos para consultar este modulo." })] }) }));
    }
    return (_jsxs("section", { className: "page-stack internal-contracts-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Contratos" }), _jsx("div", { children: _jsx("h2", { children: MODULE_TITLE }) })] }), _jsx("p", { className: "muted", children: "Control de contratos por cliente, contratos laborales y addenda por colaborador interno de Rusconii Consulting." })] }), _jsx("section", { className: "panel", children: _jsx("div", { className: "leads-tabs internal-contracts-tabs", role: "tablist", "aria-label": "Secciones de contratos internos", children: ["PROFESSIONAL_SERVICES", "LABOR"].map((section) => (_jsxs("button", { type: "button", className: `lead-tab ${activeSection === section ? "is-active" : ""}`, onClick: () => handleSectionChange(section), children: [SECTION_LABELS[section], " (", sectionCounts[section], ")"] }, section))) }) }), flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsxs("section", { className: "internal-contracts-layout", children: [_jsxs("section", { className: "panel internal-contracts-form-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Cargar contrato" }), _jsx("span", { children: activeSection === "LABOR" ? "Laboral / addendum" : "Servicios profesionales" })] }), canWrite ? (_jsxs("form", { className: "internal-contracts-form", onSubmit: handleSubmit, children: [_jsxs("div", { className: "internal-contracts-form-grid", children: [activeSection === "PROFESSIONAL_SERVICES" ? (_jsxs(_Fragment, { children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Cliente" }), _jsxs("select", { value: form.clientId, onChange: (event) => handleClientChange(event.target.value), disabled: saving || loading, children: [_jsx("option", { value: "", children: "-- Seleccionar cliente --" }), clients.map((client) => (_jsxs("option", { value: client.id, children: [client.clientNumber, " - ", client.name] }, client.id)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Numero de contrato" }), _jsxs("select", { value: form.contractNumber, onChange: (event) => updateForm("contractNumber", event.target.value), disabled: saving || loading || !form.clientId || selectedClientQuotes.length === 0, children: [_jsx("option", { value: "", children: !form.clientId
                                                                            ? "-- Selecciona cliente primero --"
                                                                            : selectedClientQuotes.length === 0
                                                                                ? "-- Sin cotizaciones registradas --"
                                                                                : "-- Seleccionar cotizacion --" }), selectedClientQuotes.map((quote) => (_jsxs("option", { value: quote.quoteNumber, children: [quote.quoteNumber, " - ", quote.subject] }, quote.id)))] })] })] })) : (_jsxs(_Fragment, { children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Colaborador interno" }), _jsxs("select", { value: form.collaboratorName, onChange: (event) => updateForm("collaboratorName", event.target.value), disabled: saving || loading, children: [_jsx("option", { value: "", children: "-- Seleccionar colaborador --" }), collaborators.map((collaborator) => (_jsxs("option", { value: collaborator.name, children: [collaborator.shortName ? `${collaborator.shortName} - ` : "", collaborator.name] }, collaborator.id)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Tipo de documento" }), _jsxs("select", { value: form.documentKind, onChange: (event) => updateForm("documentKind", event.target.value), disabled: saving, children: [_jsx("option", { value: "CONTRACT", children: "Contrato laboral" }), _jsx("option", { value: "ADDENDUM", children: "Addendum" })] })] })] })), _jsxs("label", { className: "form-field internal-contracts-file-field", children: [_jsx("span", { children: "Archivo" }), _jsx("input", { type: "file", accept: ".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt", onChange: handleFileChange, disabled: saving })] }), activeSection === "PROFESSIONAL_SERVICES" ? (_jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Fechas o hitos de pago" }), _jsx("textarea", { value: form.milestonesText, onChange: (event) => updateForm("milestonesText", event.target.value), placeholder: "Una linea por hito. Ej.\n2026-05-15 - Anticipo $50000\n2026-06-30 - Segundo pago", disabled: saving })] })) : null, _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Notas" }), _jsx("textarea", { value: form.notes, onChange: (event) => updateForm("notes", event.target.value), placeholder: "Observaciones internas del contrato...", disabled: saving })] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", type: "submit", disabled: saving || loading, children: saving ? "Cargando..." : "Guardar contrato" }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => void loadModule(), disabled: saving || loading, children: "Refrescar" })] })] })) : (_jsx("div", { className: "centered-inline-message", children: "Tu perfil puede consultar contratos, pero no cargar nuevos archivos." }))] }), _jsxs("section", { className: "panel internal-contracts-list-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: SECTION_LABELS[activeSection] }), _jsxs("span", { children: [filteredContracts.length, " registros"] })] }), _jsx("div", { className: "internal-contracts-toolbar", children: _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { value: query, onChange: (event) => setQuery(event.target.value), placeholder: "Contrato, cliente, colaborador, archivo o hito...", type: "search" })] }) }), _jsxs("div", { className: "internal-contracts-list", "aria-live": "polite", children: [loading ? _jsx("div", { className: "centered-inline-message", children: "Cargando contratos..." }) : null, !loading && filteredContracts.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "No hay contratos en esta seccion." })) : null, !loading && filteredContracts.map((contract) => (_jsxs("article", { className: "internal-contract-card", children: [_jsxs("div", { className: "internal-contract-card-head", children: [_jsxs("div", { children: [_jsx("span", { className: "internal-contract-number", children: contract.contractNumber }), _jsx("h3", { children: contractOwnerLabel(contract) })] }), _jsx("span", { className: "status-pill status-live", children: contract.documentKind === "ADDENDUM" ? "Addendum" : "Contrato" })] }), _jsxs("div", { className: "internal-contract-meta-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Archivo" }), _jsx("strong", { children: contract.originalFileName ?? "Sin archivo" }), _jsx("small", { children: formatFileSize(contract.fileSizeBytes) })] }), _jsxs("div", { children: [_jsx("span", { children: "Alta" }), _jsx("strong", { children: formatDate(contract.createdAt) }), _jsx("small", { children: contract.fileMimeType ?? "Tipo no registrado" })] })] }), contract.paymentMilestones.length > 0 ? (_jsx("ul", { className: "internal-contract-milestones", children: contract.paymentMilestones.map((milestone) => (_jsx("li", { children: formatMilestone(milestone) }, milestone.id))) })) : (_jsx("p", { className: "muted internal-contract-empty-milestones", children: "Sin hitos de pago capturados." })), contract.notes ? _jsx("p", { className: "internal-contract-notes", children: contract.notes }) : null, _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "secondary-button", type: "button", disabled: !contract.originalFileName || downloadingId === contract.id, onClick: () => void handleDownload(contract), children: downloadingId === contract.id ? "Descargando..." : "Descargar" }), canWrite ? (_jsx("button", { className: "danger-button", type: "button", disabled: deletingId === contract.id, onClick: () => void handleDelete(contract), children: deletingId === contract.id ? "Borrando..." : "Borrar" })) : null] })] }, contract.id)))] })] })] })] }));
}
