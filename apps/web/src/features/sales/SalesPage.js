import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { LEGALFLOW_SALES_PRODUCTS } from "@sige/contracts";
import intellilawPldLogo from "../../assets/legalflow-intellilaw-pld-logo.png";
import minkaLogo from "../../assets/legalflow-minka-logo.png";
import rematesLogo from "../../assets/legalflow-subastas-logo.png";
import startLogo from "../../assets/start-logo.jpg";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
const STATIC_SALES_PRODUCT_LOGOS = {
    start: startLogo,
    pld: intellilawPldLogo,
    remates: rematesLogo,
    minka: minkaLogo
};
const DEFAULT_SALES_PRODUCTS = LEGALFLOW_SALES_PRODUCTS.map(attachProductLogo);
const SALES_TIMEFRAMES = [
    { id: "anteriores", label: "Tareas realizadas", colorClass: "is-past" },
    { id: "hoy", label: "Tareas hoy", colorClass: "is-today" },
    { id: "manana", label: "Tareas manana", colorClass: "is-tomorrow" },
    { id: "posteriores", label: "Tareas posteriores", colorClass: "is-future" }
];
const DEFAULT_PRODUCT_FORM = {
    name: "",
    tagline: "",
    accentColor: "#2563eb",
    defaultStrategy: "",
    defaultDailyReport: "",
    logoFile: null
};
const SAVE_DEBOUNCE_MS = 650;
function attachProductLogo(product) {
    return {
        ...product,
        logoSrc: product.logoDataUrl ?? STATIC_SALES_PRODUCT_LOGOS[product.id]
    };
}
function buildProductLookup(products) {
    return products.reduce((lookup, product) => {
        lookup[product.id] = product;
        return lookup;
    }, {});
}
function buildEmptyDailyReportStore(products = DEFAULT_SALES_PRODUCTS) {
    return products.reduce((store, product) => {
        store[product.id] = {};
        return store;
    }, {});
}
function normalizeOverview(overview) {
    return {
        ...overview,
        archivedProducts: overview.archivedProducts ?? [],
        dailyReports: {
            ...buildEmptyDailyReportStore(overview.products),
            ...overview.dailyReports
        }
    };
}
function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("No se pudo leer el logo."));
        reader.readAsDataURL(file);
    });
}
function getLocalDateInput(offset = 0) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return toDateInput(date);
}
function parseDateInput(value) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(12, 0, 0, 0);
    return date;
}
function toDateInput(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function formatDateInput(value) {
    const date = parseDateInput(value);
    return new Intl.DateTimeFormat("es-MX", {
        day: "2-digit",
        month: "short"
    }).format(date);
}
function belongsToTimeframe(task, timeframe) {
    const today = getLocalDateInput();
    const tomorrow = getLocalDateInput(1);
    const isCompleted = task.status === "concluida";
    if (timeframe === "anteriores") {
        return isCompleted;
    }
    if (isCompleted) {
        return false;
    }
    if (timeframe === "hoy") {
        return task.dueDate <= today;
    }
    if (timeframe === "manana") {
        return task.dueDate === tomorrow;
    }
    return task.dueDate > tomorrow;
}
function getStatusLabel(status) {
    if (status === "concluida") {
        return "Completada";
    }
    if (status === "en_proceso") {
        return "En proceso";
    }
    return "Pendiente";
}
function getPriorityLabel(priority) {
    if (priority === "alta") {
        return "Alta";
    }
    if (priority === "media") {
        return "Media";
    }
    return "Normal";
}
function canViewSalesSuperadminSummary(user) {
    return Boolean(user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN" || user?.permissions?.includes("*"));
}
function canManageSalesProducts(user) {
    return canViewSalesSuperadminSummary(user) || Boolean(user?.permissions?.includes("sales:write"));
}
function buildPendingStrategy(productId, content) {
    return {
        id: `pending-${productId}`,
        productId,
        content,
        updatedAt: new Date().toISOString()
    };
}
function applyStrategy(overview, strategy) {
    return {
        ...overview,
        strategies: {
            ...overview.strategies,
            [strategy.productId]: strategy
        }
    };
}
function applyDailyReport(overview, report) {
    return {
        ...overview,
        dailyReports: {
            ...overview.dailyReports,
            [report.productId]: {
                ...(overview.dailyReports[report.productId] ?? {}),
                [report.reportDate]: report.content
            }
        }
    };
}
export function SalesPage() {
    const { user } = useAuth();
    const [selectedProductId, setSelectedProductId] = useState("start");
    const [selectedReportDate, setSelectedReportDate] = useState(getLocalDateInput);
    const [expandedView, setExpandedView] = useState({
        responsibleId: "IR",
        timeframe: "hoy"
    });
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const [savingMessage, setSavingMessage] = useState(null);
    const [showCreateProductForm, setShowCreateProductForm] = useState(false);
    const [productForm, setProductForm] = useState(DEFAULT_PRODUCT_FORM);
    const strategyTimers = useRef({});
    const reportTimers = useRef({});
    async function refreshOverview(nextSelectedProductId) {
        setLoading(true);
        setErrorMessage(null);
        try {
            const loaded = normalizeOverview(await apiGet("/sales/overview"));
            setOverview(loaded);
            if (nextSelectedProductId) {
                setSelectedProductId(nextSelectedProductId);
            }
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar ventas.");
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void refreshOverview();
    }, []);
    useEffect(() => () => {
        Object.values(strategyTimers.current).forEach((timer) => {
            if (timer) {
                window.clearTimeout(timer);
            }
        });
        Object.values(reportTimers.current).forEach((timer) => window.clearTimeout(timer));
    }, []);
    const salesProducts = useMemo(() => (overview?.products ?? DEFAULT_SALES_PRODUCTS).map(attachProductLogo), [overview]);
    const archivedProducts = useMemo(() => (overview?.archivedProducts ?? []).map(attachProductLogo), [overview]);
    const allProducts = useMemo(() => [...salesProducts, ...archivedProducts], [salesProducts, archivedProducts]);
    const productById = useMemo(() => buildProductLookup(allProducts), [allProducts]);
    const selectedProduct = productById[selectedProductId] ?? salesProducts[0] ?? null;
    useEffect(() => {
        if (!overview || selectedProduct?.status === "active") {
            return;
        }
        const nextProductId = salesProducts[0]?.id;
        if (nextProductId && nextProductId !== selectedProductId) {
            setSelectedProductId(nextProductId);
        }
    }, [overview, salesProducts, selectedProduct, selectedProductId]);
    const today = getLocalDateInput();
    const salesTasks = overview?.tasks ?? [];
    const salesResponsibles = overview?.responsibles ?? [];
    const taskSeeds = overview?.taskSeeds ?? [];
    const strategies = overview?.strategies ?? salesProducts.reduce((result, product) => {
        result[product.id] = buildPendingStrategy(product.id, product.defaultStrategy);
        return result;
    }, {});
    const dailyReports = overview?.dailyReports ?? buildEmptyDailyReportStore(salesProducts);
    const openTaskCount = salesTasks.filter((task) => task.status !== "concluida").length;
    const salesPeriodicities = [...new Set(taskSeeds.map((task) => task.periodicity))];
    const dashboardProductCount = new Set(taskSeeds.map((task) => task.productId)).size;
    const canViewSuperadminSummary = canViewSalesSuperadminSummary(user);
    const canManageProducts = canManageSalesProducts(user);
    const selectedProductTasks = selectedProduct ? salesTasks.filter((task) => task.productId === selectedProduct.id) : [];
    const selectedCompletedTasks = selectedProductTasks.filter((task) => task.status === "concluida" && task.dueDate === selectedReportDate);
    const selectedDailyReport = selectedProduct ? dailyReports[selectedProduct.id]?.[selectedReportDate] ?? "" : "";
    const selectedStrategy = selectedProduct ? strategies[selectedProduct.id]?.content ?? selectedProduct.defaultStrategy : "";
    const responsibleById = useMemo(() => new Map(salesResponsibles.map((responsible) => [responsible.id, responsible])), [salesResponsibles]);
    function updateProductForm(field, value) {
        setProductForm((current) => ({
            ...current,
            [field]: value
        }));
    }
    function updateOverviewWithStrategy(productId, content) {
        setOverview((current) => current ? applyStrategy(current, {
            ...(current.strategies[productId] ?? buildPendingStrategy(productId, content)),
            content
        }) : current);
    }
    function updateOverviewWithDailyReport(productId, date, content) {
        setOverview((current) => current ? {
            ...current,
            dailyReports: {
                ...current.dailyReports,
                [productId]: {
                    ...(current.dailyReports[productId] ?? {}),
                    [date]: content
                }
            }
        } : current);
    }
    async function persistStrategy(productId, content) {
        setSavingMessage("Guardando estrategia...");
        try {
            const saved = await apiPatch(`/sales/strategies/${encodeURIComponent(productId)}`, { content });
            setOverview((current) => current ? applyStrategy(current, saved) : current);
            setSavingMessage(null);
        }
        catch (error) {
            setSavingMessage(null);
            setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar la estrategia.");
        }
    }
    async function persistDailyReport(productId, date, content) {
        setSavingMessage("Guardando reporte diario...");
        try {
            const saved = await apiPatch(`/sales/daily-reports/${encodeURIComponent(productId)}/${date}`, { content });
            setOverview((current) => current ? applyDailyReport(current, saved) : current);
            setSavingMessage(null);
        }
        catch (error) {
            setSavingMessage(null);
            setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar el reporte diario.");
        }
    }
    function updateStrategy(productId, value) {
        updateOverviewWithStrategy(productId, value);
        if (strategyTimers.current[productId]) {
            window.clearTimeout(strategyTimers.current[productId]);
        }
        strategyTimers.current[productId] = window.setTimeout(() => {
            void persistStrategy(productId, value);
        }, SAVE_DEBOUNCE_MS);
    }
    function updateDailyReport(productId, date, value) {
        const key = `${productId}-${date}`;
        updateOverviewWithDailyReport(productId, date, value);
        if (reportTimers.current[key]) {
            window.clearTimeout(reportTimers.current[key]);
        }
        reportTimers.current[key] = window.setTimeout(() => {
            void persistDailyReport(productId, date, value);
        }, SAVE_DEBOUNCE_MS);
    }
    async function handleCreateProduct(event) {
        event.preventDefault();
        setSavingMessage("Creando producto...");
        setErrorMessage(null);
        try {
            const logoBase64 = productForm.logoFile ? await readFileAsDataUrl(productForm.logoFile) : undefined;
            const payload = {
                name: productForm.name,
                tagline: productForm.tagline,
                accentColor: productForm.accentColor,
                logoAlt: productForm.name,
                logoOriginalFileName: productForm.logoFile?.name,
                logoMimeType: productForm.logoFile?.type,
                logoBase64,
                defaultStrategy: productForm.defaultStrategy,
                defaultDailyReport: productForm.defaultDailyReport
            };
            const created = await apiPost("/sales/products", payload);
            setProductForm(DEFAULT_PRODUCT_FORM);
            setShowCreateProductForm(false);
            setSavingMessage(null);
            await refreshOverview(created.id);
        }
        catch (error) {
            setSavingMessage(null);
            setErrorMessage(error instanceof Error ? error.message : "No se pudo dar de alta el producto.");
        }
    }
    async function handleArchiveProduct(product) {
        if (!window.confirm(`Archivar ${product.name}? Sus funciones y tareas quedaran suspendidas.`)) {
            return;
        }
        setSavingMessage("Archivando producto...");
        setErrorMessage(null);
        try {
            await apiPatch(`/sales/products/${encodeURIComponent(product.id)}/archive`, {});
            const fallbackProductId = salesProducts.find((candidate) => candidate.id !== product.id)?.id;
            setSavingMessage(null);
            await refreshOverview(fallbackProductId);
        }
        catch (error) {
            setSavingMessage(null);
            setErrorMessage(error instanceof Error ? error.message : "No se pudo archivar el producto.");
        }
    }
    async function handleReactivateProduct(product) {
        setSavingMessage("Reactivando producto...");
        setErrorMessage(null);
        try {
            const reactivated = await apiPatch(`/sales/products/${encodeURIComponent(product.id)}/reactivate`, {});
            setSavingMessage(null);
            await refreshOverview(reactivated.id);
        }
        catch (error) {
            setSavingMessage(null);
            setErrorMessage(error instanceof Error ? error.message : "No se pudo reactivar el producto.");
        }
    }
    async function handleDeleteProduct(product) {
        if (!window.confirm(`Eliminar definitivamente ${product.name}? Se borraran su estrategia y reportes diarios de este tenant.`)) {
            return;
        }
        setSavingMessage("Eliminando producto...");
        setErrorMessage(null);
        try {
            await apiDelete(`/sales/products/${encodeURIComponent(product.id)}`);
            setSavingMessage(null);
            await refreshOverview();
        }
        catch (error) {
            setSavingMessage(null);
            setErrorMessage(error instanceof Error ? error.message : "No se pudo eliminar el producto.");
        }
    }
    function buildRows(responsibleId, timeframe) {
        return salesTasks
            .filter((task) => task.responsibleId === responsibleId)
            .filter((task) => belongsToTimeframe(task, timeframe))
            .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
    }
    return (_jsxs("section", { className: "page-stack sales-page", children: [_jsxs("header", { className: "hero module-hero sales-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon sales-hero-icon", "aria-hidden": "true", children: "Ventas" }), _jsx("div", { children: _jsx("h2", { children: "Ventas" }) })] }), _jsx("p", { className: "muted", children: "Productos comerciales, estrategia de marketing y reporte diario con tablero unico de Itari Romero." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, savingMessage ? _jsx("div", { className: "message-banner message-success", children: savingMessage }) : null, _jsxs("section", { className: "panel sales-dashboard-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Dashboard comercial" }), _jsx("span", { children: loading ? "Cargando..." : `${openTaskCount} tareas abiertas` })] }), _jsx("div", { className: "tasks-team-member-list sales-dashboard-list", children: salesResponsibles.map((responsible) => {
                            const isExpanded = expandedView?.responsibleId === responsible.id;
                            const rows = isExpanded && expandedView ? buildRows(responsible.id, expandedView.timeframe) : [];
                            return (_jsxs("article", { className: "tasks-team-member-card sales-responsible-card", children: [_jsxs("div", { className: "tasks-team-member-head", children: [_jsx("h3", { children: responsible.name }), _jsx("span", { children: responsible.id })] }), _jsx("div", { className: "tasks-team-timeframes", children: SALES_TIMEFRAMES.map((timeframe) => {
                                            const isActive = expandedView?.responsibleId === responsible.id && expandedView.timeframe === timeframe.id;
                                            return (_jsx("button", { type: "button", className: `tasks-team-timeframe-button ${timeframe.colorClass} ${isActive ? "is-active" : ""}`, onClick: () => setExpandedView((current) => current?.responsibleId === responsible.id && current?.timeframe === timeframe.id
                                                    ? null
                                                    : { responsibleId: responsible.id, timeframe: timeframe.id }), children: timeframe.label }, timeframe.id));
                                        }) }), isExpanded && expandedView ? (_jsxs("div", { className: "tasks-team-timeframe-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: SALES_TIMEFRAMES.find((timeframe) => timeframe.id === expandedView.timeframe)?.label ?? "Detalle" }), _jsxs("span", { children: [rows.length, " tareas"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table tasks-dashboard-table sales-dashboard-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Producto" }), _jsx("th", { children: "Tarea" }), _jsx("th", { children: "Canal" }), _jsx("th", { children: "Prioridad" }), _jsx("th", { children: "Fecha" }), _jsx("th", { children: "Estado" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "centered-inline-message", children: "No hay tareas en esta categoria." }) })) : (rows.map((task) => {
                                                                const product = productById[task.productId];
                                                                if (!product) {
                                                                    return null;
                                                                }
                                                                const highlighted = task.status !== "concluida" && task.dueDate <= today;
                                                                return (_jsxs("tr", { className: highlighted ? "tasks-dashboard-row-overdue" : undefined, children: [_jsx("td", { children: _jsxs("span", { className: "sales-product-cell", children: [_jsx("span", { className: "sales-product-dot", style: { background: product.accentColor } }), product.name] }) }), _jsx("td", { className: highlighted ? "tasks-dashboard-title-overdue" : undefined, children: task.task }), _jsx("td", { children: task.channel }), _jsx("td", { children: _jsx("span", { className: `sales-priority-pill is-${task.priority}`, children: getPriorityLabel(task.priority) }) }), _jsx("td", { children: formatDateInput(task.dueDate) }), _jsx("td", { children: _jsx("span", { className: `tasks-dashboard-type-pill ${task.status === "concluida" ? "is-completed" : highlighted ? "is-overdue" : "is-pending"}`, children: getStatusLabel(task.status) }) }), _jsx("td", { children: _jsx("button", { type: "button", className: "secondary-button matter-inline-button", onClick: () => setSelectedProductId(task.productId), children: "Ver producto" }) })] }, task.id));
                                                            })) })] }) })] })) : null] }, responsible.id));
                        }) })] }), canViewSuperadminSummary ? (_jsxs("section", { className: "panel sales-superadmin-panel", "aria-label": "Consulta superadmin de tareas de ventas", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Consulta superadmin" }), _jsx("h2", { children: "Tareas reflejadas en dashboard" })] }), _jsxs("span", { children: [taskSeeds.length, " tareas configuradas"] })] }), _jsxs("div", { className: "sales-superadmin-metrics", children: [_jsxs("div", { className: "sales-superadmin-metric", children: [_jsx("span", { children: "Responsable" }), _jsx("strong", { children: "Itari Romero (IR)" })] }), _jsxs("div", { className: "sales-superadmin-metric", children: [_jsx("span", { children: "Productos activos" }), _jsx("strong", { children: dashboardProductCount })] }), _jsxs("div", { className: "sales-superadmin-metric", children: [_jsx("span", { children: "Periodicidades" }), _jsx("strong", { children: salesPeriodicities.join(" / ") })] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table sales-superadmin-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Empresa" }), _jsx("th", { children: "Producto" }), _jsx("th", { children: "Tarea" }), _jsx("th", { children: "Periodicidad" }), _jsx("th", { children: "Responsable" }), _jsx("th", { children: "Inicio en dashboard" }), _jsx("th", { children: "Prioridad" }), _jsx("th", { children: "Canal" })] }) }), _jsx("tbody", { children: taskSeeds.map((task) => {
                                        const product = productById[task.productId];
                                        const responsible = responsibleById.get(task.responsibleId);
                                        return (_jsxs("tr", { children: [_jsx("td", { children: task.company }), _jsx("td", { children: _jsxs("span", { className: "sales-product-cell", children: [_jsx("span", { className: "sales-product-dot", style: { background: product?.accentColor ?? "#2563eb" } }), product?.name ?? task.productId] }) }), _jsx("td", { children: task.task }), _jsx("td", { children: _jsx("span", { className: "sales-periodicity-pill", children: task.periodicity }) }), _jsx("td", { children: responsible ? `${responsible.name} (${responsible.id})` : task.responsibleId }), _jsx("td", { children: formatDateInput(task.firstDueDate) }), _jsx("td", { children: getPriorityLabel(task.priority) }), _jsx("td", { children: task.channel })] }, `summary-${task.id}`));
                                    }) })] }) })] })) : null, _jsxs("section", { className: "panel sales-products-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Productos" }), _jsxs("span", { children: [salesProducts.length, " productos activos"] })] }), canManageProducts ? (_jsx("button", { type: "button", className: "primary-button", onClick: () => setShowCreateProductForm((current) => !current), children: "Dar de alta producto" })) : null] }), showCreateProductForm && canManageProducts ? (_jsxs("form", { className: "sales-product-form", onSubmit: handleCreateProduct, children: [_jsxs("div", { className: "sales-product-form-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nombre" }), _jsx("input", { value: productForm.name, onChange: (event) => updateProductForm("name", event.target.value), required: true })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Color" }), _jsx("input", { type: "color", value: productForm.accentColor, onChange: (event) => updateProductForm("accentColor", event.target.value) })] }), _jsxs("label", { className: "form-field sales-product-form-wide", children: [_jsx("span", { children: "Descripcion breve" }), _jsx("input", { value: productForm.tagline, onChange: (event) => updateProductForm("tagline", event.target.value) })] }), _jsxs("label", { className: "form-field sales-product-form-wide", children: [_jsx("span", { children: "Logo" }), _jsx("input", { type: "file", accept: "image/*", onChange: (event) => updateProductForm("logoFile", event.target.files?.[0] ?? null) })] }), _jsxs("label", { className: "form-field sales-copy-field", children: [_jsx("span", { children: "Estrategia inicial" }), _jsx("textarea", { value: productForm.defaultStrategy, onChange: (event) => updateProductForm("defaultStrategy", event.target.value) })] }), _jsxs("label", { className: "form-field sales-copy-field", children: [_jsx("span", { children: "Guia de reporte diario" }), _jsx("textarea", { value: productForm.defaultDailyReport, onChange: (event) => updateProductForm("defaultDailyReport", event.target.value) })] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => {
                                            setProductForm(DEFAULT_PRODUCT_FORM);
                                            setShowCreateProductForm(false);
                                        }, children: "Cancelar" }), _jsx("button", { type: "submit", className: "primary-button", children: "Crear producto" })] })] })) : null, _jsx("div", { className: "sales-product-grid", children: salesProducts.length === 0 ? (_jsx("p", { className: "centered-inline-message sales-empty-report", children: "No hay productos activos." })) : (salesProducts.map((product) => {
                            const productOpenTasks = salesTasks.filter((task) => task.productId === product.id && task.status !== "concluida").length;
                            const isSelected = selectedProduct?.id === product.id;
                            return (_jsxs("article", { className: `sales-product-card ${isSelected ? "is-selected" : ""}`, children: [_jsxs("button", { type: "button", className: "sales-product-card-main", "aria-pressed": isSelected, onClick: () => setSelectedProductId(product.id), children: [_jsx("span", { className: "sales-product-logo-shell", children: product.logoSrc ? (_jsx("img", { src: product.logoSrc, alt: product.logoAlt })) : (_jsx("span", { className: "sales-product-monogram", style: { color: product.accentColor }, children: product.initials })) }), _jsxs("span", { className: "sales-product-card-copy", children: [_jsx("strong", { children: product.name }), _jsx("span", { children: product.tagline }), _jsxs("span", { className: "sales-product-task-summary", children: [productOpenTasks, " tareas abiertas"] })] })] }), canManageProducts ? (_jsx("div", { className: "sales-product-card-actions", children: _jsx("button", { type: "button", className: "secondary-button matter-inline-button", onClick: () => void handleArchiveProduct(product), children: "Archivar" }) })) : null] }, product.id));
                        })) })] }), archivedProducts.length > 0 ? (_jsxs("section", { className: "panel sales-products-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("h2", { children: "Archivo" }), _jsxs("span", { children: [archivedProducts.length, " productos archivados"] })] }) }), _jsx("div", { className: "sales-product-grid", children: archivedProducts.map((product) => (_jsxs("article", { className: "sales-product-card is-archived", children: [_jsxs("div", { className: "sales-product-card-main", children: [_jsx("span", { className: "sales-product-logo-shell", children: product.logoSrc ? (_jsx("img", { src: product.logoSrc, alt: product.logoAlt })) : (_jsx("span", { className: "sales-product-monogram", style: { color: product.accentColor }, children: product.initials })) }), _jsxs("span", { className: "sales-product-card-copy", children: [_jsx("strong", { children: product.name }), _jsx("span", { children: product.tagline }), _jsx("span", { className: "sales-product-task-summary is-archived", children: "Archivado" })] })] }), canManageProducts || canViewSuperadminSummary ? (_jsxs("div", { className: "sales-product-card-actions", children: [canManageProducts ? (_jsx("button", { type: "button", className: "secondary-button matter-inline-button", onClick: () => void handleReactivateProduct(product), children: "Reactivar" })) : null, canViewSuperadminSummary ? (_jsx("button", { type: "button", className: "danger-button matter-inline-button", onClick: () => void handleDeleteProduct(product), children: "Eliminar" })) : null] })) : null] }, product.id))) })] })) : null, selectedProduct ? (_jsxs("section", { className: "sales-product-detail-grid", "aria-label": `Detalle de ${selectedProduct.name}`, children: [_jsxs("article", { className: "panel sales-product-panel", children: [_jsxs("div", { className: "sales-selected-product-head", children: [_jsx("span", { className: "sales-selected-product-logo", style: { borderColor: selectedProduct.accentColor }, children: selectedProduct.logoSrc ? (_jsx("img", { src: selectedProduct.logoSrc, alt: selectedProduct.logoAlt })) : (_jsx("span", { style: { color: selectedProduct.accentColor }, children: selectedProduct.initials })) }), _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Producto" }), _jsx("h2", { children: selectedProduct.name }), _jsx("p", { className: "muted", children: selectedProduct.tagline })] })] }), _jsxs("label", { className: "form-field sales-copy-field", children: [_jsx("span", { children: "Estrategia general de marketing" }), _jsx("textarea", { value: selectedStrategy, onChange: (event) => updateStrategy(selectedProduct.id, event.target.value) })] })] }), _jsxs("article", { className: "panel sales-product-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Reporte diario de tareas realizadas" }), _jsx("span", { children: formatDateInput(selectedReportDate) })] }), _jsxs("label", { className: "form-field sales-date-field", children: [_jsx("span", { children: "Fecha del reporte" }), _jsx("input", { type: "date", value: selectedReportDate, max: today, onChange: (event) => setSelectedReportDate(event.target.value) })] }), _jsxs("label", { className: "form-field sales-copy-field", children: [_jsx("span", { children: "Bitacora diaria" }), _jsx("textarea", { value: selectedDailyReport, placeholder: selectedProduct.defaultDailyReport, onChange: (event) => updateDailyReport(selectedProduct.id, selectedReportDate, event.target.value) })] }), _jsx("div", { className: "sales-report-list", children: selectedCompletedTasks.length === 0 ? (_jsx("p", { className: "centered-inline-message sales-empty-report", children: "No hay tareas realizadas registradas para este producto." })) : (selectedCompletedTasks.map((task) => (_jsxs("div", { className: "sales-report-entry", children: [_jsx("strong", { children: task.task }), _jsx("span", { children: task.channel }), _jsx("small", { children: formatDateInput(task.dueDate) })] }, task.id)))) })] })] })) : null] }));
}
