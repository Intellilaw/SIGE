export interface AppModuleDefinition {
  id: string;
  path: string;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  phase: "Operativo" | "En preparacion";
  available: boolean;
  coverage: string[];
}

export const appModules: AppModuleDefinition[] = [
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
    description: "Generacion, seguimiento y control comercial de propuestas y cotizaciones.",
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
    description: "Seguimiento ordenado de leads, canales de contacto y conversion a cotizacion.",
    phase: "Operativo",
    available: true,
    coverage: ["Pipeline de leads", "Relacion lead-cotizacion"]
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
    label: "Ejecucion",
    shortLabel: "Ejecucion",
    icon: "\u2699\uFE0F",
    description: "Operacion por equipo para litigio, corporativo, convenios, financiero y compliance fiscal.",
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
    description: "Operacion diaria por equipo con vista por integrante, ventanas temporales y tablero de asuntos.",
    phase: "Operativo",
    available: true,
    coverage: ["Entrada por equipo", "Vista diaria por integrante", "Tablero con filas en rojo"]
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
    description: "Indicadores operativos y de presentacion para supervision individual y por equipo.",
    phase: "En preparacion",
    available: false,
    coverage: ["KPIs por presentar", "KPIs presentados", "Vista individual y de equipo"]
  },
  {
    id: "general-supervision",
    path: "/app/general-supervision",
    label: "Supervision general",
    shortLabel: "Supervision",
    icon: "\u{1F441}\uFE0F",
    description: "Vista ejecutiva transversal para direccion, seguimiento y deteccion de cuellos de botella.",
    phase: "En preparacion",
    available: false,
    coverage: ["Panorama ejecutivo", "Seguimiento transversal del despacho"]
  },
  {
    id: "matter-catalog",
    path: "/app/matter-catalog",
    label: "Catalogo de Asuntos",
    shortLabel: "Catalogo",
    icon: "\u{1F4DA}",
    description: "Consulta de asuntos con ID asignado, agrupados por cliente y con borrado permanente para superadmin.",
    phase: "Operativo",
    available: true,
    coverage: ["Asuntos con ID asignado", "Busqueda por cliente, cotizacion, ID y asunto", "Borrado permanente por superadmin"]
  },
  {
    id: "brief-manager",
    path: "/app/brief-manager",
    label: "Manager de escritos",
    shortLabel: "Escritos",
    icon: "\u270D\uFE0F",
    description: "Concentrador para control, versionado y administracion de escritos del despacho.",
    phase: "En preparacion",
    available: false,
    coverage: ["Seguimiento de escritos", "Control documental operativo"]
  },
  {
    id: "labor-file",
    path: "/app/labor-file",
    label: "Expediente laboral",
    shortLabel: "Expediente",
    icon: "\u{1F4C1}",
    description: "Repositorio estructurado del expediente laboral con trazabilidad de eventos y anexos.",
    phase: "En preparacion",
    available: false,
    coverage: ["Historial laboral", "Control documental por colaborador"]
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
    id: "holidays",
    path: "/app/holidays",
    label: "Dias inhabiles",
    shortLabel: "Dias inhabiles",
    icon: "\u{1F4C5}",
    description: "Calendario operativo que impacta terminos, vencimientos y calculos procesales.",
    phase: "En preparacion",
    available: false,
    coverage: ["Calendario operativo", "Impacto en calculo de terminos"]
  },
  {
    id: "users",
    path: "/app/users",
    label: "Usuarios",
    shortLabel: "Usuarios",
    icon: "\u{1F464}",
    description: "Administracion de usuarios, acceso, equipos y gobierno de permisos internos.",
    phase: "Operativo",
    available: true,
    coverage: ["Alta de usuarios", "Edicion de nombre corto, equipo y rol especifico", "Permisos y acceso por equipo y perfil"]
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

export function getModuleById(id: string) {
  return appModules.find((module) => module.id === id);
}
