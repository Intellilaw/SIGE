export type SalesProductId = "start" | "pld" | "remates" | "minka";
export type SalesTimeframe = "anteriores" | "hoy" | "manana" | "posteriores";
export type SalesTaskStatus = "pendiente" | "en_proceso" | "concluida";
export type SalesTaskPriority = "alta" | "media" | "normal";
export type SalesCompany = "LegalFlow";

export interface SalesProduct {
  id: SalesProductId;
  name: string;
  tagline: string;
  initials: string;
  accentColor: string;
  logoAlt: string;
  defaultStrategy: string;
  defaultDailyReport: string;
}

export interface SalesResponsible {
  id: string;
  name: string;
}

export interface SalesTaskSeed {
  id: string;
  company: SalesCompany;
  productId: SalesProductId;
  responsibleId: string;
  task: string;
  channel: string;
  periodicity: string;
  priority: SalesTaskPriority;
  firstDueDate: string;
}

export interface SalesTask extends Omit<SalesTaskSeed, "firstDueDate"> {
  dueDate: string;
  status: SalesTaskStatus;
}

export interface SalesStrategy {
  id: string;
  productId: SalesProductId;
  content: string;
  updatedAt: string;
  updatedByName?: string;
}

export interface SalesDailyReport {
  id: string;
  productId: SalesProductId;
  reportDate: string;
  content: string;
  submittedAt?: string;
  updatedAt: string;
  updatedByName?: string;
}

export type SalesDailyReportStore = Record<SalesProductId, Record<string, string>>;

export interface SalesOverview {
  products: SalesProduct[];
  responsibles: SalesResponsible[];
  taskSeeds: SalesTaskSeed[];
  tasks: SalesTask[];
  strategies: Record<SalesProductId, SalesStrategy>;
  dailyReports: SalesDailyReportStore;
}

export const LEGALFLOW_SALES_START_DATE = "2026-06-08";
export const LEGALFLOW_SALES_FUTURE_BUSINESS_DAYS = 20;

export const LEGALFLOW_SALES_PRODUCTS: SalesProduct[] = [
  {
    id: "start",
    name: "Start",
    tagline: "Producto de apertura para nuevos clientes de LegalFlow.",
    initials: "ST",
    accentColor: "#2563eb",
    logoAlt: "Start by LegalFlow",
    defaultStrategy:
      "Delimitar el mensaje de entrada de Start: explicar el beneficio concreto, el tipo de cliente ideal, los canales prioritarios y la oferta inicial que debe convertirse en llamada comercial.",
    defaultDailyReport:
      "Registrar contactos realizados, piezas publicadas, respuestas recibidas, siguientes acciones y bloqueos detectados durante el dia."
  },
  {
    id: "pld",
    name: "Intellilaw PLD",
    tagline: "Solucion para cumplimiento, prevencion y control operativo PLD.",
    initials: "PLD",
    accentColor: "#2563eb",
    logoAlt: "Intellilaw PLD by LegalFlow",
    defaultStrategy:
      "Delimitar segmentos regulados, dolores por auditoria y cumplimiento, argumentos de confianza, objeciones frecuentes y ruta de demostracion de Intellilaw PLD.",
    defaultDailyReport:
      "Registrar prospectos contactados, demostraciones agendadas, preguntas recurrentes, materiales enviados y acuerdos de seguimiento."
  },
  {
    id: "remates",
    name: "Remates",
    tagline: "Oferta comercial enfocada en oportunidades inmobiliarias y seguimiento juridico.",
    initials: "RM",
    accentColor: "#1d4ed8",
    logoAlt: "Remates Inmobiliarios Mexico by LegalFlow",
    defaultStrategy:
      "Delimitar inventario objetivo, perfil de inversionista, mensajes de oportunidad, reglas de calificacion de leads y cadencia de seguimiento.",
    defaultDailyReport:
      "Registrar propiedades revisadas, leads calificados, llamadas realizadas, dudas legales y proximas tareas comerciales."
  },
  {
    id: "minka",
    name: "Minka",
    tagline: "Inteligencia contractual con IA para abogados y equipos legales.",
    initials: "MK",
    accentColor: "#6d28d9",
    logoAlt: "Minka by LegalFlow",
    defaultStrategy:
      "Delimitar casos de uso contractuales, promesas de eficiencia, perfil de usuarios juridicos, mensajes de confianza y secuencia de demostracion para Minka.",
    defaultDailyReport:
      "Registrar despachos y equipos legales contactados, demos agendadas, contratos analizados, dudas sobre IA y siguientes acciones comerciales."
  }
];

export const LEGALFLOW_SALES_RESPONSIBLES: SalesResponsible[] = [
  { id: "IR", name: "Itari Romero" }
];

export function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function toDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function getTodayDateKey() {
  return toDateKey(new Date());
}

export function isSalesBusinessDay(date: Date) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

export function addSalesBusinessDays(value: string, days: number) {
  const date = parseDateKey(value);
  let remainingDays = days;

  while (remainingDays > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isSalesBusinessDay(date)) {
      remainingDays -= 1;
    }
  }

  return toDateKey(date);
}

export const LEGALFLOW_SALES_TASK_SEEDS: SalesTaskSeed[] = [
  {
    id: "legalflow-remates-reporte-diario",
    company: "LegalFlow",
    productId: "remates",
    responsibleId: "IR",
    task: "Publicar reporte diario de tareas realizadas de Remates by LegalFlow",
    channel: "Reporte diario",
    periodicity: "Cada dos dias habiles, alternando con Start by LegalFlow",
    priority: "alta",
    firstDueDate: LEGALFLOW_SALES_START_DATE
  },
  {
    id: "legalflow-start-reporte-diario",
    company: "LegalFlow",
    productId: "start",
    responsibleId: "IR",
    task: "Publicar reporte diario de tareas realizadas de Start by LegalFlow",
    channel: "Reporte diario",
    periodicity: "Cada dos dias habiles, alternando con Remates by LegalFlow",
    priority: "alta",
    firstDueDate: addSalesBusinessDays(LEGALFLOW_SALES_START_DATE, 1)
  }
];

export function getLegalFlowSalesTaskHorizonEnd(todayInput = getTodayDateKey()) {
  const anchorDate = todayInput > LEGALFLOW_SALES_START_DATE ? todayInput : LEGALFLOW_SALES_START_DATE;
  return addSalesBusinessDays(anchorDate, LEGALFLOW_SALES_FUTURE_BUSINESS_DAYS);
}

export function buildLegalFlowSalesTasks(todayInput = getTodayDateKey()) {
  const tasks: SalesTask[] = [];
  const endDate = getLegalFlowSalesTaskHorizonEnd(todayInput);
  const cursor = parseDateKey(LEGALFLOW_SALES_START_DATE);
  let businessDayIndex = 0;

  while (toDateKey(cursor) <= endDate) {
    if (isSalesBusinessDay(cursor)) {
      const dueDate = toDateKey(cursor);
      const definition = LEGALFLOW_SALES_TASK_SEEDS[businessDayIndex % LEGALFLOW_SALES_TASK_SEEDS.length];

      tasks.push({
        ...definition,
        id: `${definition.id}-${dueDate}`,
        dueDate,
        status: "pendiente"
      });

      businessDayIndex += 1;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return tasks;
}
