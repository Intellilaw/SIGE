import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canWriteModule } from "../auth/permissions";
const YEAR_OPTIONS = [2026, 2027, 2028, 2029, 2030, 2031];
const MONTH_NAMES = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre"
];
const XML_FORMATS = [
    { value: "CATALOGO", label: "Catalogo" },
    { value: "BALANZA", label: "Balanza" },
    { value: "POLIZAS", label: "Polizas" },
    { value: "AUXILIAR_CUENTAS", label: "Auxiliar cuentas" },
    { value: "AUXILIAR_FOLIOS", label: "Auxiliar folios" }
];
function getMonthName(month) {
    return MONTH_NAMES[month - 1] ?? `Mes ${month}`;
}
function formatCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2
    }).format(Number(value || 0));
}
function parseMoney(value) {
    const numeric = Number(value.replace(/[$,\s]/g, "") || 0);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}
function toErrorMessage(error) {
    return error instanceof Error && error.message ? error.message : "Ocurrio un error inesperado.";
}
function createLineDraft() {
    return {
        id: `line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        accountId: "",
        description: "",
        debitMxn: "",
        creditMxn: ""
    };
}
async function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result ?? "");
            resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
        };
        reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo."));
        reader.readAsDataURL(file);
    });
}
function downloadXml(result) {
    const blob = new Blob([result.content], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.fileName;
    link.click();
    URL.revokeObjectURL(url);
}
function getActiveAccounts(accounts) {
    return accounts.filter((account) => account.isActive);
}
function getCatalogActionLabel(action) {
    if (action === "CREATE") {
        return "Crear";
    }
    if (action === "UPDATE") {
        return "Actualizar";
    }
    if (action === "UNCHANGED") {
        return "Sin cambios";
    }
    return "Error";
}
export function AccountingPage() {
    const { user } = useAuth();
    const now = new Date();
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
    const [activeTab, setActiveTab] = useState("summary");
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [settingsDraft, setSettingsDraft] = useState({ companyRfc: "", legalName: "" });
    const [accountDraft, setAccountDraft] = useState({
        code: "",
        name: "",
        type: "ASSET",
        nature: "DEBIT",
        satGroupingCode: ""
    });
    const [catalogVisibility, setCatalogVisibility] = useState("ACTIVE");
    const [replaceActiveCatalog, setReplaceActiveCatalog] = useState(false);
    const [catalogXmlPayload, setCatalogXmlPayload] = useState(null);
    const [catalogXmlPreview, setCatalogXmlPreview] = useState(null);
    const [openingDraft, setOpeningDraft] = useState({
        accountId: "",
        debitMxn: "",
        creditMxn: ""
    });
    const [entryDraft, setEntryDraft] = useState({
        entryDate: `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`,
        description: "",
        lines: [createLineDraft(), createLineDraft()]
    });
    const canWrite = canWriteModule(user, "accounting");
    async function loadOverview() {
        setLoading(true);
        setErrorMessage(null);
        try {
            const response = await apiGet(`/accounting/overview?year=${selectedYear}&month=${selectedMonth}`);
            setOverview(response);
            setSettingsDraft({
                companyRfc: response.settings.companyRfc ?? "",
                legalName: response.settings.legalName ?? ""
            });
            if (!openingDraft.accountId && response.accounts.length > 0) {
                setOpeningDraft((current) => ({ ...current, accountId: response.accounts[0].id }));
            }
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadOverview();
    }, [selectedMonth, selectedYear]);
    useEffect(() => {
        setEntryDraft((current) => ({
            ...current,
            entryDate: `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`
        }));
    }, [selectedMonth, selectedYear]);
    async function runAction(action, successMessage) {
        if (!canWrite) {
            return;
        }
        setBusy(true);
        setErrorMessage(null);
        setMessage(null);
        try {
            await action();
            setMessage(successMessage);
            await loadOverview();
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setBusy(false);
        }
    }
    async function saveSettings() {
        await runAction(async () => {
            await apiPatch("/accounting/settings", settingsDraft);
        }, "Configuracion contable guardada.");
    }
    async function initializeCatalog() {
        await runAction(async () => {
            await apiPost("/accounting/catalog/standard", {});
        }, "Catalogo estandar inicializado.");
    }
    async function previewCatalogXml(files) {
        if (!canWrite || !files || files.length === 0) {
            return;
        }
        const file = files[0];
        setBusy(true);
        setErrorMessage(null);
        setMessage(null);
        try {
            const xmlBase64 = await readFileAsBase64(file);
            const result = await apiPost("/accounting/catalog/xml/preview", {
                originalFileName: file.name,
                xmlBase64,
                replaceActiveCatalog
            });
            setCatalogXmlPayload({ originalFileName: file.name, xmlBase64 });
            setCatalogXmlPreview(result);
            setMessage(`Vista previa lista: ${result.summary.create} nuevas, ${result.summary.update} por actualizar, ${result.summary.errors} con error.`);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setBusy(false);
        }
    }
    async function importCatalogXml() {
        if (!canWrite || !catalogXmlPayload || !catalogXmlPreview) {
            return;
        }
        setBusy(true);
        setErrorMessage(null);
        setMessage(null);
        try {
            const result = await apiPost("/accounting/catalog/xml/import", {
                ...catalogXmlPayload,
                replaceActiveCatalog,
                confirm: true
            });
            setCatalogXmlPayload(null);
            setCatalogXmlPreview(null);
            setMessage(`Catalogo importado: ${result.preview.summary.create} creadas, ${result.preview.summary.update} actualizadas, ${result.deactivated} desactivadas.`);
            await loadOverview();
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setBusy(false);
        }
    }
    async function createAccount() {
        await runAction(async () => {
            await apiPost("/accounting/accounts", {
                ...accountDraft,
                subtype: accountDraft.subtype || null,
                satGroupingCode: accountDraft.satGroupingCode || null,
                parentId: accountDraft.parentId || null
            });
            setAccountDraft({ code: "", name: "", type: "ASSET", nature: "DEBIT", satGroupingCode: "" });
        }, "Cuenta creada.");
    }
    async function createOpeningBalance() {
        await runAction(async () => {
            await apiPost("/accounting/opening-balances", {
                year: selectedYear,
                accountId: openingDraft.accountId,
                debitMxn: parseMoney(openingDraft.debitMxn),
                creditMxn: parseMoney(openingDraft.creditMxn)
            });
            setOpeningDraft((current) => ({ ...current, debitMxn: "", creditMxn: "" }));
        }, "Saldo inicial registrado.");
    }
    async function createManualEntry() {
        const lines = entryDraft.lines
            .map((line) => ({
            accountId: line.accountId,
            description: line.description,
            debitMxn: parseMoney(line.debitMxn),
            creditMxn: parseMoney(line.creditMxn)
        }))
            .filter((line) => line.accountId && (line.debitMxn > 0 || line.creditMxn > 0));
        await runAction(async () => {
            await apiPost("/accounting/journal-entries", {
                year: selectedYear,
                month: selectedMonth,
                entryDate: entryDraft.entryDate,
                entryType: "MANUAL",
                description: entryDraft.description,
                lines
            });
            setEntryDraft({
                entryDate: `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`,
                description: "",
                lines: [createLineDraft(), createLineDraft()]
            });
        }, "Poliza manual creada.");
    }
    async function uploadCfdiFiles(files) {
        if (!files || files.length === 0) {
            return;
        }
        await runAction(async () => {
            const payload = await Promise.all(Array.from(files).map(async (file) => ({
                originalFileName: file.name,
                xmlBase64: await readFileAsBase64(file)
            })));
            const result = await apiPost("/accounting/cfdi/upload", { files: payload });
            setMessage(`CFDI importados: ${result.imported.length}. Duplicados: ${result.duplicates.length}. Errores: ${result.errors.length}.`);
        }, "Carga masiva procesada.");
    }
    async function generateAutomaticEntries() {
        await runAction(async () => {
            const result = await apiPost("/accounting/generate-automatic", {
                year: selectedYear,
                month: selectedMonth
            });
            setMessage(`Polizas generadas: ${result.created.length}. Pendientes: ${result.skipped.length}.`);
        }, "Generacion automatica terminada.");
    }
    async function exportXml(format) {
        await runAction(async () => {
            const result = await apiPost("/accounting/sat-xml", {
                year: selectedYear,
                month: selectedMonth,
                format
            });
            downloadXml(result);
        }, "XML generado.");
    }
    function updateEntryLine(lineId, patch) {
        setEntryDraft((current) => ({
            ...current,
            lines: current.lines.map((line) => line.id === lineId ? { ...line, ...patch } : line)
        }));
    }
    const accounts = useMemo(() => getActiveAccounts(overview?.accounts ?? []), [overview]);
    const catalogAccounts = useMemo(() => {
        const allAccounts = overview?.accounts ?? [];
        if (catalogVisibility === "ACTIVE") {
            return allAccounts.filter((account) => account.isActive);
        }
        if (catalogVisibility === "INACTIVE") {
            return allAccounts.filter((account) => !account.isActive);
        }
        if (catalogVisibility === "MISSING_SAT") {
            return allAccounts.filter((account) => account.isActive && !account.satGroupingCode);
        }
        return allAccounts;
    }, [catalogVisibility, overview]);
    const catalogStats = useMemo(() => {
        const allAccounts = overview?.accounts ?? [];
        return {
            total: allAccounts.length,
            active: allAccounts.filter((account) => account.isActive).length,
            inactive: allAccounts.filter((account) => !account.isActive).length,
            missingSat: allAccounts.filter((account) => account.isActive && !account.satGroupingCode).length
        };
    }, [overview]);
    const pendingBySeverity = useMemo(() => {
        const pending = overview?.pendingItems ?? [];
        return {
            errors: pending.filter((item) => item.severity === "ERROR").length,
            warnings: pending.filter((item) => item.severity === "WARNING").length,
            info: pending.filter((item) => item.severity === "INFO").length
        };
    }, [overview]);
    return (_jsxs("section", { className: "page-stack accounting-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\u{1F9FE}" }), _jsx("div", { children: _jsx("h2", { children: "Contabilidad" }) })] }), _jsx("p", { className: "muted", children: "Catalogo, polizas, CFDI, auxiliares, balanza y XML SAT por empresa." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, message ? _jsx("div", { className: "message-banner message-success", children: message }) : null, _jsx("section", { className: "panel", children: _jsxs("div", { className: "finance-toolbar", children: [_jsxs("div", { className: "finance-toolbar-group", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Ano" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: YEAR_OPTIONS.map((year) => _jsx("option", { value: year, children: year }, year)) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (_jsx("option", { value: month, children: getMonthName(month) }, month))) })] })] }), _jsxs("div", { className: "accounting-toolbar-actions", children: [_jsx("button", { className: "secondary-button", type: "button", onClick: () => void loadOverview(), disabled: loading || busy, children: "Actualizar" }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void generateAutomaticEntries(), disabled: !canWrite || busy, children: "Generar automaticas" })] })] }) }), _jsx("section", { className: "panel finance-tabs-panel", children: _jsx("div", { className: "finance-tabs", children: [
                        ["summary", "Resumen"],
                        ["catalog", "Catalogo"],
                        ["entries", "Polizas"],
                        ["cfdi", "CFDI"],
                        ["reports", "Reportes"],
                        ["sat", "XML SAT"]
                    ].map(([tab, label]) => (_jsx("button", { className: `finance-tab ${activeTab === tab ? "is-active" : ""}`, type: "button", onClick: () => setActiveTab(tab), children: label }, tab))) }) }), loading || !overview ? (_jsx("section", { className: "panel", children: _jsx("p", { className: "muted", children: "Cargando contabilidad..." }) })) : null, !loading && overview && activeTab === "summary" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "accounting-metric-grid", children: [_jsxs("article", { className: "accounting-metric", children: [_jsx("span", { children: "Activos" }), _jsx("strong", { children: formatCurrency(overview.totals.assetsMxn) })] }), _jsxs("article", { className: "accounting-metric", children: [_jsx("span", { children: "Pasivos" }), _jsx("strong", { children: formatCurrency(overview.totals.liabilitiesMxn) })] }), _jsxs("article", { className: "accounting-metric", children: [_jsx("span", { children: "Capital" }), _jsx("strong", { children: formatCurrency(overview.totals.equityMxn) })] }), _jsxs("article", { className: "accounting-metric", children: [_jsx("span", { children: "Resultado" }), _jsx("strong", { children: formatCurrency(overview.totals.netIncomeMxn) })] })] }), _jsxs("section", { className: "accounting-grid-two", children: [_jsxs("article", { className: "panel accounting-compact-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Configuracion fiscal" }), _jsx("span", { children: overview.settings.companyRfc ? "Lista" : "Pendiente" })] }), _jsxs("div", { className: "accounting-form-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "RFC empresa" }), _jsx("input", { value: settingsDraft.companyRfc, onChange: (event) => setSettingsDraft((current) => ({ ...current, companyRfc: event.target.value })), disabled: !canWrite || busy })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Razon social" }), _jsx("input", { value: settingsDraft.legalName, onChange: (event) => setSettingsDraft((current) => ({ ...current, legalName: event.target.value })), disabled: !canWrite || busy })] })] }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void saveSettings(), disabled: !canWrite || busy, children: "Guardar configuracion" })] }), _jsxs("article", { className: "panel accounting-compact-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Pendientes" }), _jsx("span", { children: overview.pendingItems.length })] }), _jsxs("div", { className: "accounting-pending-summary", children: [_jsx("strong", { children: pendingBySeverity.errors }), _jsx("span", { children: "Errores" }), _jsx("strong", { children: pendingBySeverity.warnings }), _jsx("span", { children: "Alertas" }), _jsx("strong", { children: pendingBySeverity.info }), _jsx("span", { children: "Informativos" })] }), _jsxs("div", { className: "accounting-pending-list", children: [overview.pendingItems.slice(0, 8).map((item) => (_jsxs("div", { className: `accounting-pending-item tone-${item.severity.toLowerCase()}`, children: [_jsx("strong", { children: item.label }), _jsx("span", { children: item.detail })] }, item.id))), overview.pendingItems.length === 0 ? _jsx("p", { className: "muted", children: "Sin pendientes para el periodo." }) : null] })] })] })] })) : null, !loading && overview && activeTab === "catalog" ? (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Catalogo de cuentas" }), _jsxs("div", { className: "accounting-catalog-actions", children: [_jsxs("label", { className: "accounting-inline-checkbox", children: [_jsx("input", { type: "checkbox", checked: replaceActiveCatalog, onChange: (event) => {
                                                    setReplaceActiveCatalog(event.target.checked);
                                                    setCatalogXmlPreview(null);
                                                    setCatalogXmlPayload(null);
                                                }, disabled: !canWrite || busy || Boolean(catalogXmlPreview) }), _jsx("span", { children: "Reemplazar activos" })] }), _jsxs("label", { className: "secondary-button accounting-file-button", children: ["Cargar XML", _jsx("input", { type: "file", accept: ".xml,text/xml,application/xml", onChange: (event) => {
                                                    void previewCatalogXml(event.target.files);
                                                    event.target.value = "";
                                                }, disabled: !canWrite || busy })] }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => void initializeCatalog(), disabled: !canWrite || busy, children: "Inicializar estandar" })] })] }), _jsxs("div", { className: "accounting-catalog-toolbar", children: [_jsxs("div", { className: "accounting-catalog-stats", children: [_jsxs("span", { children: [_jsx("strong", { children: catalogStats.active }), " Activas"] }), _jsxs("span", { children: [_jsx("strong", { children: catalogStats.inactive }), " Inactivas"] }), _jsxs("span", { children: [_jsx("strong", { children: catalogStats.missingSat }), " Sin SAT"] }), _jsxs("span", { children: [_jsx("strong", { children: catalogStats.total }), " Total"] })] }), _jsx("div", { className: "accounting-filter-tabs", children: [
                                    ["ACTIVE", "Activas"],
                                    ["ALL", "Todas"],
                                    ["INACTIVE", "Inactivas"],
                                    ["MISSING_SAT", "Sin SAT"]
                                ].map(([value, label]) => (_jsx("button", { className: `accounting-filter-tab ${catalogVisibility === value ? "is-active" : ""}`, type: "button", onClick: () => setCatalogVisibility(value), children: label }, value))) })] }), _jsxs("div", { className: "accounting-form-grid accounting-form-grid-wide", children: [_jsx("input", { placeholder: "Codigo", value: accountDraft.code, onChange: (event) => setAccountDraft((current) => ({ ...current, code: event.target.value })), disabled: !canWrite || busy }), _jsx("input", { placeholder: "Nombre", value: accountDraft.name, onChange: (event) => setAccountDraft((current) => ({ ...current, name: event.target.value })), disabled: !canWrite || busy }), _jsxs("select", { value: accountDraft.type, onChange: (event) => setAccountDraft((current) => ({ ...current, type: event.target.value })), disabled: !canWrite || busy, children: [_jsx("option", { value: "ASSET", children: "Activo" }), _jsx("option", { value: "LIABILITY", children: "Pasivo" }), _jsx("option", { value: "EQUITY", children: "Capital" }), _jsx("option", { value: "INCOME", children: "Ingresos" }), _jsx("option", { value: "COST", children: "Costos" }), _jsx("option", { value: "EXPENSE", children: "Gastos" })] }), _jsx("input", { placeholder: "Codigo agrupador SAT", value: accountDraft.satGroupingCode ?? "", onChange: (event) => setAccountDraft((current) => ({ ...current, satGroupingCode: event.target.value })), disabled: !canWrite || busy }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void createAccount(), disabled: !canWrite || busy, children: "Crear cuenta" })] }), catalogXmlPreview ? (_jsxs("div", { className: "accounting-preview-block", children: [_jsxs("div", { className: "accounting-preview-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Vista previa XML" }), _jsx("span", { children: catalogXmlPreview.originalFileName })] }), _jsxs("div", { className: "accounting-preview-actions", children: [_jsx("button", { className: "secondary-button", type: "button", onClick: () => {
                                                    setCatalogXmlPreview(null);
                                                    setCatalogXmlPayload(null);
                                                }, disabled: busy, children: "Cancelar" }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void importCatalogXml(), disabled: !canWrite || busy || catalogXmlPreview.summary.errors > 0, children: "Confirmar importacion" })] })] }), _jsxs("div", { className: "accounting-preview-summary", children: [_jsxs("span", { children: [_jsx("strong", { children: catalogXmlPreview.summary.create }), " Crear"] }), _jsxs("span", { children: [_jsx("strong", { children: catalogXmlPreview.summary.update }), " Actualizar"] }), _jsxs("span", { children: [_jsx("strong", { children: catalogXmlPreview.summary.unchanged }), " Sin cambios"] }), _jsxs("span", { className: catalogXmlPreview.summary.errors > 0 ? "is-danger" : "", children: [_jsx("strong", { children: catalogXmlPreview.summary.errors }), " Errores"] })] }), _jsx("div", { className: "accounting-table-wrap", children: _jsxs("table", { className: "data-table accounting-table accounting-preview-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Accion" }), _jsx("th", { children: "Cuenta" }), _jsx("th", { children: "Nombre" }), _jsx("th", { children: "SAT" }), _jsx("th", { children: "Padre" }), _jsx("th", { children: "Detalle" })] }) }), _jsx("tbody", { children: catalogXmlPreview.accounts.map((account, index) => (_jsxs("tr", { className: account.action === "ERROR" ? "accounting-preview-error-row" : undefined, children: [_jsx("td", { children: getCatalogActionLabel(account.action) }), _jsx("td", { children: account.code || "-" }), _jsx("td", { children: account.name || "-" }), _jsx("td", { children: account.satGroupingCode ?? "-" }), _jsx("td", { children: account.parentCode ?? "-" }), _jsx("td", { children: account.error ?? `${account.level} / ${account.nature === "DEBIT" ? "Deudora" : "Acreedora"}` })] }, `${account.code || "sin-codigo"}-${index}`))) })] }) })] })) : null, _jsx("div", { className: "accounting-table-wrap", children: _jsxs("table", { className: "data-table accounting-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cuenta" }), _jsx("th", { children: "Nombre" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "SAT" }), _jsx("th", { children: "Naturaleza" }), _jsx("th", { children: "Estado" })] }) }), _jsxs("tbody", { children: [catalogAccounts.map((account) => (_jsxs("tr", { children: [_jsx("td", { children: account.code }), _jsx("td", { children: account.name }), _jsx("td", { children: account.type }), _jsx("td", { children: account.satGroupingCode ?? "-" }), _jsx("td", { children: account.nature === "DEBIT" ? "Deudora" : "Acreedora" }), _jsx("td", { children: account.isActive ? "Activa" : "Inactiva" })] }, account.id))), catalogAccounts.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "muted", children: "Sin cuentas para este filtro." }) })) : null] })] }) })] })) : null, !loading && overview && activeTab === "entries" ? (_jsxs("section", { className: "accounting-grid-two accounting-grid-two-wide", children: [_jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Saldos iniciales" }), _jsx("span", { children: "Poliza de apertura" })] }), _jsxs("div", { className: "accounting-form-grid", children: [_jsx("select", { value: openingDraft.accountId, onChange: (event) => setOpeningDraft((current) => ({ ...current, accountId: event.target.value })), disabled: !canWrite || busy, children: accounts.map((account) => _jsxs("option", { value: account.id, children: [account.code, " ", account.name] }, account.id)) }), _jsx("input", { placeholder: "Cargo", value: openingDraft.debitMxn, onChange: (event) => setOpeningDraft((current) => ({ ...current, debitMxn: event.target.value })), disabled: !canWrite || busy }), _jsx("input", { placeholder: "Abono", value: openingDraft.creditMxn, onChange: (event) => setOpeningDraft((current) => ({ ...current, creditMxn: event.target.value })), disabled: !canWrite || busy }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void createOpeningBalance(), disabled: !canWrite || busy, children: "Registrar saldo" })] })] }), _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Poliza manual" }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => setEntryDraft((current) => ({ ...current, lines: [...current.lines, createLineDraft()] })), disabled: !canWrite || busy, children: "Agregar linea" })] }), _jsxs("div", { className: "accounting-form-grid", children: [_jsx("input", { type: "date", value: entryDraft.entryDate, onChange: (event) => setEntryDraft((current) => ({ ...current, entryDate: event.target.value })), disabled: !canWrite || busy }), _jsx("input", { placeholder: "Concepto", value: entryDraft.description, onChange: (event) => setEntryDraft((current) => ({ ...current, description: event.target.value })), disabled: !canWrite || busy })] }), _jsx("div", { className: "accounting-entry-lines", children: entryDraft.lines.map((line) => (_jsxs("div", { className: "accounting-entry-line", children: [_jsxs("select", { value: line.accountId, onChange: (event) => updateEntryLine(line.id, { accountId: event.target.value }), disabled: !canWrite || busy, children: [_jsx("option", { value: "", children: "Cuenta" }), accounts.map((account) => _jsxs("option", { value: account.id, children: [account.code, " ", account.name] }, account.id))] }), _jsx("input", { placeholder: "Descripcion", value: line.description, onChange: (event) => updateEntryLine(line.id, { description: event.target.value }), disabled: !canWrite || busy }), _jsx("input", { placeholder: "Cargo", value: line.debitMxn, onChange: (event) => updateEntryLine(line.id, { debitMxn: event.target.value }), disabled: !canWrite || busy }), _jsx("input", { placeholder: "Abono", value: line.creditMxn, onChange: (event) => updateEntryLine(line.id, { creditMxn: event.target.value }), disabled: !canWrite || busy })] }, line.id))) }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void createManualEntry(), disabled: !canWrite || busy, children: "Guardar poliza" })] }), _jsxs("article", { className: "panel accounting-span-two", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("h2", { children: ["Polizas de ", getMonthName(selectedMonth), " ", selectedYear] }), _jsx("span", { children: overview.entries.length })] }), _jsx("div", { className: "accounting-table-wrap", children: _jsxs("table", { className: "data-table accounting-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Numero" }), _jsx("th", { children: "Fecha" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Concepto" }), _jsx("th", { children: "Cargos" }), _jsx("th", { children: "Abonos" })] }) }), _jsx("tbody", { children: overview.entries.map((entry) => (_jsxs("tr", { children: [_jsx("td", { children: entry.number }), _jsx("td", { children: entry.entryDate }), _jsx("td", { children: entry.entryType }), _jsx("td", { children: entry.description }), _jsx("td", { children: formatCurrency(entry.totalDebitMxn) }), _jsx("td", { children: formatCurrency(entry.totalCreditMxn) })] }, entry.id))) })] }) })] })] })) : null, !loading && overview && activeTab === "cfdi" ? (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "CFDI cargados" }), _jsxs("label", { className: "secondary-button accounting-file-button", children: ["Cargar XML", _jsx("input", { type: "file", accept: ".xml,text/xml,application/xml", multiple: true, onChange: (event) => void uploadCfdiFiles(event.target.files), disabled: !canWrite || busy })] })] }), _jsx("div", { className: "accounting-table-wrap", children: _jsxs("table", { className: "data-table accounting-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "UUID" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Emisor" }), _jsx("th", { children: "Receptor" }), _jsx("th", { children: "Total" }), _jsx("th", { children: "Estado" })] }) }), _jsx("tbody", { children: overview.cfdiDocuments.map((document) => (_jsxs("tr", { children: [_jsx("td", { children: document.uuid }), _jsx("td", { children: document.type }), _jsx("td", { children: document.issuerRfc }), _jsx("td", { children: document.receiverRfc }), _jsx("td", { children: formatCurrency(document.totalMxn) }), _jsx("td", { children: document.status })] }, document.id))) })] }) })] })) : null, !loading && overview && activeTab === "reports" ? (_jsxs("section", { className: "accounting-grid-two accounting-grid-two-wide", children: [_jsxs("article", { className: "panel accounting-span-two", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Balanza de comprobacion" }), _jsxs("span", { children: [getMonthName(selectedMonth), " ", selectedYear] })] }), _jsx("div", { className: "accounting-table-wrap", children: _jsxs("table", { className: "data-table accounting-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cuenta" }), _jsx("th", { children: "Inicial debe" }), _jsx("th", { children: "Inicial haber" }), _jsx("th", { children: "Debe" }), _jsx("th", { children: "Haber" }), _jsx("th", { children: "Final debe" }), _jsx("th", { children: "Final haber" })] }) }), _jsx("tbody", { children: overview.trialBalance.map((line) => (_jsxs("tr", { children: [_jsxs("td", { children: [line.accountCode, " ", line.accountName] }), _jsx("td", { children: formatCurrency(line.openingDebitMxn) }), _jsx("td", { children: formatCurrency(line.openingCreditMxn) }), _jsx("td", { children: formatCurrency(line.periodDebitMxn) }), _jsx("td", { children: formatCurrency(line.periodCreditMxn) }), _jsx("td", { children: formatCurrency(line.endingDebitMxn) }), _jsx("td", { children: formatCurrency(line.endingCreditMxn) })] }, line.accountId))) })] }) })] }), _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Balance general" }), _jsx("span", { children: formatCurrency(overview.totals.assetsMxn) })] }), overview.balanceSheet.map((line) => (_jsxs("div", { className: "accounting-report-line", children: [_jsxs("span", { children: [line.accountCode, " ", line.accountName] }), _jsx("strong", { children: formatCurrency(line.amountMxn) })] }, line.accountId)))] }), _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Estado de resultados" }), _jsx("span", { children: formatCurrency(overview.totals.netIncomeMxn) })] }), overview.incomeStatement.map((line) => (_jsxs("div", { className: "accounting-report-line", children: [_jsxs("span", { children: [line.accountCode, " ", line.accountName] }), _jsx("strong", { children: formatCurrency(line.amountMxn) })] }, line.accountId)))] })] })) : null, !loading && overview && activeTab === "sat" ? (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "XML SAT" }), _jsx("span", { children: overview.period.requiresRegeneration ? "Requiere regeneracion" : "Sin cambios pendientes" })] }), _jsx("div", { className: "accounting-xml-grid", children: XML_FORMATS.map((format) => (_jsx("button", { className: "secondary-button", type: "button", onClick: () => void exportXml(format.value), disabled: !canWrite || busy, children: format.label }, format.value))) })] })) : null] }));
}
