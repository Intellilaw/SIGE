import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import startLogo from "../../assets/start-logo.jpg";
const SALES_PRODUCTS = [
    {
        id: "start",
        name: "Start",
        tagline: "Producto de apertura para nuevos clientes de LegalFlow.",
        initials: "ST",
        accentColor: "#2563eb",
        logoSrc: startLogo,
        defaultStrategy: "Delimitar el mensaje de entrada de Start: explicar el beneficio concreto, el tipo de cliente ideal, los canales prioritarios y la oferta inicial que debe convertirse en llamada comercial.",
        defaultDailyReport: "Registrar contactos realizados, piezas publicadas, respuestas recibidas, siguientes acciones y bloqueos detectados durante el dia."
    },
    {
        id: "pld",
        name: "Sistema PLD",
        tagline: "Solucion para cumplimiento, prevencion y control operativo PLD.",
        initials: "PLD",
        accentColor: "#0f766e",
        defaultStrategy: "Delimitar segmentos regulados, dolores por auditoria y cumplimiento, argumentos de confianza, objeciones frecuentes y ruta de demostracion del sistema PLD.",
        defaultDailyReport: "Registrar prospectos contactados, demostraciones agendadas, preguntas recurrentes, materiales enviados y acuerdos de seguimiento."
    },
    {
        id: "remates",
        name: "Remates",
        tagline: "Oferta comercial enfocada en oportunidades inmobiliarias y seguimiento juridico.",
        initials: "RM",
        accentColor: "#b45309",
        defaultStrategy: "Delimitar inventario objetivo, perfil de inversionista, mensajes de oportunidad, reglas de calificacion de leads y cadencia de seguimiento.",
        defaultDailyReport: "Registrar propiedades revisadas, leads calificados, llamadas realizadas, dudas legales y proximas tareas comerciales."
    }
];
const SALES_RESPONSIBLES = [
    { id: "IR", name: "Itari Romero" }
];
const SALES_TIMEFRAMES = [
    { id: "anteriores", label: "Tareas realizadas", colorClass: "is-past" },
    { id: "hoy", label: "Tareas hoy", colorClass: "is-today" },
    { id: "manana", label: "Tareas manana", colorClass: "is-tomorrow" },
    { id: "posteriores", label: "Tareas posteriores", colorClass: "is-future" }
];
const SALES_TASK_SEEDS = [
    {
        id: "start-argumentario",
        productId: "start",
        responsibleId: "IR",
        task: "Actualizar argumento central de campana y piezas de primer contacto",
        channel: "Contenido",
        dueOffset: 0,
        status: "pendiente",
        priority: "alta"
    },
    {
        id: "start-prospectos",
        productId: "start",
        responsibleId: "IR",
        task: "Revisar prospectos calificados y asignar llamadas comerciales",
        channel: "Pipeline",
        dueOffset: 1,
        status: "en_proceso",
        priority: "media"
    },
    {
        id: "start-reporte",
        productId: "start",
        responsibleId: "IR",
        task: "Cerrar reporte de contactos iniciales de la semana",
        channel: "Reporte",
        dueOffset: -1,
        status: "concluida",
        priority: "normal"
    },
    {
        id: "pld-listado",
        productId: "pld",
        responsibleId: "IR",
        task: "Preparar listado de prospectos regulados para Sistema PLD",
        channel: "Prospeccion",
        dueOffset: 0,
        status: "pendiente",
        priority: "alta"
    },
    {
        id: "pld-demo",
        productId: "pld",
        responsibleId: "IR",
        task: "Actualizar guion de demostracion y preguntas frecuentes",
        channel: "Demo",
        dueOffset: 2,
        status: "pendiente",
        priority: "media"
    },
    {
        id: "pld-material",
        productId: "pld",
        responsibleId: "IR",
        task: "Publicar pieza educativa sobre obligaciones PLD",
        channel: "Contenido",
        dueOffset: 5,
        status: "pendiente",
        priority: "normal"
    },
    {
        id: "remates-inventario",
        productId: "remates",
        responsibleId: "IR",
        task: "Validar inventario comercial y fichas disponibles",
        channel: "Inventario",
        dueOffset: 1,
        status: "pendiente",
        priority: "alta"
    },
    {
        id: "remates-seguimiento",
        productId: "remates",
        responsibleId: "IR",
        task: "Definir lista corta de inversionistas para seguimiento",
        channel: "Relaciones",
        dueOffset: 3,
        status: "pendiente",
        priority: "media"
    },
    {
        id: "remates-resumen",
        productId: "remates",
        responsibleId: "IR",
        task: "Consolidar aprendizajes de mensajes publicados",
        channel: "Reporte",
        dueOffset: -2,
        status: "concluida",
        priority: "normal"
    }
];
const DEFAULT_STRATEGIES = SALES_PRODUCTS.reduce((defaults, product) => {
    defaults[product.id] = product.defaultStrategy;
    return defaults;
}, {});
const DAILY_REPORT_STORAGE_KEY = "sige-sales-daily-reports";
const SALES_PRODUCT_BY_ID = SALES_PRODUCTS.reduce((lookup, product) => {
    lookup[product.id] = product;
    return lookup;
}, {});
function getLocalDateInput(offset = 0) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function formatDateInput(value) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat("es-MX", {
        day: "2-digit",
        month: "short"
    }).format(date);
}
function readStoredTextMap(storageKey, defaults) {
    if (typeof window === "undefined") {
        return defaults;
    }
    try {
        const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
        return SALES_PRODUCTS.reduce((result, product) => {
            result[product.id] = stored[product.id] ?? defaults[product.id];
            return result;
        }, {});
    }
    catch {
        return defaults;
    }
}
function buildDefaultDailyReportStore(date = getLocalDateInput()) {
    return SALES_PRODUCTS.reduce((defaults, product) => {
        defaults[product.id] = {
            [date]: product.defaultDailyReport
        };
        return defaults;
    }, {});
}
function readStoredDailyReportStore(storageKey) {
    const fallback = buildDefaultDailyReportStore();
    if (typeof window === "undefined") {
        return fallback;
    }
    try {
        const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
        return SALES_PRODUCTS.reduce((result, product) => {
            const storedProductReports = stored[product.id];
            if (typeof storedProductReports === "string") {
                result[product.id] = {
                    [getLocalDateInput()]: storedProductReports
                };
                return result;
            }
            result[product.id] = {
                ...(fallback[product.id] ?? {}),
                ...(storedProductReports ?? {})
            };
            return result;
        }, {});
    }
    catch {
        return fallback;
    }
}
function writeStoredDailyReportStore(storageKey, value) {
    if (typeof window === "undefined") {
        return;
    }
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(value));
    }
    catch {
        // Local persistence is a convenience layer; the screen remains usable if storage is blocked.
    }
}
function writeStoredTextMap(storageKey, value) {
    if (typeof window === "undefined") {
        return;
    }
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(value));
    }
    catch {
        // Local persistence is a convenience layer; the screen remains usable if storage is blocked.
    }
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
export function SalesPage() {
    const [selectedProductId, setSelectedProductId] = useState("start");
    const [selectedReportDate, setSelectedReportDate] = useState(getLocalDateInput);
    const [expandedView, setExpandedView] = useState({
        responsibleId: "IR",
        timeframe: "hoy"
    });
    const [strategies, setStrategies] = useState(() => readStoredTextMap("sige-sales-strategies", DEFAULT_STRATEGIES));
    const [dailyReports, setDailyReports] = useState(() => readStoredDailyReportStore(DAILY_REPORT_STORAGE_KEY));
    const salesTasks = useMemo(() => SALES_TASK_SEEDS.map((task) => ({
        ...task,
        dueDate: getLocalDateInput(task.dueOffset)
    })), []);
    const selectedProduct = SALES_PRODUCT_BY_ID[selectedProductId];
    const today = getLocalDateInput();
    const openTaskCount = salesTasks.filter((task) => task.status !== "concluida").length;
    const selectedProductTasks = salesTasks.filter((task) => task.productId === selectedProductId);
    const selectedCompletedTasks = selectedProductTasks.filter((task) => task.status === "concluida" && task.dueDate === selectedReportDate);
    const selectedDailyReport = dailyReports[selectedProduct.id]?.[selectedReportDate] ?? "";
    function updateStrategy(productId, value) {
        setStrategies((current) => {
            const next = { ...current, [productId]: value };
            writeStoredTextMap("sige-sales-strategies", next);
            return next;
        });
    }
    function updateDailyReport(productId, date, value) {
        setDailyReports((current) => {
            const next = {
                ...current,
                [productId]: {
                    ...(current[productId] ?? {}),
                    [date]: value
                }
            };
            writeStoredDailyReportStore(DAILY_REPORT_STORAGE_KEY, next);
            return next;
        });
    }
    function buildRows(responsible, timeframe) {
        return salesTasks
            .filter((task) => task.responsibleId === responsible.id)
            .filter((task) => belongsToTimeframe(task, timeframe))
            .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
    }
    return (_jsxs("section", { className: "page-stack sales-page", children: [_jsxs("header", { className: "hero module-hero sales-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon sales-hero-icon", "aria-hidden": "true", children: "Ventas" }), _jsx("div", { children: _jsx("h2", { children: "Ventas" }) })] }), _jsx("p", { className: "muted", children: "Productos comerciales, estrategia de marketing y reporte diario con tablero unico de Itari Romero." })] }), _jsxs("section", { className: "panel sales-dashboard-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Dashboard comercial" }), _jsxs("span", { children: [openTaskCount, " tareas abiertas"] })] }), _jsx("div", { className: "tasks-team-member-list sales-dashboard-list", children: SALES_RESPONSIBLES.map((responsible) => {
                            const isExpanded = expandedView?.responsibleId === responsible.id;
                            const rows = isExpanded && expandedView ? buildRows(responsible, expandedView.timeframe) : [];
                            return (_jsxs("article", { className: "tasks-team-member-card sales-responsible-card", children: [_jsxs("div", { className: "tasks-team-member-head", children: [_jsx("h3", { children: responsible.name }), _jsx("span", { children: responsible.id })] }), _jsx("div", { className: "tasks-team-timeframes", children: SALES_TIMEFRAMES.map((timeframe) => {
                                            const isActive = expandedView?.responsibleId === responsible.id && expandedView.timeframe === timeframe.id;
                                            return (_jsx("button", { type: "button", className: `tasks-team-timeframe-button ${timeframe.colorClass} ${isActive ? "is-active" : ""}`, onClick: () => setExpandedView((current) => current?.responsibleId === responsible.id && current?.timeframe === timeframe.id
                                                    ? null
                                                    : { responsibleId: responsible.id, timeframe: timeframe.id }), children: timeframe.label }, timeframe.id));
                                        }) }), isExpanded && expandedView ? (_jsxs("div", { className: "tasks-team-timeframe-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: SALES_TIMEFRAMES.find((timeframe) => timeframe.id === expandedView.timeframe)?.label ?? "Detalle" }), _jsxs("span", { children: [rows.length, " tareas"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table tasks-dashboard-table sales-dashboard-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Producto" }), _jsx("th", { children: "Tarea" }), _jsx("th", { children: "Canal" }), _jsx("th", { children: "Prioridad" }), _jsx("th", { children: "Fecha" }), _jsx("th", { children: "Estado" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "centered-inline-message", children: "No hay tareas en esta categoria." }) })) : (rows.map((task) => {
                                                                const product = SALES_PRODUCT_BY_ID[task.productId];
                                                                const highlighted = task.status !== "concluida" && task.dueDate <= today;
                                                                return (_jsxs("tr", { className: highlighted ? "tasks-dashboard-row-overdue" : undefined, children: [_jsx("td", { children: _jsxs("span", { className: "sales-product-cell", children: [_jsx("span", { className: "sales-product-dot", style: { background: product.accentColor } }), product.name] }) }), _jsx("td", { className: highlighted ? "tasks-dashboard-title-overdue" : undefined, children: task.task }), _jsx("td", { children: task.channel }), _jsx("td", { children: _jsx("span", { className: `sales-priority-pill is-${task.priority}`, children: getPriorityLabel(task.priority) }) }), _jsx("td", { children: formatDateInput(task.dueDate) }), _jsx("td", { children: _jsx("span", { className: `tasks-dashboard-type-pill ${task.status === "concluida" ? "is-completed" : highlighted ? "is-overdue" : "is-pending"}`, children: getStatusLabel(task.status) }) }), _jsx("td", { children: _jsx("button", { type: "button", className: "secondary-button matter-inline-button", onClick: () => setSelectedProductId(task.productId), children: "Ver producto" }) })] }, task.id));
                                                            })) })] }) })] })) : null] }, responsible.id));
                        }) })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Productos" }), _jsxs("span", { children: [SALES_PRODUCTS.length, " productos"] })] }), _jsx("div", { className: "sales-product-grid", children: SALES_PRODUCTS.map((product) => {
                            const productOpenTasks = salesTasks.filter((task) => task.productId === product.id && task.status !== "concluida").length;
                            const isSelected = selectedProductId === product.id;
                            return (_jsxs("button", { type: "button", className: `sales-product-card ${isSelected ? "is-selected" : ""}`, "aria-pressed": isSelected, onClick: () => setSelectedProductId(product.id), children: [_jsx("span", { className: "sales-product-logo-shell", children: product.logoSrc ? (_jsx("img", { src: product.logoSrc, alt: "Start by LegalFlow" })) : (_jsx("span", { className: "sales-product-monogram", style: { color: product.accentColor }, children: product.initials })) }), _jsxs("span", { className: "sales-product-card-copy", children: [_jsx("strong", { children: product.name }), _jsx("span", { children: product.tagline }), _jsxs("span", { className: "sales-product-task-summary", children: [productOpenTasks, " tareas abiertas"] })] })] }, product.id));
                        }) })] }), _jsxs("section", { className: "sales-product-detail-grid", "aria-label": `Detalle de ${selectedProduct.name}`, children: [_jsxs("article", { className: "panel sales-product-panel", children: [_jsxs("div", { className: "sales-selected-product-head", children: [_jsx("span", { className: "sales-selected-product-logo", style: { borderColor: selectedProduct.accentColor }, children: selectedProduct.logoSrc ? (_jsx("img", { src: selectedProduct.logoSrc, alt: "Start by LegalFlow" })) : (_jsx("span", { style: { color: selectedProduct.accentColor }, children: selectedProduct.initials })) }), _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Producto" }), _jsx("h2", { children: selectedProduct.name }), _jsx("p", { className: "muted", children: selectedProduct.tagline })] })] }), _jsxs("label", { className: "form-field sales-copy-field", children: [_jsx("span", { children: "Estrategia general de marketing" }), _jsx("textarea", { value: strategies[selectedProduct.id], onChange: (event) => updateStrategy(selectedProduct.id, event.target.value) })] })] }), _jsxs("article", { className: "panel sales-product-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Reporte diario de tareas realizadas" }), _jsx("span", { children: formatDateInput(selectedReportDate) })] }), _jsxs("label", { className: "form-field sales-date-field", children: [_jsx("span", { children: "Fecha del reporte" }), _jsx("input", { type: "date", value: selectedReportDate, max: today, onChange: (event) => setSelectedReportDate(event.target.value) })] }), _jsxs("label", { className: "form-field sales-copy-field", children: [_jsx("span", { children: "Bitacora diaria" }), _jsx("textarea", { value: selectedDailyReport, placeholder: selectedProduct.defaultDailyReport, onChange: (event) => updateDailyReport(selectedProduct.id, selectedReportDate, event.target.value) })] }), _jsx("div", { className: "sales-report-list", children: selectedCompletedTasks.length === 0 ? (_jsx("p", { className: "centered-inline-message sales-empty-report", children: "No hay tareas realizadas registradas para este producto." })) : (selectedCompletedTasks.map((task) => (_jsxs("div", { className: "sales-report-entry", children: [_jsx("strong", { children: task.task }), _jsx("span", { children: task.channel }), _jsx("small", { children: formatDateInput(task.dueDate) })] }, task.id)))) })] })] })] }));
}
