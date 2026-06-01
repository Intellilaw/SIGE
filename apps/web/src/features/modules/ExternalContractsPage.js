import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canReadModule, canWriteModule } from "../auth/permissions";
const MODULE_TITLE = "Administraci\u00f3n de contratos externos";
const CONTRACT_SECTION_LABEL = "Contratos de arrendamiento";
const initialFormState = {
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
const formatTemplateLabels = {
    "rent-increase": "Formato de aumento de renta",
    "property-delivery": "Carta de entrega recepcion de inmueble",
    "termination-agreement": "Convenio de rescision"
};
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
function buildGeneratedFormat(contract, templateId, documentDate) {
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
    const [contracts, setContracts] = useState([]);
    const [clients, setClients] = useState([]);
    const [form, setForm] = useState(initialFormState);
    const [selectedFile, setSelectedFile] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [clientSearch, setClientSearch] = useState("");
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [fileInputKey, setFileInputKey] = useState(0);
    const [formatContractId, setFormatContractId] = useState("");
    const [formatTemplateId, setFormatTemplateId] = useState("rent-increase");
    const [formatDateValue, setFormatDateValue] = useState(dateInputValue(new Date()));
    const [flash, setFlash] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    async function loadModule() {
        setLoading(true);
        setErrorMessage(null);
        try {
            const [contractRows, clientRows] = await Promise.all([
                canRead ? apiGet("/external-contracts") : Promise.resolve([]),
                canWrite ? apiGet("/clients") : Promise.resolve([])
            ]);
            setContracts(contractRows);
            setClients(sortClients(clientRows));
            setFormatContractId((current) => current || contractRows[0]?.id || "");
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
    const selectedFormatContract = useMemo(() => contracts.find((contract) => contract.id === formatContractId) ?? contracts[0], [contracts, formatContractId]);
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
    const upcomingCount = contracts.filter((contract) => deadlineStatus(contract.renewalDate) === "soon" || deadlineStatus(contract.rentIncreaseDate) === "soon").length;
    function updateForm(key, value) {
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
    function handleFileChange(event) {
        setSelectedFile(event.target.files?.[0] ?? null);
        setFlash(null);
    }
    function startEdit(contract) {
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
                const updated = await apiPatch(`/external-contracts/${encodeURIComponent(editingId)}`, payload);
                setContracts((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
                setFlash({ tone: "success", text: `Contrato ${updated.contractNumber} actualizado.` });
            }
            else {
                const created = await apiPost("/external-contracts", payload);
                setContracts((current) => [created, ...current]);
                setFormatContractId((current) => current || created.id);
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
    function renderContractCard(contract) {
        const renewalTone = deadlineStatus(contract.renewalDate);
        const increaseTone = deadlineStatus(contract.rentIncreaseDate);
        return (_jsxs("article", { className: "internal-contract-card external-contract-card", children: [_jsxs("div", { className: "internal-contract-card-head", children: [_jsxs("div", { children: [_jsx("span", { className: "internal-contract-number", children: contract.contractNumber }), _jsx("h3", { children: contract.title }), _jsx("p", { className: "internal-contract-title", children: contract.propertyAddress || "Inmueble pendiente" })] }), _jsxs("div", { className: "internal-contract-card-tags", children: [_jsx("span", { className: `status-pill ${contract.status === "ACTIVE" ? "status-live" : "status-migration"}`, children: contract.status === "ACTIVE" ? "Activo" : "Archivado" }), _jsx("span", { className: "status-pill status-live", children: "Arrendamiento" })] })] }), _jsxs("div", { className: "internal-contract-meta-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Archivo principal" }), _jsx("strong", { children: contract.originalFileName ?? "Sin archivo" }), _jsx("small", { children: formatFileSize(contract.fileSizeBytes) })] }), _jsxs("div", { children: [_jsx("span", { children: "Vigencia" }), _jsxs("strong", { children: [formatDate(contract.leaseStartDate), " - ", formatDate(contract.leaseEndDate)] }), _jsxs("small", { children: [formatCurrency(contract.monthlyRentMxn), " renta mensual"] })] }), _jsxs("div", { children: [_jsx("span", { children: "Partes" }), _jsx("strong", { children: contract.landlordName || "Arrendador pendiente" }), _jsx("small", { children: contract.tenantName || "Arrendatario pendiente" })] })] }), _jsxs("div", { className: "external-contract-deadlines", children: [_jsxs("div", { className: `external-contract-deadline is-${renewalTone}`, children: [_jsx("span", { children: "Renovacion" }), _jsx("strong", { children: formatDate(contract.renewalDate) })] }), _jsxs("div", { className: `external-contract-deadline is-${increaseTone}`, children: [_jsx("span", { children: "Aumento de renta" }), _jsx("strong", { children: formatDate(contract.rentIncreaseDate) }), _jsx("small", { children: formatPercent(contract.rentIncreasePct) })] })] }), contract.notes ? _jsx("p", { className: "internal-contract-notes", children: contract.notes }) : null, _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "secondary-button", type: "button", disabled: downloadingId === contract.id, onClick: () => void handleDownload(contract), children: downloadingId === contract.id ? "Descargando..." : "Descargar" }), canWrite ? (_jsx("button", { className: "secondary-button", type: "button", onClick: () => startEdit(contract), children: "Modificar" })) : null, canWrite ? (_jsx("button", { className: "danger-button", type: "button", disabled: deletingId === contract.id, onClick: () => void handleDelete(contract), children: deletingId === contract.id ? "Borrando..." : "Borrar" })) : null] })] }, contract.id));
    }
    if (!canRead) {
        return (_jsx("section", { className: "page-stack", children: _jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "module-hero-head", children: _jsx("div", { children: _jsx("h2", { children: MODULE_TITLE }) }) }), _jsx("p", { className: "muted", children: "Tu perfil actual no tiene permisos para consultar este modulo." })] }) }));
    }
    return (_jsxs("section", { className: "page-stack internal-contracts-page external-contracts-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Contratos" }), _jsx("div", { children: _jsx("h2", { children: MODULE_TITLE }) })] }), _jsx("p", { className: "muted", children: "Control de contratos de clientes por empresa, organizados por cliente y con fechas clave de renovacion y aumento de renta." })] }), _jsx("section", { className: "panel", children: _jsxs("div", { className: "leads-tabs internal-contracts-tabs", role: "tablist", "aria-label": "Secciones de contratos externos", children: [_jsxs("button", { type: "button", className: "lead-tab is-active", children: [CONTRACT_SECTION_LABEL, " (", contracts.length, ")"] }), _jsxs("span", { className: "external-contracts-summary-pill", children: [activeCount, " activos"] }), _jsxs("span", { className: "external-contracts-summary-pill", children: [upcomingCount, " fechas proximas"] })] }) }), flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsxs("section", { className: "internal-contracts-layout", children: [_jsxs("section", { className: "panel internal-contracts-form-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: editingId ? "Modificar contrato" : "Cargar contrato" }), _jsx("span", { children: "Arrendamiento" })] }), canWrite ? (_jsxs("form", { className: "internal-contracts-form", onSubmit: handleSubmit, children: [_jsxs("div", { className: "internal-contracts-form-grid", children: [_jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Buscar cliente" }), _jsx("input", { value: clientSearch, onChange: (event) => setClientSearch(event.target.value), placeholder: "Escribe el nombre del cliente...", disabled: saving || loading })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Cliente" }), _jsxs("select", { value: form.clientId, onChange: (event) => updateForm("clientId", event.target.value), disabled: saving || loading, children: [_jsx("option", { value: "", children: "-- Seleccionar cliente --" }), filteredClients.map((client) => (_jsxs("option", { value: client.id, children: [client.clientNumber, " - ", client.name] }, client.id)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Numero de contrato" }), _jsx("input", { value: form.contractNumber, onChange: (event) => updateForm("contractNumber", event.target.value), placeholder: "Ej. ARR-CLIENTE-001", disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Estatus" }), _jsxs("select", { value: form.status, onChange: (event) => updateForm("status", event.target.value), disabled: saving, children: [_jsx("option", { value: "ACTIVE", children: "Activo" }), _jsx("option", { value: "ARCHIVED", children: "Archivado" })] })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Nombre del contrato" }), _jsx("input", { value: form.title, onChange: (event) => updateForm("title", event.target.value), placeholder: "Ej. Arrendamiento local comercial", disabled: saving })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Inmueble" }), _jsx("input", { value: form.propertyAddress, onChange: (event) => updateForm("propertyAddress", event.target.value), placeholder: "Domicilio o identificador del inmueble", disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Arrendador" }), _jsx("input", { value: form.landlordName, onChange: (event) => updateForm("landlordName", event.target.value), placeholder: "Nombre del arrendador", disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Arrendatario" }), _jsx("input", { value: form.tenantName, onChange: (event) => updateForm("tenantName", event.target.value), placeholder: "Nombre del arrendatario", disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Inicio de vigencia" }), _jsx("input", { type: "date", value: form.leaseStartDate, onChange: (event) => updateForm("leaseStartDate", event.target.value), disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fin de vigencia" }), _jsx("input", { type: "date", value: form.leaseEndDate, onChange: (event) => updateForm("leaseEndDate", event.target.value), disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de renovacion" }), _jsx("input", { type: "date", value: form.renewalDate, onChange: (event) => updateForm("renewalDate", event.target.value), disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de aumento de renta" }), _jsx("input", { type: "date", value: form.rentIncreaseDate, onChange: (event) => updateForm("rentIncreaseDate", event.target.value), disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Renta mensual" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: form.monthlyRentMxn, onChange: (event) => updateForm("monthlyRentMxn", event.target.value), placeholder: "0.00", disabled: saving })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "% aumento" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: form.rentIncreasePct, onChange: (event) => updateForm("rentIncreasePct", event.target.value), placeholder: "0", disabled: saving })] }), _jsxs("label", { className: "form-field internal-contracts-file-field", children: [_jsx("span", { children: editingId ? "Reemplazar archivo Word/PDF" : "Archivo Word/PDF" }), _jsx("input", { type: "file", accept: ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document", onChange: handleFileChange, disabled: saving }, fileInputKey)] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Notas" }), _jsx("textarea", { value: form.notes, onChange: (event) => updateForm("notes", event.target.value), placeholder: "Observaciones internas del contrato...", disabled: saving })] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", type: "submit", disabled: saving || loading, children: saving ? "Guardando..." : editingId ? "Guardar cambios" : "Guardar contrato" }), editingId ? (_jsx("button", { className: "secondary-button", type: "button", onClick: () => resetForm(), disabled: saving, children: "Cancelar edicion" })) : null, _jsx("button", { className: "secondary-button", type: "button", onClick: () => void loadModule(), disabled: saving || loading, children: "Refrescar" })] })] })) : (_jsx("div", { className: "centered-inline-message", children: "Tu perfil puede consultar contratos externos, pero no cargar nuevos archivos." })), _jsxs("div", { className: "external-contracts-format-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Generar formatos" }), _jsx("span", { children: "Arrendamiento" })] }), _jsxs("div", { className: "external-contracts-format-grid", children: [_jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Contrato base" }), _jsxs("select", { value: selectedFormatContract?.id ?? "", onChange: (event) => setFormatContractId(event.target.value), disabled: contracts.length === 0, children: [_jsx("option", { value: "", children: "-- Seleccionar contrato --" }), sortContracts(contracts).map((contract) => (_jsxs("option", { value: contract.id, children: [contract.contractNumber, " - ", contract.clientName] }, contract.id)))] })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Formato" }), _jsx("select", { value: formatTemplateId, onChange: (event) => setFormatTemplateId(event.target.value), disabled: contracts.length === 0, children: Object.keys(formatTemplateLabels).map((templateId) => (_jsx("option", { value: templateId, children: formatTemplateLabels[templateId] }, templateId))) })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Fecha del formato" }), _jsx("input", { type: "date", value: formatDateValue, onChange: (event) => setFormatDateValue(event.target.value), disabled: contracts.length === 0 })] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "secondary-button", type: "button", disabled: !selectedFormatContract, onClick: () => void handleFormatDownload("word"), children: "Descargar Word" }), _jsx("button", { className: "primary-button", type: "button", disabled: !selectedFormatContract, onClick: () => void handleFormatDownload("pdf"), children: "Descargar PDF" })] })] })] }), _jsxs("section", { className: "panel internal-contracts-list-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: CONTRACT_SECTION_LABEL }), _jsxs("span", { children: [filteredContracts.length, " registros"] })] }), _jsx("div", { className: "internal-contracts-toolbar", children: _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { value: query, onChange: (event) => setQuery(event.target.value), placeholder: "Contrato, cliente, inmueble, partes o archivo...", type: "search" })] }) }), _jsxs("div", { className: "internal-contracts-list", "aria-live": "polite", children: [loading ? _jsx("div", { className: "centered-inline-message", children: "Cargando contratos externos..." }) : null, !loading && filteredContracts.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "No hay contratos de arrendamiento cargados." })) : null, !loading && groupedContracts.map((group) => (_jsxs("section", { className: "internal-contract-group", children: [_jsxs("div", { className: "internal-contract-group-head", children: [_jsx("h3", { children: group.label }), _jsxs("span", { children: [group.contracts.length, " contrato", group.contracts.length === 1 ? "" : "s"] })] }), _jsx("div", { className: "internal-contract-group-list", children: group.contracts.map((contract) => renderContractCard(contract)) })] }, group.key)))] })] })] })] }));
}
