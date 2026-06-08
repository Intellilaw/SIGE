import { useMemo, useState } from "react";

import intellilawPldLogo from "../../assets/legalflow-intellilaw-pld-logo.png";
import minkaLogo from "../../assets/legalflow-minka-logo.png";
import rematesLogo from "../../assets/legalflow-remates-logo.png";
import startLogo from "../../assets/start-logo.jpg";
import { useAuth } from "../auth/AuthContext";

type SalesProductId = "start" | "pld" | "remates" | "minka";
type SalesTimeframe = "anteriores" | "hoy" | "manana" | "posteriores";
type SalesTaskStatus = "pendiente" | "en_proceso" | "concluida";
type SalesTaskPriority = "alta" | "media" | "normal";
type SalesCompany = "LegalFlow";

interface SalesProduct {
  id: SalesProductId;
  name: string;
  tagline: string;
  initials: string;
  accentColor: string;
  logoSrc?: string;
  logoAlt: string;
  defaultStrategy: string;
  defaultDailyReport: string;
}

interface SalesResponsible {
  id: string;
  name: string;
}

interface SalesTaskSeed {
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

interface SalesTask extends Omit<SalesTaskSeed, "firstDueDate"> {
  dueDate: string;
  status: SalesTaskStatus;
}

type SalesDailyReportStore = Record<SalesProductId, Record<string, string>>;

const SALES_PRODUCTS: SalesProduct[] = [
  {
    id: "start",
    name: "Start",
    tagline: "Producto de apertura para nuevos clientes de LegalFlow.",
    initials: "ST",
    accentColor: "#2563eb",
    logoSrc: startLogo,
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
    logoSrc: intellilawPldLogo,
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
    logoSrc: rematesLogo,
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
    logoSrc: minkaLogo,
    logoAlt: "Minka by LegalFlow",
    defaultStrategy:
      "Delimitar casos de uso contractuales, promesas de eficiencia, perfil de usuarios juridicos, mensajes de confianza y secuencia de demostracion para Minka.",
    defaultDailyReport:
      "Registrar despachos y equipos legales contactados, demos agendadas, contratos analizados, dudas sobre IA y siguientes acciones comerciales."
  }
];

const SALES_RESPONSIBLES: SalesResponsible[] = [
  { id: "IR", name: "Itari Romero" }
];

const SALES_TIMEFRAMES: Array<{ id: SalesTimeframe; label: string; colorClass: string }> = [
  { id: "anteriores", label: "Tareas realizadas", colorClass: "is-past" },
  { id: "hoy", label: "Tareas hoy", colorClass: "is-today" },
  { id: "manana", label: "Tareas manana", colorClass: "is-tomorrow" },
  { id: "posteriores", label: "Tareas posteriores", colorClass: "is-future" }
];

const LEGALFLOW_SALES_START_DATE = "2026-06-08";
const LEGALFLOW_SALES_FUTURE_BUSINESS_DAYS = 20;

const SALES_TASK_SEEDS: SalesTaskSeed[] = [
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
    firstDueDate: addBusinessDays(LEGALFLOW_SALES_START_DATE, 1)
  }
];

const DEFAULT_STRATEGIES = SALES_PRODUCTS.reduce((defaults, product) => {
  defaults[product.id] = product.defaultStrategy;
  return defaults;
}, {} as Record<SalesProductId, string>);

const DAILY_REPORT_STORAGE_KEY = "sige-sales-daily-reports";

const SALES_PRODUCT_BY_ID = SALES_PRODUCTS.reduce((lookup, product) => {
  lookup[product.id] = product;
  return lookup;
}, {} as Record<SalesProductId, SalesProduct>);

const SALES_RESPONSIBLE_BY_ID = SALES_RESPONSIBLES.reduce((lookup, responsible) => {
  lookup[responsible.id] = responsible;
  return lookup;
}, {} as Record<string, SalesResponsible>);

function getLocalDateInput(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);

  return toDateInput(date);
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(12, 0, 0, 0);

  return date;
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateInput(value: string) {
  const date = parseDateInput(value);

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short"
  }).format(date);
}

function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function addBusinessDays(value: string, days: number) {
  const date = parseDateInput(value);
  let remainingDays = days;

  while (remainingDays > 0) {
    date.setDate(date.getDate() + 1);
    if (isBusinessDay(date)) {
      remainingDays -= 1;
    }
  }

  return toDateInput(date);
}

function getSalesTaskHorizonEnd(todayInput: string) {
  const anchorDate = todayInput > LEGALFLOW_SALES_START_DATE ? todayInput : LEGALFLOW_SALES_START_DATE;
  return addBusinessDays(anchorDate, LEGALFLOW_SALES_FUTURE_BUSINESS_DAYS);
}

function buildLegalFlowSalesTasks(todayInput = getLocalDateInput()) {
  const tasks: SalesTask[] = [];
  const endDate = getSalesTaskHorizonEnd(todayInput);
  const cursor = parseDateInput(LEGALFLOW_SALES_START_DATE);
  let businessDayIndex = 0;

  while (toDateInput(cursor) <= endDate) {
    if (isBusinessDay(cursor)) {
      const dueDate = toDateInput(cursor);
      const definition = SALES_TASK_SEEDS[businessDayIndex % SALES_TASK_SEEDS.length];

      tasks.push({
        ...definition,
        id: `${definition.id}-${dueDate}`,
        dueDate,
        status: "pendiente"
      });

      businessDayIndex += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return tasks;
}

function readStoredTextMap(storageKey: string, defaults: Record<SalesProductId, string>) {
  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Partial<Record<SalesProductId, string>>;

    return SALES_PRODUCTS.reduce((result, product) => {
      result[product.id] = stored[product.id] ?? defaults[product.id];
      return result;
    }, {} as Record<SalesProductId, string>);
  } catch {
    return defaults;
  }
}

function buildDefaultDailyReportStore(date = getLocalDateInput()) {
  return SALES_PRODUCTS.reduce((defaults, product) => {
    defaults[product.id] = {
      [date]: product.defaultDailyReport
    };
    return defaults;
  }, {} as SalesDailyReportStore);
}

function readStoredDailyReportStore(storageKey: string) {
  const fallback = buildDefaultDailyReportStore();

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Partial<
      Record<SalesProductId, string | Record<string, string>>
    >;

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
    }, {} as SalesDailyReportStore);
  } catch {
    return fallback;
  }
}

function writeStoredDailyReportStore(storageKey: string, value: SalesDailyReportStore) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Local persistence is a convenience layer; the screen remains usable if storage is blocked.
  }
}

function writeStoredTextMap(storageKey: string, value: Record<SalesProductId, string>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Local persistence is a convenience layer; the screen remains usable if storage is blocked.
  }
}

function belongsToTimeframe(task: SalesTask, timeframe: SalesTimeframe) {
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

function getStatusLabel(status: SalesTaskStatus) {
  if (status === "concluida") {
    return "Completada";
  }

  if (status === "en_proceso") {
    return "En proceso";
  }

  return "Pendiente";
}

function getPriorityLabel(priority: SalesTaskPriority) {
  if (priority === "alta") {
    return "Alta";
  }

  if (priority === "media") {
    return "Media";
  }

  return "Normal";
}

function canViewSalesSuperadminSummary(user?: {
  role?: string;
  legacyRole?: string;
  permissions?: string[];
} | null) {
  return Boolean(user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN" || user?.permissions?.includes("*"));
}

export function SalesPage() {
  const { user } = useAuth();
  const [selectedProductId, setSelectedProductId] = useState<SalesProductId>("start");
  const [selectedReportDate, setSelectedReportDate] = useState(getLocalDateInput);
  const [expandedView, setExpandedView] = useState<{ responsibleId: string; timeframe: SalesTimeframe } | null>({
    responsibleId: "IR",
    timeframe: "hoy"
  });
  const [strategies, setStrategies] = useState(() => readStoredTextMap("sige-sales-strategies", DEFAULT_STRATEGIES));
  const [dailyReports, setDailyReports] = useState(() => readStoredDailyReportStore(DAILY_REPORT_STORAGE_KEY));

  const salesTasks = useMemo<SalesTask[]>(
    () => buildLegalFlowSalesTasks(),
    []
  );

  const selectedProduct = SALES_PRODUCT_BY_ID[selectedProductId];
  const today = getLocalDateInput();
  const openTaskCount = salesTasks.filter((task) => task.status !== "concluida").length;
  const salesPeriodicities = [...new Set(SALES_TASK_SEEDS.map((task) => task.periodicity))];
  const dashboardProductCount = new Set(SALES_TASK_SEEDS.map((task) => task.productId)).size;
  const canViewSuperadminSummary = canViewSalesSuperadminSummary(user);
  const selectedProductTasks = salesTasks.filter((task) => task.productId === selectedProductId);
  const selectedCompletedTasks = selectedProductTasks.filter(
    (task) => task.status === "concluida" && task.dueDate === selectedReportDate
  );
  const selectedDailyReport = dailyReports[selectedProduct.id]?.[selectedReportDate] ?? "";

  function updateStrategy(productId: SalesProductId, value: string) {
    setStrategies((current) => {
      const next = { ...current, [productId]: value };
      writeStoredTextMap("sige-sales-strategies", next);
      return next;
    });
  }

  function updateDailyReport(productId: SalesProductId, date: string, value: string) {
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

  function buildRows(responsible: SalesResponsible, timeframe: SalesTimeframe) {
    return salesTasks
      .filter((task) => task.responsibleId === responsible.id)
      .filter((task) => belongsToTimeframe(task, timeframe))
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  }

  return (
    <section className="page-stack sales-page">
      <header className="hero module-hero sales-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon sales-hero-icon" aria-hidden="true">
            Ventas
          </span>
          <div>
            <h2>Ventas</h2>
          </div>
        </div>
        <p className="muted">
          Productos comerciales, estrategia de marketing y reporte diario con tablero unico de Itari Romero.
        </p>
      </header>

      <section className="panel sales-dashboard-panel">
        <div className="panel-header">
          <h2>Dashboard comercial</h2>
          <span>{openTaskCount} tareas abiertas</span>
        </div>

        <div className="tasks-team-member-list sales-dashboard-list">
          {SALES_RESPONSIBLES.map((responsible) => {
            const isExpanded = expandedView?.responsibleId === responsible.id;
            const rows = isExpanded && expandedView ? buildRows(responsible, expandedView.timeframe) : [];

            return (
              <article key={responsible.id} className="tasks-team-member-card sales-responsible-card">
                <div className="tasks-team-member-head">
                  <h3>{responsible.name}</h3>
                  <span>{responsible.id}</span>
                </div>

                <div className="tasks-team-timeframes">
                  {SALES_TIMEFRAMES.map((timeframe) => {
                    const isActive = expandedView?.responsibleId === responsible.id && expandedView.timeframe === timeframe.id;

                    return (
                      <button
                        key={timeframe.id}
                        type="button"
                        className={`tasks-team-timeframe-button ${timeframe.colorClass} ${isActive ? "is-active" : ""}`}
                        onClick={() =>
                          setExpandedView((current) =>
                            current?.responsibleId === responsible.id && current?.timeframe === timeframe.id
                              ? null
                              : { responsibleId: responsible.id, timeframe: timeframe.id }
                          )
                        }
                      >
                        {timeframe.label}
                      </button>
                    );
                  })}
                </div>

                {isExpanded && expandedView ? (
                  <div className="tasks-team-timeframe-panel">
                    <div className="panel-header">
                      <h3>{SALES_TIMEFRAMES.find((timeframe) => timeframe.id === expandedView.timeframe)?.label ?? "Detalle"}</h3>
                      <span>{rows.length} tareas</span>
                    </div>

                    <div className="table-scroll">
                      <table className="data-table tasks-dashboard-table sales-dashboard-table">
                        <thead>
                          <tr>
                            <th>Producto</th>
                            <th>Tarea</th>
                            <th>Canal</th>
                            <th>Prioridad</th>
                            <th>Fecha</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="centered-inline-message">
                                No hay tareas en esta categoria.
                              </td>
                            </tr>
                          ) : (
                            rows.map((task) => {
                              const product = SALES_PRODUCT_BY_ID[task.productId];
                              const highlighted = task.status !== "concluida" && task.dueDate <= today;

                              return (
                                <tr key={task.id} className={highlighted ? "tasks-dashboard-row-overdue" : undefined}>
                                  <td>
                                    <span className="sales-product-cell">
                                      <span className="sales-product-dot" style={{ background: product.accentColor }} />
                                      {product.name}
                                    </span>
                                  </td>
                                  <td className={highlighted ? "tasks-dashboard-title-overdue" : undefined}>{task.task}</td>
                                  <td>{task.channel}</td>
                                  <td>
                                    <span className={`sales-priority-pill is-${task.priority}`}>{getPriorityLabel(task.priority)}</span>
                                  </td>
                                  <td>{formatDateInput(task.dueDate)}</td>
                                  <td>
                                    <span className={`tasks-dashboard-type-pill ${task.status === "concluida" ? "is-completed" : highlighted ? "is-overdue" : "is-pending"}`}>
                                      {getStatusLabel(task.status)}
                                    </span>
                                  </td>
                                  <td>
                                    <button type="button" className="secondary-button matter-inline-button" onClick={() => setSelectedProductId(task.productId)}>
                                      Ver producto
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {canViewSuperadminSummary ? (
        <section className="panel sales-superadmin-panel" aria-label="Consulta superadmin de tareas de ventas">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Consulta superadmin</p>
              <h2>Tareas reflejadas en dashboard</h2>
            </div>
            <span>{SALES_TASK_SEEDS.length} tareas configuradas</span>
          </div>

          <div className="sales-superadmin-metrics">
            <div className="sales-superadmin-metric">
              <span>Empresa</span>
              <strong>LegalFlow</strong>
            </div>
            <div className="sales-superadmin-metric">
              <span>Responsable</span>
              <strong>Itari Romero (IR)</strong>
            </div>
            <div className="sales-superadmin-metric">
              <span>Productos activos</span>
              <strong>{dashboardProductCount}</strong>
            </div>
            <div className="sales-superadmin-metric">
              <span>Periodicidades</span>
              <strong>{salesPeriodicities.join(" / ")}</strong>
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table sales-superadmin-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Producto</th>
                  <th>Tarea</th>
                  <th>Periodicidad</th>
                  <th>Responsable</th>
                  <th>Inicio en dashboard</th>
                  <th>Prioridad</th>
                  <th>Canal</th>
                </tr>
              </thead>
              <tbody>
                {SALES_TASK_SEEDS.map((task) => {
                  const product = SALES_PRODUCT_BY_ID[task.productId];
                  const responsible = SALES_RESPONSIBLE_BY_ID[task.responsibleId];

                  return (
                    <tr key={`summary-${task.id}`}>
                      <td>{task.company}</td>
                      <td>
                        <span className="sales-product-cell">
                          <span className="sales-product-dot" style={{ background: product.accentColor }} />
                          {product.name}
                        </span>
                      </td>
                      <td>{task.task}</td>
                      <td>
                        <span className="sales-periodicity-pill">{task.periodicity}</span>
                      </td>
                      <td>{responsible ? `${responsible.name} (${responsible.id})` : task.responsibleId}</td>
                      <td>{formatDateInput(task.firstDueDate)}</td>
                      <td>{getPriorityLabel(task.priority)}</td>
                      <td>{task.channel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <h2>Productos</h2>
          <span>{SALES_PRODUCTS.length} productos</span>
        </div>

        <div className="sales-product-grid">
          {SALES_PRODUCTS.map((product) => {
            const productOpenTasks = salesTasks.filter((task) => task.productId === product.id && task.status !== "concluida").length;
            const isSelected = selectedProductId === product.id;

            return (
              <button
                key={product.id}
                type="button"
                className={`sales-product-card ${isSelected ? "is-selected" : ""}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedProductId(product.id)}
              >
                <span className="sales-product-logo-shell">
                  {product.logoSrc ? (
                    <img src={product.logoSrc} alt={product.logoAlt} />
                  ) : (
                    <span className="sales-product-monogram" style={{ color: product.accentColor }}>
                      {product.initials}
                    </span>
                  )}
                </span>
                <span className="sales-product-card-copy">
                  <strong>{product.name}</strong>
                  <span>{product.tagline}</span>
                  <span className="sales-product-task-summary">{productOpenTasks} tareas abiertas</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="sales-product-detail-grid" aria-label={`Detalle de ${selectedProduct.name}`}>
        <article className="panel sales-product-panel">
          <div className="sales-selected-product-head">
            <span className="sales-selected-product-logo" style={{ borderColor: selectedProduct.accentColor }}>
              {selectedProduct.logoSrc ? (
                <img src={selectedProduct.logoSrc} alt={selectedProduct.logoAlt} />
              ) : (
                <span style={{ color: selectedProduct.accentColor }}>{selectedProduct.initials}</span>
              )}
            </span>
            <div>
              <p className="eyebrow">Producto</p>
              <h2>{selectedProduct.name}</h2>
              <p className="muted">{selectedProduct.tagline}</p>
            </div>
          </div>

          <label className="form-field sales-copy-field">
            <span>Estrategia general de marketing</span>
            <textarea
              value={strategies[selectedProduct.id]}
              onChange={(event) => updateStrategy(selectedProduct.id, event.target.value)}
            />
          </label>
        </article>

        <article className="panel sales-product-panel">
          <div className="panel-header">
            <h2>Reporte diario de tareas realizadas</h2>
            <span>{formatDateInput(selectedReportDate)}</span>
          </div>

          <label className="form-field sales-date-field">
            <span>Fecha del reporte</span>
            <input
              type="date"
              value={selectedReportDate}
              max={today}
              onChange={(event) => setSelectedReportDate(event.target.value)}
            />
          </label>

          <label className="form-field sales-copy-field">
            <span>Bitacora diaria</span>
            <textarea
              value={selectedDailyReport}
              placeholder={selectedProduct.defaultDailyReport}
              onChange={(event) => updateDailyReport(selectedProduct.id, selectedReportDate, event.target.value)}
            />
          </label>

          <div className="sales-report-list">
            {selectedCompletedTasks.length === 0 ? (
              <p className="centered-inline-message sales-empty-report">No hay tareas realizadas registradas para este producto.</p>
            ) : (
              selectedCompletedTasks.map((task) => (
                <div key={task.id} className="sales-report-entry">
                  <strong>{task.task}</strong>
                  <span>{task.channel}</span>
                  <small>{formatDateInput(task.dueDate)}</small>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </section>
  );
}
