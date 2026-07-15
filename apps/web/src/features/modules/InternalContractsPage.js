import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiDownload, apiGet, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
const MODULE_TITLE = "Administraci\u00f3n de contratos internos";
const LABOR_FILE_CONTRACT_ID_PREFIX = "labor-file-document:";
const BUNDLED_CONTRACT_TEMPLATES = [
    {
        id: "bundled-work-contract-2026-07-08",
        title: "Contrato indvidual de trabajo (RC) (08.07.2026)",
        originalFileName: "Contrato indvidual de trabajo (RC) (08.07.2026).docx",
        fileMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSizeBytes: 36511,
        notes: "Machote base de empresa.",
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
        downloadUrl: "/internal-contract-templates/contrato-indvidual-trabajo-rc-2026-07-08.docx",
        isBundled: true
    },
    {
        id: "bundled-psp-contract-2026-07-08",
        title: "Contrato de prestaci\u00f3n de servicios profesionales (RC) (08.07.2026)",
        originalFileName: "Contrato de prestaci\u00f3n de servicios profesionales (RC) (08.07.2026).docx",
        fileMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSizeBytes: 117836,
        notes: "Machote base de empresa.",
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
        downloadUrl: "/internal-contract-templates/contrato-prestacion-servicios-profesionales-rc-2026-07-08.docx",
        isBundled: true
    },
    {
        id: "bundled-professional-services-contract-2026-07-13",
        title: "Professional services contract (RC) (13.07.26)",
        originalFileName: "Professional services contract (RC) (13.07.26).docx",
        fileMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSizeBytes: 110686,
        notes: "Machote base de empresa.",
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z",
        downloadUrl: "/internal-contract-templates/professional-services-contract-rc-2026-07-13.docx",
        isBundled: true
    },
    {
        id: "bundled-commercial-commission-contract-2026-05-22",
        title: "Contrato de comisi\u00f3n mercantil (22.05.2026)",
        originalFileName: "Contrato de comisi\u00f3n mercantil (22.05.2026).docx",
        fileMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSizeBytes: 120542,
        notes: "Machote base de empresa.",
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z",
        downloadUrl: "/internal-contract-templates/contrato-comision-mercantil-2026-05-22.docx",
        isBundled: true
    },
    {
        id: "bundled-joint-professional-services-contract-2026-06-19",
        title: "Contrato de prestaci\u00f3n de servicios profesionales conjuntos (19.06.2026)",
        originalFileName: "Contrato de prestaci\u00f3n de servicios profesionales conjuntos (19.06.2026).docx",
        fileMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSizeBytes: 129156,
        notes: "Machote base de empresa.",
        createdAt: "2026-06-19T00:00:00.000Z",
        updatedAt: "2026-06-19T00:00:00.000Z",
        downloadUrl: "/internal-contract-templates/contrato-prestacion-servicios-profesionales-conjuntos-2026-06-19.docx",
        isBundled: true
    }
];
const SECTION_LABELS = {
    PROFESSIONAL_SERVICES: "Contratos de prestaci\u00f3n de servicios profesionales",
    LEGAL_POLICIES: "P\u00f3lizas jur\u00eddicas",
    LABOR: "Contratos laborales",
    TEMPLATES: "Contratos machote"
};
const initialFormState = {
    contractNumber: "",
    contractTitle: "",
    templateTitle: "",
    clientId: "",
    collaboratorName: "",
    documentKind: "CONTRACT",
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
function groupClientContractsByClient(items) {
    const groups = new Map();
    sortContracts(items).forEach((contract) => {
        const key = `${contract.clientNumber ?? ""}|${contract.clientName ?? ""}`.toLowerCase();
        const label = contractOwnerLabel(contract);
        const existing = groups.get(key);
        if (existing) {
            existing.contracts.push(contract);
            return;
        }
        groups.set(key, {
            key,
            label,
            contracts: [contract]
        });
    });
    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label, "es-MX", { numeric: true, sensitivity: "base" }));
}
function sortContractTemplates(items) {
    return [...items].sort((left, right) => left.title.localeCompare(right.title, "es-MX", { numeric: true, sensitivity: "base" }));
}
function sortQuotes(items) {
    return [...items].sort((left, right) => left.quoteNumber.localeCompare(right.quoteNumber, "es-MX", { numeric: true, sensitivity: "base" }));
}
function quoteTitleLabel(quote) {
    return (quote?.title ?? quote?.subject ?? "").trim();
}
const REPLACED_BUNDLED_TEMPLATE_IDENTIFIERS = [
    {
        title: "Contrato de trabajo (18.05.2026)",
        originalFileName: "Contrato de trabajo (18.05.2026).docx"
    },
    {
        title: "Contrato de PSP (RC) (10.09.2024)",
        originalFileName: "Contrato de PSP (RC) (10.09.2024).docx"
    }
];
function isReplacedContractTemplate(template) {
    const title = normalizeSearchValue(template.title);
    const filename = normalizeSearchValue(template.originalFileName);
    return REPLACED_BUNDLED_TEMPLATE_IDENTIFIERS.some((identifier) => title === normalizeSearchValue(identifier.title)
        || filename === normalizeSearchValue(identifier.originalFileName));
}
function isClientContractSection(section) {
    return section === "PROFESSIONAL_SERVICES" || section === "LEGAL_POLICIES";
}
async function fetchOptionalRows(request) {
    try {
        return await request;
    }
    catch {
        return [];
    }
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
    if (isClientContractSection(contract.contractType)) {
        return [contract.clientNumber, contract.clientName].filter(Boolean).join(" - ") || "-";
    }
    return contract.collaboratorName ?? "-";
}
function isLaborFileBackedContract(contract) {
    return contract.id.startsWith(LABOR_FILE_CONTRACT_ID_PREFIX);
}
function isPdfFile(file) {
    return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
function getContractSignatureLabel(contract) {
    if (contract.signatureStatus === "SIGNED") {
        return "Firmado";
    }
    if (contract.sourceMatterId) {
        return "No firmado";
    }
    return null;
}
export function InternalContractsPage() {
    const { user } = useAuth();
    const [activeSection, setActiveSection] = useState("PROFESSIONAL_SERVICES");
    const [contracts, setContracts] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [clients, setClients] = useState([]);
    const [collaborators, setCollaborators] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [form, setForm] = useState(initialFormState);
    const [selectedFile, setSelectedFile] = useState(null);
    const [clientSearch, setClientSearch] = useState("");
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [flash, setFlash] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
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
                canReadContracts ? apiGet("/internal-contracts") : Promise.resolve([]),
                canReadTemplates ? apiGet("/internal-contracts/templates") : Promise.resolve([]),
                canWrite ? fetchOptionalRows(apiGet("/clients")) : Promise.resolve([]),
                canWrite ? fetchOptionalRows(apiGet("/internal-contracts/collaborators")) : Promise.resolve([]),
                canWrite ? fetchOptionalRows(apiGet("/quotes")) : Promise.resolve([])
            ]);
            setContracts(contractRows);
            setTemplates(templateRows);
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
    }, [canRead, canReadContracts, canReadTemplates, canWrite]);
    const visibleSections = useMemo(() => {
        const sections = [];
        if (canReadContracts) {
            sections.push("PROFESSIONAL_SERVICES", "LEGAL_POLICIES", "LABOR");
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
    const displayTemplates = useMemo(() => {
        const activeTemplates = templates.filter((template) => !isReplacedContractTemplate(template));
        const bundledTemplates = BUNDLED_CONTRACT_TEMPLATES.filter((bundledTemplate) => {
            const bundledTitle = normalizeSearchValue(bundledTemplate.title);
            const bundledFilename = normalizeSearchValue(bundledTemplate.originalFileName);
            return !activeTemplates.some((template) => {
                const title = normalizeSearchValue(template.title);
                const filename = normalizeSearchValue(template.originalFileName);
                return title === bundledTitle || filename === bundledFilename;
            });
        });
        return sortContractTemplates([...bundledTemplates, ...activeTemplates]);
    }, [templates]);
    const sectionCounts = useMemo(() => ({
        PROFESSIONAL_SERVICES: contracts.filter((contract) => contract.contractType === "PROFESSIONAL_SERVICES").length,
        LEGAL_POLICIES: contracts.filter((contract) => contract.contractType === "LEGAL_POLICIES").length,
        LABOR: contracts.filter((contract) => contract.contractType === "LABOR").length,
        TEMPLATES: displayTemplates.length
    }), [contracts, displayTemplates]);
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
                contract.title,
                contract.clientNumber,
                contract.clientName,
                contract.collaboratorName,
                contract.originalFileName,
                contract.notes
            ].filter(Boolean).join(" "));
            return haystack.includes(search);
        }));
    }, [activeSection, contracts, query]);
    const groupedClientContracts = useMemo(() => isClientContractSection(activeSection) ? groupClientContractsByClient(filteredContracts) : [], [activeSection, filteredContracts]);
    const filteredTemplates = useMemo(() => {
        const search = normalizeSearchValue(query);
        if (!search) {
            return displayTemplates;
        }
        return sortContractTemplates(displayTemplates.filter((template) => {
            const haystack = normalizeSearchValue([
                template.title,
                template.originalFileName,
                template.notes
            ].filter(Boolean).join(" "));
            return haystack.includes(search);
        }));
    }, [displayTemplates, query]);
    const selectedClientQuotes = useMemo(() => sortQuotes(quotes.filter((quote) => quote.clientId === form.clientId)), [form.clientId, quotes]);
    const selectedQuote = useMemo(() => selectedClientQuotes.find((quote) => quote.quoteNumber === form.contractNumber), [form.contractNumber, selectedClientQuotes]);
    const selectedQuoteTitle = quoteTitleLabel(selectedQuote);
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
    function updateForm(key, value) {
        setForm((current) => ({ ...current, [key]: value }));
        setFlash(null);
    }
    function handleSectionChange(section) {
        setActiveSection(section);
        setForm(initialFormState);
        setSelectedFile(null);
        setClientSearch("");
        setFlash(null);
    }
    function handleFileChange(event) {
        setSelectedFile(event.target.files?.[0] ?? null);
        setFlash(null);
    }
    function handleClientChange(clientId) {
        setForm((current) => ({ ...current, clientId, contractNumber: "", contractTitle: "" }));
        setFlash(null);
    }
    function handleContractNumberChange(contractNumber) {
        const quote = selectedClientQuotes.find((entry) => entry.quoteNumber === contractNumber);
        setForm((current) => ({
            ...current,
            contractNumber,
            contractTitle: quoteTitleLabel(quote)
        }));
        setFlash(null);
    }
    async function handleSubmit(event) {
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
                const created = await apiPost("/internal-contracts/templates", {
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
            }
            catch (error) {
                setFlash({ tone: "error", text: toErrorMessage(error) });
            }
            finally {
                setSaving(false);
            }
            return;
        }
        if (isClientContractSection(activeSection) && !form.clientId) {
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
            const created = await apiPost("/internal-contracts", {
                contractNumber,
                title: isClientContractSection(activeSection) ? form.contractTitle || selectedQuoteTitle : null,
                contractType: activeSection,
                documentKind: activeSection === "LABOR" ? form.documentKind : "CONTRACT",
                clientId: isClientContractSection(activeSection) ? form.clientId : null,
                collaboratorName: activeSection === "LABOR" ? form.collaboratorName : null,
                paymentMilestones: [],
                notes: form.notes,
                originalFileName: selectedFile.name,
                fileMimeType: selectedFile.type || "application/octet-stream",
                fileBase64: await fileToBase64(selectedFile)
            });
            setContracts((current) => [created, ...current.filter((entry) => entry.id !== created.id)]);
            setForm(initialFormState);
            setSelectedFile(null);
            setFlash({ tone: "success", text: `Contrato ${created.contractNumber} guardado correctamente.` });
            event.currentTarget.reset();
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSaving(false);
        }
    }
    async function handleDownload(contract, format) {
        const downloadKey = `${contract.id}:${format ?? "default"}`;
        setDownloadingId(downloadKey);
        setFlash(null);
        try {
            const query = format ? `?format=${format}` : "";
            const { blob, filename } = await apiDownload(`/internal-contracts/${encodeURIComponent(contract.id)}/document${query}`);
            downloadBlobFile(blob, filename ?? contract.originalFileName ?? `${contract.contractNumber}.bin`);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDownloadingId(null);
        }
    }
    async function handleTemplateDownload(template) {
        setDownloadingId(template.id);
        setFlash(null);
        try {
            if (template.downloadUrl) {
                const response = await fetch(template.downloadUrl);
                if (!response.ok) {
                    throw new Error("No se pudo descargar el machote.");
                }
                downloadBlobFile(await response.blob(), template.originalFileName);
                return;
            }
            const { blob, filename } = await apiDownload(`/internal-contracts/templates/${template.id}/document`);
            downloadBlobFile(blob, filename ?? template.originalFileName);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDownloadingId(null);
        }
    }
    async function handleDelete(contract) {
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
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDeletingId(null);
        }
    }
    async function handleTemplateDelete(template) {
        if (template.isBundled) {
            setFlash({ tone: "error", text: "Este machote base viene incluido en la plataforma y no se borra desde aqui." });
            return;
        }
        if (!window.confirm(`Seguro que deseas borrar el machote ${template.title}?`)) {
            return;
        }
        setDeletingId(template.id);
        setFlash(null);
        try {
            await apiDelete(`/internal-contracts/templates/${template.id}`);
            setTemplates((current) => current.filter((entry) => entry.id !== template.id));
            setFlash({ tone: "success", text: `Machote ${template.title} borrado.` });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDeletingId(null);
        }
    }
    function renderContractCard(contract) {
        const signatureLabel = getContractSignatureLabel(contract);
        const docxDownloadKey = `${contract.id}:docx`;
        const pdfDownloadKey = `${contract.id}:pdf`;
        const defaultDownloadKey = `${contract.id}:default`;
        const canDownloadDocx = contract.availableFormats.includes("docx");
        const canDownloadPdf = contract.availableFormats.includes("pdf");
        const canDownloadDefault = !canDownloadDocx && !canDownloadPdf && Boolean(contract.originalFileName);
        return (_jsxs("article", { className: "internal-contract-card", children: [_jsxs("div", { className: "internal-contract-card-head", children: [_jsxs("div", { children: [_jsx("span", { className: "internal-contract-number", children: contract.contractNumber }), _jsx("h3", { children: contractOwnerLabel(contract) }), contract.title ? _jsx("p", { className: "internal-contract-title", children: contract.title }) : null] }), _jsxs("div", { className: "internal-contract-card-tags", children: [_jsx("span", { className: "status-pill status-live", children: contract.contractType === "LEGAL_POLICIES"
                                        ? "P\u00f3liza"
                                        : contract.documentKind === "ADDENDUM"
                                            ? "Addendum"
                                            : "Contrato" }), signatureLabel ? (_jsx("span", { className: `status-pill ${contract.signatureStatus === "SIGNED" ? "status-live" : "status-warning"}`, children: signatureLabel })) : null, isLaborFileBackedContract(contract) ? (_jsx("span", { className: "status-pill status-migration", children: "Expediente laboral" })) : null] })] }), _jsxs("div", { className: "internal-contract-meta-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Archivo principal" }), _jsx("strong", { children: contract.originalFileName ?? "Sin archivo" }), _jsx("small", { children: formatFileSize(contract.fileSizeBytes) })] }), _jsxs("div", { children: [_jsx("span", { children: "Alta" }), _jsx("strong", { children: formatDate(contract.createdAt) })] }), canDownloadPdf ? (_jsxs("div", { children: [_jsx("span", { children: "Version PDF" }), _jsx("strong", { children: contract.pdfOriginalFileName ?? "PDF generado" })] })) : null] }), contract.notes ? _jsx("p", { className: "internal-contract-notes", children: contract.notes }) : null, _jsxs("div", { className: "table-actions", children: [canDownloadDocx ? (_jsx("button", { className: "secondary-button", type: "button", disabled: downloadingId === docxDownloadKey || downloadingId === defaultDownloadKey, onClick: () => void handleDownload(contract, contract.availableFormats.includes("docx") ? "docx" : undefined), children: downloadingId === docxDownloadKey || downloadingId === defaultDownloadKey ? "DOCX..." : "Descargar DOCX" })) : null, canDownloadPdf ? (_jsx("button", { className: "secondary-button", type: "button", disabled: downloadingId === pdfDownloadKey, onClick: () => void handleDownload(contract, "pdf"), children: downloadingId === pdfDownloadKey ? "PDF..." : "Descargar PDF" })) : null, canDownloadDefault ? (_jsx("button", { className: "secondary-button", type: "button", disabled: downloadingId === defaultDownloadKey, onClick: () => void handleDownload(contract), children: downloadingId === defaultDownloadKey ? "Descargando..." : "Descargar" })) : null, canWrite && !isLaborFileBackedContract(contract) ? (_jsx("button", { className: "danger-button", type: "button", disabled: deletingId === contract.id, onClick: () => void handleDelete(contract), children: deletingId === contract.id ? "Borrando..." : "Borrar" })) : null] })] }, contract.id));
    }
    if (!canRead) {
        return (_jsx("section", { className: "page-stack", children: _jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "module-hero-head", children: _jsx("div", { children: _jsx("h2", { children: MODULE_TITLE }) }) }), _jsx("p", { className: "muted", children: "Tu perfil actual no tiene permisos para consultar este modulo." })] }) }));
    }
    return (_jsxs("section", { className: "page-stack internal-contracts-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Contratos" }), _jsx("div", { children: _jsx("h2", { children: MODULE_TITLE }) })] }), _jsx("p", { className: "muted", children: "Control de contratos por cliente, p\\u00f3lizas jur\\u00eddicas, contratos laborales, addenda y machotes internos de Rusconii Consulting." })] }), _jsx("section", { className: "panel", children: _jsx("div", { className: "leads-tabs internal-contracts-tabs", role: "tablist", "aria-label": "Secciones de contratos internos", children: visibleSections.map((section) => (_jsxs("button", { type: "button", className: `lead-tab ${activeSection === section ? "is-active" : ""}`, onClick: () => handleSectionChange(section), children: [SECTION_LABELS[section], " (", sectionCounts[section], ")"] }, section))) }) }), flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsxs("section", { className: "internal-contracts-layout", children: [_jsxs("section", { className: "panel internal-contracts-form-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: isTemplateSection ? "Cargar machote" : "Cargar contrato" }), _jsx("span", { children: activeSection === "TEMPLATES"
                                            ? "Machotes de empresa"
                                            : activeSection === "LABOR"
                                                ? "Laboral / addendum"
                                                : activeSection === "LEGAL_POLICIES"
                                                    ? "P\u00f3lizas jur\u00eddicas"
                                                    : "Servicios profesionales" })] }), canSubmitActiveSection ? (_jsxs("form", { className: "internal-contracts-form", onSubmit: handleSubmit, children: [_jsxs("div", { className: "internal-contracts-form-grid", children: [activeSection === "TEMPLATES" ? (_jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Nombre del machote" }), _jsx("input", { value: form.templateTitle, onChange: (event) => updateForm("templateTitle", event.target.value), placeholder: "Ej. Contrato de prestacion de servicios", disabled: saving || loading })] })) : isClientContractSection(activeSection) ? (_jsxs(_Fragment, { children: [_jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Buscar cliente" }), _jsx("input", { value: clientSearch, onChange: (event) => setClientSearch(event.target.value), placeholder: "Escribe el nombre del cliente...", disabled: saving || loading })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Cliente" }), _jsxs("select", { value: form.clientId, onChange: (event) => handleClientChange(event.target.value), disabled: saving || loading, children: [_jsx("option", { value: "", children: "-- Seleccionar cliente --" }), filteredClients.map((client) => (_jsxs("option", { value: client.id, children: [client.clientNumber, " - ", client.name] }, client.id)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: activeSection === "LEGAL_POLICIES" ? "Numero de poliza" : "Numero de contrato" }), _jsxs("select", { value: form.contractNumber, onChange: (event) => handleContractNumberChange(event.target.value), disabled: saving || loading || !form.clientId || selectedClientQuotes.length === 0, children: [_jsx("option", { value: "", children: !form.clientId
                                                                            ? "-- Selecciona cliente primero --"
                                                                            : selectedClientQuotes.length === 0
                                                                                ? "-- Sin cotizaciones registradas --"
                                                                                : "-- Seleccionar cotizacion --" }), selectedClientQuotes.map((quote) => (_jsxs("option", { value: quote.quoteNumber, children: [quote.quoteNumber, " - ", quoteTitleLabel(quote)] }, quote.id)))] })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: activeSection === "LEGAL_POLICIES" ? "Titulo de la poliza" : "Titulo del contrato" }), _jsx("input", { value: form.contractTitle || selectedQuoteTitle, readOnly: true, placeholder: "Se llena al seleccionar una cotizacion" })] })] })) : (_jsxs(_Fragment, { children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Colaborador interno" }), _jsxs("select", { value: form.collaboratorName, onChange: (event) => updateForm("collaboratorName", event.target.value), disabled: saving || loading, children: [_jsx("option", { value: "", children: "-- Seleccionar colaborador --" }), collaborators.map((collaborator) => (_jsxs("option", { value: collaborator.name, children: [collaborator.shortName ? `${collaborator.shortName} - ` : "", collaborator.name] }, collaborator.id)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Tipo de documento" }), _jsxs("select", { value: form.documentKind, onChange: (event) => updateForm("documentKind", event.target.value), disabled: saving, children: [_jsx("option", { value: "CONTRACT", children: "Contrato laboral" }), _jsx("option", { value: "ADDENDUM", children: "Addendum" })] })] })] })), _jsxs("label", { className: "form-field internal-contracts-file-field", children: [_jsx("span", { children: "Archivo" }), _jsx("input", { type: "file", accept: activeSection === "LABOR" ? ".pdf,application/pdf" : ".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt", onChange: handleFileChange, disabled: saving })] }), _jsxs("label", { className: "form-field internal-contracts-wide-field", children: [_jsx("span", { children: "Notas" }), _jsx("textarea", { value: form.notes, onChange: (event) => updateForm("notes", event.target.value), placeholder: isTemplateSection ? "Notas internas sobre el uso del machote..." : "Observaciones internas del contrato...", disabled: saving })] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", type: "submit", disabled: saving || loading, children: saving ? "Cargando..." : isTemplateSection ? "Guardar machote" : "Guardar contrato" }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => void loadModule(), disabled: saving || loading, children: "Refrescar" })] })] })) : (_jsx("div", { className: "centered-inline-message", children: isTemplateSection
                                    ? "Tu perfil puede ver y descargar machotes, pero solo el superadmin puede cargar o borrar machotes."
                                    : "Tu perfil puede consultar contratos, pero no cargar nuevos archivos." }))] }), _jsxs("section", { className: "panel internal-contracts-list-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: SECTION_LABELS[activeSection] }), _jsxs("span", { children: [isTemplateSection ? filteredTemplates.length : filteredContracts.length, " registros"] })] }), _jsx("div", { className: "internal-contracts-toolbar", children: _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { value: query, onChange: (event) => setQuery(event.target.value), placeholder: isTemplateSection
                                                ? "Machote, archivo o notas..."
                                                : activeSection === "LABOR"
                                                    ? "Contrato, colaborador, expediente o archivo..."
                                                    : "Contrato, titulo, cliente, colaborador o archivo...", type: "search" })] }) }), _jsxs("div", { className: "internal-contracts-list", "aria-live": "polite", children: [loading ? (_jsx("div", { className: "centered-inline-message", children: isTemplateSection ? "Cargando machotes..." : "Cargando contratos..." })) : null, !loading && isTemplateSection && filteredTemplates.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "No hay machotes cargados." })) : null, !loading && !isTemplateSection && filteredContracts.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "No hay contratos en esta seccion." })) : null, !loading && isTemplateSection && filteredTemplates.map((template) => (_jsxs("article", { className: "internal-contract-card", children: [_jsxs("div", { className: "internal-contract-card-head", children: [_jsxs("div", { children: [_jsx("span", { className: "internal-contract-number", children: template.title }), _jsx("h3", { children: template.originalFileName })] }), _jsx("span", { className: "status-pill status-live", children: "Machote" })] }), _jsxs("div", { className: "internal-contract-meta-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Archivo" }), _jsx("strong", { children: template.originalFileName }), _jsx("small", { children: formatFileSize(template.fileSizeBytes) })] }), _jsxs("div", { children: [_jsx("span", { children: "Alta" }), _jsx("strong", { children: formatDate(template.createdAt) })] })] }), template.notes ? _jsx("p", { className: "internal-contract-notes", children: template.notes }) : null, _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "secondary-button", type: "button", disabled: downloadingId === template.id, onClick: () => void handleTemplateDownload(template), children: downloadingId === template.id ? "Descargando..." : "Descargar" }), canUploadTemplate && !template.isBundled ? (_jsx("button", { className: "danger-button", type: "button", disabled: deletingId === template.id, onClick: () => void handleTemplateDelete(template), children: deletingId === template.id ? "Borrando..." : "Borrar" })) : null] })] }, template.id))), !loading && !isTemplateSection && !isClientContractSection(activeSection) && filteredContracts.map((contract) => renderContractCard(contract)), !loading && isClientContractSection(activeSection) && groupedClientContracts.map((group) => (_jsxs("section", { className: "internal-contract-group", children: [_jsxs("div", { className: "internal-contract-group-head", children: [_jsx("h3", { children: group.label }), _jsxs("span", { children: [group.contracts.length, " contrato", group.contracts.length === 1 ? "" : "s"] })] }), _jsx("div", { className: "internal-contract-group-list", children: group.contracts.map((contract) => renderContractCard(contract)) })] }, group.key)))] })] })] })] }));
}
