import { useEffect, useMemo, useRef, useState } from "react";
import {
  LEGALFLOW_SALES_PRODUCTS,
  type SalesDailyReport,
  type SalesDailyReportStore,
  type SalesOverview,
  type SalesProduct,
  type SalesProductId,
  type SalesStrategy,
  type SalesTask,
  type SalesTaskPriority,
  type SalesTaskStatus,
  type SalesTimeframe
} from "@sige/contracts";

import intellilawPldLogo from "../../assets/legalflow-intellilaw-pld-logo.png";
import minkaLogo from "../../assets/legalflow-minka-logo.png";
import rematesLogo from "../../assets/legalflow-remates-logo.png";
import startLogo from "../../assets/start-logo.jpg";
import { apiGet, apiPatch } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

type SalesProductView = SalesProduct & {
  logoSrc?: string;
};

const SALES_PRODUCT_LOGOS: Partial<Record<SalesProductId, string>> = {
  start: startLogo,
  pld: intellilawPldLogo,
  remates: rematesLogo,
  minka: minkaLogo
};

const SALES_PRODUCTS: SalesProductView[] = LEGALFLOW_SALES_PRODUCTS.map((product) => ({
  ...product,
  logoSrc: SALES_PRODUCT_LOGOS[product.id]
}));

const SALES_PRODUCT_BY_ID = SALES_PRODUCTS.reduce((lookup, product) => {
  lookup[product.id] = product;
  return lookup;
}, {} as Record<SalesProductId, SalesProductView>);

const SALES_TIMEFRAMES: Array<{ id: SalesTimeframe; label: string; colorClass: string }> = [
  { id: "anteriores", label: "Tareas realizadas", colorClass: "is-past" },
  { id: "hoy", label: "Tareas hoy", colorClass: "is-today" },
  { id: "manana", label: "Tareas manana", colorClass: "is-tomorrow" },
  { id: "posteriores", label: "Tareas posteriores", colorClass: "is-future" }
];

const SAVE_DEBOUNCE_MS = 650;

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

function buildEmptyDailyReportStore() {
  return SALES_PRODUCTS.reduce((store, product) => {
    store[product.id] = {};
    return store;
  }, {} as SalesDailyReportStore);
}

function buildPendingStrategy(productId: SalesProductId, content: string): SalesStrategy {
  return {
    id: `pending-${productId}`,
    productId,
    content,
    updatedAt: new Date().toISOString()
  };
}

function applyStrategy(overview: SalesOverview, strategy: SalesStrategy): SalesOverview {
  return {
    ...overview,
    strategies: {
      ...overview.strategies,
      [strategy.productId]: strategy
    }
  };
}

function applyDailyReport(overview: SalesOverview, report: SalesDailyReport): SalesOverview {
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
  const [selectedProductId, setSelectedProductId] = useState<SalesProductId>("start");
  const [selectedReportDate, setSelectedReportDate] = useState(getLocalDateInput);
  const [expandedView, setExpandedView] = useState<{ responsibleId: string; timeframe: SalesTimeframe } | null>({
    responsibleId: "IR",
    timeframe: "hoy"
  });
  const [overview, setOverview] = useState<SalesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingMessage, setSavingMessage] = useState<string | null>(null);
  const strategyTimers = useRef<Partial<Record<SalesProductId, number>>>({});
  const reportTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    let mounted = true;

    async function loadOverview() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const loaded = await apiGet<SalesOverview>("/sales/overview");
        if (mounted) {
          setOverview({
            ...loaded,
            dailyReports: {
              ...buildEmptyDailyReportStore(),
              ...loaded.dailyReports
            }
          });
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar ventas.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => () => {
    Object.values(strategyTimers.current).forEach((timer) => {
      if (timer) {
        window.clearTimeout(timer);
      }
    });
    Object.values(reportTimers.current).forEach((timer) => window.clearTimeout(timer));
  }, []);

  const selectedProduct = SALES_PRODUCT_BY_ID[selectedProductId];
  const today = getLocalDateInput();
  const salesTasks = overview?.tasks ?? [];
  const salesResponsibles = overview?.responsibles ?? [];
  const taskSeeds = overview?.taskSeeds ?? [];
  const strategies = overview?.strategies ?? SALES_PRODUCTS.reduce((result, product) => {
    result[product.id] = buildPendingStrategy(product.id, product.defaultStrategy);
    return result;
  }, {} as SalesOverview["strategies"]);
  const dailyReports = overview?.dailyReports ?? buildEmptyDailyReportStore();
  const openTaskCount = salesTasks.filter((task) => task.status !== "concluida").length;
  const salesPeriodicities = [...new Set(taskSeeds.map((task) => task.periodicity))];
  const dashboardProductCount = new Set(taskSeeds.map((task) => task.productId)).size;
  const canViewSuperadminSummary = canViewSalesSuperadminSummary(user);
  const selectedProductTasks = salesTasks.filter((task) => task.productId === selectedProductId);
  const selectedCompletedTasks = selectedProductTasks.filter(
    (task) => task.status === "concluida" && task.dueDate === selectedReportDate
  );
  const selectedDailyReport = dailyReports[selectedProduct.id]?.[selectedReportDate] ?? "";
  const selectedStrategy = strategies[selectedProduct.id]?.content ?? selectedProduct.defaultStrategy;

  const responsibleById = useMemo(() => new Map(salesResponsibles.map((responsible) => [responsible.id, responsible])), [salesResponsibles]);

  function updateOverviewWithStrategy(productId: SalesProductId, content: string) {
    setOverview((current) => current ? applyStrategy(current, {
      ...(current.strategies[productId] ?? buildPendingStrategy(productId, content)),
      content
    }) : current);
  }

  function updateOverviewWithDailyReport(productId: SalesProductId, date: string, content: string) {
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

  async function persistStrategy(productId: SalesProductId, content: string) {
    setSavingMessage("Guardando estrategia...");
    try {
      const saved = await apiPatch<SalesStrategy>(`/sales/strategies/${productId}`, { content });
      setOverview((current) => current ? applyStrategy(current, saved) : current);
      setSavingMessage(null);
    } catch (error) {
      setSavingMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar la estrategia.");
    }
  }

  async function persistDailyReport(productId: SalesProductId, date: string, content: string) {
    setSavingMessage("Guardando reporte diario...");
    try {
      const saved = await apiPatch<SalesDailyReport>(`/sales/daily-reports/${productId}/${date}`, { content });
      setOverview((current) => current ? applyDailyReport(current, saved) : current);
      setSavingMessage(null);
    } catch (error) {
      setSavingMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar el reporte diario.");
    }
  }

  function updateStrategy(productId: SalesProductId, value: string) {
    updateOverviewWithStrategy(productId, value);
    if (strategyTimers.current[productId]) {
      window.clearTimeout(strategyTimers.current[productId]);
    }
    strategyTimers.current[productId] = window.setTimeout(() => {
      void persistStrategy(productId, value);
    }, SAVE_DEBOUNCE_MS);
  }

  function updateDailyReport(productId: SalesProductId, date: string, value: string) {
    const key = `${productId}-${date}`;
    updateOverviewWithDailyReport(productId, date, value);
    if (reportTimers.current[key]) {
      window.clearTimeout(reportTimers.current[key]);
    }
    reportTimers.current[key] = window.setTimeout(() => {
      void persistDailyReport(productId, date, value);
    }, SAVE_DEBOUNCE_MS);
  }

  function buildRows(responsibleId: string, timeframe: SalesTimeframe) {
    return salesTasks
      .filter((task) => task.responsibleId === responsibleId)
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

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}
      {savingMessage ? <div className="message-banner message-success">{savingMessage}</div> : null}

      <section className="panel sales-dashboard-panel">
        <div className="panel-header">
          <h2>Dashboard comercial</h2>
          <span>{loading ? "Cargando..." : `${openTaskCount} tareas abiertas`}</span>
        </div>

        <div className="tasks-team-member-list sales-dashboard-list">
          {salesResponsibles.map((responsible) => {
            const isExpanded = expandedView?.responsibleId === responsible.id;
            const rows = isExpanded && expandedView ? buildRows(responsible.id, expandedView.timeframe) : [];

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
            <span>{taskSeeds.length} tareas configuradas</span>
          </div>

          <div className="sales-superadmin-metrics">
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
                {taskSeeds.map((task) => {
                  const product = SALES_PRODUCT_BY_ID[task.productId];
                  const responsible = responsibleById.get(task.responsibleId);

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
              value={selectedStrategy}
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
