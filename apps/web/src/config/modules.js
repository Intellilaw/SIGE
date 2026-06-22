export const MODULE_ENABLEMENT_MODULE_ID = "module-enablement";
const ALWAYS_ENABLED_MODULE_IDS = new Set(["users", "my-account", MODULE_ENABLEMENT_MODULE_ID]);
export const appModules = [
    {
        id: "clients",
        path: "/app/clients",
        label: "Clientes",
        shortLabel: "Clientes",
        icon: "\u{1F465}",
        description: "Padron central de clientes, identificadores y alta operativa del despacho.",
        phase: "Operativo",
        available: true,
        coverage: ["Alta y consulta de clientes", "Base para cotizaciones y asuntos"]
    },
    {
        id: "quotes",
        path: "/app/quotes",
        label: "Cotizaciones",
        shortLabel: "Cotizaciones",
        icon: "\u{1F4C4}",
        description: "Generación, seguimiento y control comercial de propuestas y cotizaciones.",
        phase: "Operativo",
        available: true,
        coverage: ["Consulta de cotizaciones", "Estados y montos clave"]
    },
    {
        id: "lead-tracking",
        path: "/app/leads",
        label: "Seguimiento a Leads y Cotizaciones",
        shortLabel: "Leads",
        icon: "\u{1F4C8}",
        description: "Seguimiento ordenado de leads, canales de contacto y conversión a cotización.",
        phase: "Operativo",
        available: true,
        coverage: ["Pipeline de leads", "Relación lead-cotización"]
    },
    {
        id: "active-matters",
        path: "/app/matters",
        label: "Asuntos Activos",
        shortLabel: "Asuntos",
        icon: "\u{1F4C2}",
        description: "Control de asuntos vivos, etapa, equipo responsable y contexto del servicio.",
        phase: "Operativo",
        available: true,
        coverage: ["Listado de asuntos activos", "Visibilidad de etapa y equipo"]
    },
    {
        id: "execution",
        path: "/app/execution",
        label: "Ejecución",
        shortLabel: "Ejecución",
        icon: "\u2699\uFE0F",
        description: "Operación por equipo para litigio, corporativo, convenios, financiero y compliance fiscal.",
        phase: "Operativo",
        available: true,
        coverage: ["Tableros por equipo", "Siguientes tareas", "Resaltado por faltantes y vencimientos"]
    },
    {
        id: "tasks",
        path: "/app/tasks",
        label: "Tareas",
        shortLabel: "Tareas",
        icon: "\u2705",
        description: "Operación diaria por equipo con vista por integrante, ventanas temporales y tablero de asuntos.",
        phase: "Operativo",
        available: true,
        coverage: ["Entrada por equipo", "Vista diaria por integrante", "Tablero con filas en rojo"]
    },
    {
        id: "sales",
        path: "/app/sales",
        label: "Ventas",
        shortLabel: "Ventas",
        icon: "\u{1F4E3}",
        description: "Productos comerciales, estrategia general de marketing y reporte diario de tareas de venta.",
        phase: "Operativo",
        available: true,
        coverage: ["Productos", "Estrategia de marketing", "Reporte diario", "Dashboard de tareas de IR", "Consulta superadmin"]
    },
    {
        id: "finances",
        path: "/app/finances",
        label: "Finanzas",
        shortLabel: "Finanzas",
        icon: "\u{1F4B0}",
        description: "Seguimiento financiero del despacho, cobranza mensual, comisiones y estampa historica por periodo.",
        phase: "Operativo",
        available: true,
        coverage: ["Asuntos activos con envio a Finanzas", "Vista mensual con comisiones", "Copiado al mes siguiente", "Snapshots historicos"]
    },
    {
        id: "budget-planning",
        path: "/app/budget-planning",
        label: "Planeaci\u00f3n presupuestal",
        shortLabel: "Planeaci\u00f3n",
        icon: "\u{1F4CB}",
        description: "Planeaci\u00f3n y seguimiento presupuestal del despacho con control de metas, partidas y variaciones.",
        phase: "Operativo",
        available: true,
        coverage: ["Vista mensual", "Ingresos y gastos esperados", "Comparativo real contra Finanzas y Gastos generales"]
    },
    {
        id: "general-expenses",
        path: "/app/general-expenses",
        label: "Gastos generales",
        shortLabel: "Gastos",
        icon: "\u{1F4B8}",
        description: "Registro y validacion de gastos internos con trazabilidad y controles de autorizacion.",
        phase: "Operativo",
        available: true,
        coverage: ["Carga de gastos", "Validacion por metodo de pago", "Resumen diario EMRT", "Control administrativo"]
    },
    {
        id: "commissions",
        path: "/app/commissions",
        label: "Comisiones",
        shortLabel: "Comisiones",
        icon: "\u{1F3C5}",
        description: "Calculo por seccion, estampas historicas y diagnostico de comisiones comerciales y operativas.",
        phase: "Operativo",
        available: true,
        coverage: ["Calculo por receptor", "Receptores de comision", "Estampas y validacion visual"]
    },
    {
        id: "kpis",
        path: "/app/kpis",
        label: "KPI'S",
        shortLabel: "KPI'S",
        icon: "\u{1F4CA}",
        description: "KPI's significa Key Performance Indicators: indicadores clave de desempeño alimentados automaticamente desde seguimiento.",
        phase: "Operativo",
        available: true,
        coverage: ["KPI's por usuario", "Agrupacion por equipo", "Datos automaticos desde seguimiento"]
    },
    {
        id: "general-supervision",
        path: "/app/general-supervision",
        label: "Supervisión general",
        shortLabel: "Supervisión",
        icon: "\u{1F441}\uFE0F",
        description: "Vista ejecutiva transversal para direccion, seguimiento y deteccion de cuellos de botella.",
        phase: "Operativo",
        available: true,
        access: "emrt-superadmin",
        coverage: ["Tareas por usuario", "Terminos por equipo", "KPI's semanales fuera de meta"]
    },
    {
        id: "rusconi-intelligence",
        path: "/app/rusconi-intelligence",
        label: "Rusconi Intelligence",
        shortLabel: "RI",
        icon: "RI",
        description: "Centro de inteligencia para gobernar conexiones LLM, prompts y contexto de supervision transversal del SIGE.",
        phase: "Operativo",
        available: true,
        access: "emrt-superadmin",
        coverage: ["Distintivo RI por conexion", "Prompt y contexto por ID", "Politica de modelo OpenAI frontier"]
    },
    {
        id: "matter-catalog",
        path: "/app/matter-catalog",
        label: "Catálogo de Asuntos",
        shortLabel: "Catálogo",
        icon: "\u{1F4DA}",
        description: "Consulta de asuntos con ID asignado, agrupados por cliente y con borrado permanente para superadmin.",
        phase: "Operativo",
        available: true,
        coverage: ["Asuntos con ID asignado", "Búsqueda por cliente, cotización, ID y asunto", "Borrado permanente por superadmin"]
    },
    {
        id: "internal-contracts",
        path: "/app/internal-contracts",
        label: "Administraci\u00f3n de contratos internos",
        shortLabel: "Contratos",
        icon: "\u{1F4DC}",
        description: "Carga y control interno de contratos profesionales, laborales, addenda y machotes.",
        phase: "Operativo",
        available: true,
        coverage: ["Contratos por cliente", "Contratos laborales por colaborador", "Machotes descargables", "Hitos de pago visibles"]
    },
    {
        id: "labor-file",
        path: "/app/labor-file",
        label: "Expedientes Laborales",
        shortLabel: "Expedientes",
        icon: "\u{1F4C1}",
        description: "Repositorio estructurado de contratos, documentos obligatorios y vacaciones por colaborador.",
        phase: "Operativo",
        available: true,
        coverage: ["Expediente por usuario", "Contratos y addenda", "Documentos obligatorios", "Control de vacaciones"]
    },
    {
        id: "daily-documents",
        path: "/app/daily-documents",
        label: "Documentos de uso diario",
        shortLabel: "Uso diario",
        icon: "\u{1F4DD}",
        description: "Generacion rapida de documentos operativos frecuentes para uso interno y atencion diaria.",
        phase: "Operativo",
        available: true,
        coverage: ["Cartas poder", "Recibos", "Entregas recepcion", "Vista previa y descarga"]
    },
    {
        id: "third-party-documents",
        path: "/app/third-party-documents",
        label: "Documentos para terceros",
        shortLabel: "Terceros",
        icon: "\u{1F4D1}",
        description: "Entrega y administracion de documentos dirigidos a terceros con control de acceso.",
        phase: "Operativo",
        available: true,
        coverage: ["Documentos externos", "Buscador por nombre o archivo", "Apertura y descarga de documentos"]
    },
    {
        id: "guidelines-manuals",
        path: "/app/guidelines-manuals",
        label: "Lineamientos y manuales internos",
        shortLabel: "Lineamientos",
        icon: "\u{1F4D8}",
        description: "Biblioteca de lectura para documentos de organizacion interna.",
        phase: "Operativo",
        available: true,
        access: "all",
        coverage: ["Documentos de organizacion interna", "Lectura libre para usuarios del sistema", "Apertura y descarga de documentos"]
    },
    {
        id: "holidays",
        path: "/app/holidays",
        label: "Días inhábiles",
        shortLabel: "Días inhábiles",
        icon: "\u{1F4C5}",
        description: "Calendario operativo por organo y empresa que impacta terminos, vencimientos y calculos procesales.",
        phase: "Operativo",
        available: true,
        coverage: ["Calendario por organo y empresa", "Nombres cortos estables", "Impacto en calculo de terminos"]
    },
    {
        id: "users",
        path: "/app/users",
        label: "Usuarios",
        shortLabel: "Usuarios",
        icon: "\u{1F464}",
        description: "Administración de usuarios, acceso, equipos y gobierno de permisos internos.",
        phase: "Operativo",
        available: true,
        coverage: ["Alta de usuarios", "Edicion de nombre corto, equipo y rol especifico", "Permisos y acceso por equipo y perfil"]
    },
    {
        id: "my-account",
        path: "/app/my-account",
        label: "Mi cuenta",
        shortLabel: "Mi cuenta",
        icon: "\u{1F510}",
        description: "Consulta de identidad de la sesion activa y cambio seguro de contrasena personal.",
        phase: "Operativo",
        available: true,
        access: "all",
        coverage: ["Datos de cuenta propia", "Cambio de contrasena con validacion actual", "Sesion renovada para el usuario logueado"]
    },
    {
        id: MODULE_ENABLEMENT_MODULE_ID,
        path: "/app/module-enablement",
        label: "Habilitaci\u00f3n de m\u00f3dulos",
        shortLabel: "M\u00f3dulos",
        icon: "\u2611\uFE0F",
        description: "Control global para ocultar temporalmente modulos que no deben aparecer en el espacio de trabajo.",
        phase: "Operativo",
        available: true,
        access: "emrt-superadmin",
        coverage: ["Habilitacion global", "Ocultamiento temporal", "Conservacion de datos existentes"]
    }
];
export const navigation = [
    { path: "/app", label: "Men\u00fa principal", icon: "\u25EB" },
    ...appModules.map((module) => ({
        path: module.path,
        label: module.label,
        icon: module.icon
    }))
];
function normalizeIdentity(value) {
    return (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
function isEmrtIdentity(value) {
    const normalized = normalizeIdentity(value);
    return normalized === "emrt" || (normalized.includes("eduardo") && normalized.includes("rusconi"));
}
export function canAccessGeneralSupervision(user) {
    if (!user) {
        return false;
    }
    const isSuperadmin = user.role === "SUPERADMIN" || user.legacyRole === "SUPERADMIN";
    const emailLocalPart = user.email?.includes("@") ? user.email.slice(0, user.email.indexOf("@")) : user.email;
    return isSuperadmin && [
        user.shortName,
        user.username,
        user.displayName,
        user.email,
        emailLocalPart
    ].some(isEmrtIdentity);
}
export function isAlwaysEnabledModule(moduleId) {
    return ALWAYS_ENABLED_MODULE_IDS.has(moduleId);
}
export function getToggleableAppModules() {
    return appModules.filter((module) => !isAlwaysEnabledModule(module.id));
}
export function getVisibleAppModules(user, disabledModuleIds = []) {
    const disabledModules = new Set(disabledModuleIds);
    return appModules.filter((module) => {
        if (module.access === "emrt-superadmin" && !canAccessGeneralSupervision(user)) {
            return false;
        }
        return isAlwaysEnabledModule(module.id) || !disabledModules.has(module.id);
    });
}
export function getNavigationForUser(user, disabledModuleIds = []) {
    return [
        { path: "/app", label: "Men\u00fa principal", icon: "\u25EB" },
        ...getVisibleAppModules(user, disabledModuleIds).map((module) => ({
            path: module.path,
            label: module.label,
            icon: module.icon
        }))
    ];
}
export function getModuleById(id) {
    return appModules.find((module) => module.id === id);
}
