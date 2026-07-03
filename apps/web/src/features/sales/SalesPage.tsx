import { useEffect, useMemo, useRef, useState } from "react";
import {
  LEGALFLOW_SALES_PRODUCTS,
  type SalesDailyReport,
  type SalesDailyReportStore,
  type SalesOverview,
  type SalesProduct,
  type SalesProductCreateInput,
  type SalesProductId,
  type SalesStrategy,
  type SalesTask,
  type SalesTaskPriority,
  type SalesTaskStatus,
  type SalesTimeframe
} from "@sige/contracts";

import intellilawPldLogo from "../../assets/legalflow-intellilaw-pld-logo.png";
import minkaLogo from "../../assets/legalflow-minka-logo.png";
import rematesLogo from "../../assets/legalflow-subastas-logo.png";
import startLogo from "../../assets/start-logo.jpg";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

type SalesProductView = SalesProduct & {
  logoSrc?: string;
};

type SalesProductFormState = {
  name: string;
  tagline: string;
  accentColor: string;
  defaultStrategy: string;
  defaultDailyReport: string;
  logoFile: File | null;
};

const STATIC_SALES_PRODUCT_LOGOS: Partial<Record<SalesProductId, string>> = {
  start: startLogo,
  pld: intellilawPldLogo,
  remates: rematesLogo,
  minka: minkaLogo
};

const DEFAULT_SALES_PRODUCTS: SalesProductView[] = LEGALFLOW_SALES_PRODUCTS.map(attachProductLogo);

const SALES_TIMEFRAMES: Array<{ id: SalesTimeframe; label: string; colorClass: string }> = [
  { id: "anteriores", label: "Tareas realizadas", colorClass: "is-past" },
  { id: "hoy", label: "Tareas hoy", colorClass: "is-today" },
  { id: "manana", label: "Tareas manana", colorClass: "is-tomorrow" },
  { id: "posteriores", label: "Tareas posteriores", colorClass: "is-future" }
];

const DEFAULT_PRODUCT_FORM: SalesProductFormState = {
  name: "",
  tagline: "",
  accentColor: "#2563eb",
  defaultStrategy: "",
  defaultDailyReport: "",
  logoFile: null
};

const SAVE_DEBOUNCE_MS = 650;

function attachProductLogo(product: SalesProduct): SalesProductView {
  return {
    ...product,
    logoSrc: product.logoDataUrl ?? STATIC_SALES_PRODUCT_LOGOS[product.id]
  };
}

function buildProductLookup(products: SalesProductView[]) {
  return products.reduce((lookup, product) => {
    lookup[product.id] = product;
    return lookup;
  }, {} as Record<SalesProductId, SalesProductView>);
}

function buildEmptyDailyReportStore(products: SalesProduct[] = DEFAULT_SALES_PRODUCTS) {
  return products.reduce((store, product) => {
    store[product.id] = {};
    return store;
  }, {} as SalesDailyReportStore);
}

function normalizeOverview(overview: SalesOverview): SalesOverview {
  return {
    ...overview,
    archivedProducts: overview.archivedProducts ?? [],
    dailyReports: {
      ...buildEmptyDailyReportStore(overview.products),
      ...overview.dailyReports
    }
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
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

function canManageSalesProducts(user?: {
  role?: string;
  legacyRole?: string;
  permissions?: string[];
} | null) {
  return canViewSalesSuperadminSummary(user) || Boolean(user?.permissions?.includes("sales:write"));
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
  const [showCreateProductForm, setShowCreateProductForm] = useState(false);
  const [productForm, setProductForm] = useState<SalesProductFormState>(DEFAULT_PRODUCT_FORM);
  const strategyTimers = useRef<Partial<Record<SalesProductId, number>>>({});
  const reportTimers = useRef<Record<string, number>>({});

  async function refreshOverview(nextSelectedProductId?: SalesProductId) {
    setLoading(true);
    setErrorMessage(null);

    try {
      const loaded = normalizeOverview(await apiGet<SalesOverview>("/sales/overview"));
      setOverview(loaded);
      if (nextSelectedProductId) {
        setSelectedProductId(nextSelectedProductId);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar ventas.");
    } finally {
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

  const salesProducts = useMemo(
    () => (overview?.products ?? DEFAULT_SALES_PRODUCTS).map(attachProductLogo),
    [overview]
  );
  const archivedProducts = useMemo(
    () => (overview?.archivedProducts ?? []).map(attachProductLogo),
    [overview]
  );
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
  }, {} as SalesOverview["strategies"]);
  const dailyReports = overview?.dailyReports ?? buildEmptyDailyReportStore(salesProducts);
  const openTaskCount = salesTasks.filter((task) => task.status !== "concluida").length;
  const salesPeriodicities = [...new Set(taskSeeds.map((task) => task.periodicity))];
  const dashboardProductCount = new Set(taskSeeds.map((task) => task.productId)).size;
  const canViewSuperadminSummary = canViewSalesSuperadminSummary(user);
  const canManageProducts = canManageSalesProducts(user);
  const selectedProductTasks = selectedProduct ? salesTasks.filter((task) => task.productId === selectedProduct.id) : [];
  const selectedCompletedTasks = selectedProductTasks.filter(
    (task) => task.status === "concluida" && task.dueDate === selectedReportDate
  );
  const selectedDailyReport = selectedProduct ? dailyReports[selectedProduct.id]?.[selectedReportDate] ?? "" : "";
  const selectedStrategy = selectedProduct ? strategies[selectedProduct.id]?.content ?? selectedProduct.defaultStrategy : "";

  const responsibleById = useMemo(() => new Map(salesResponsibles.map((responsible) => [responsible.id, responsible])), [salesResponsibles]);

  function updateProductForm(field: keyof SalesProductFormState, value: string | File | null) {
    setProductForm((current) => ({
      ...current,
      [field]: value
    }));
  }

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
      const saved = await apiPatch<SalesStrategy>(`/sales/strategies/${encodeURIComponent(productId)}`, { content });
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
      const saved = await apiPatch<SalesDailyReport>(`/sales/daily-reports/${encodeURIComponent(productId)}/${date}`, { content });
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

  async function handleCreateProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingMessage("Creando producto...");
    setErrorMessage(null);

    try {
      const logoBase64 = productForm.logoFile ? await readFileAsDataUrl(productForm.logoFile) : undefined;
      const payload: SalesProductCreateInput = {
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
      const created = await apiPost<SalesProduct>("/sales/products", payload);
      setProductForm(DEFAULT_PRODUCT_FORM);
      setShowCreateProductForm(false);
      setSavingMessage(null);
      await refreshOverview(created.id);
    } catch (error) {
      setSavingMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "No se pudo dar de alta el producto.");
    }
  }

  async function handleArchiveProduct(product: SalesProductView) {
    if (!window.confirm(`Archivar ${product.name}? Sus funciones y tareas quedaran suspendidas.`)) {
      return;
    }

    setSavingMessage("Archivando producto...");
    setErrorMessage(null);

    try {
      await apiPatch<SalesProduct>(`/sales/products/${encodeURIComponent(product.id)}/archive`, {});
      const fallbackProductId = salesProducts.find((candidate) => candidate.id !== product.id)?.id;
      setSavingMessage(null);
      await refreshOverview(fallbackProductId);
    } catch (error) {
      setSavingMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "No se pudo archivar el producto.");
    }
  }

  async function handleReactivateProduct(product: SalesProductView) {
    setSavingMessage("Reactivando producto...");
    setErrorMessage(null);

    try {
      const reactivated = await apiPatch<SalesProduct>(`/sales/products/${encodeURIComponent(product.id)}/reactivate`, {});
      setSavingMessage(null);
      await refreshOverview(reactivated.id);
    } catch (error) {
      setSavingMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "No se pudo reactivar el producto.");
    }
  }

  async function handleDeleteProduct(product: SalesProductView) {
    if (!window.confirm(`Eliminar definitivamente ${product.name}? Se borraran su estrategia y reportes diarios de este tenant.`)) {
      return;
    }

    setSavingMessage("Eliminando producto...");
    setErrorMessage(null);

    try {
      await apiDelete(`/sales/products/${encodeURIComponent(product.id)}`);
      setSavingMessage(null);
      await refreshOverview();
    } catch (error) {
      setSavingMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "No se pudo eliminar el producto.");
    }
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
                              const product = productById[task.productId];
                              if (!product) {
                                return null;
                              }

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
                  const product = productById[task.productId];
                  const responsible = responsibleById.get(task.responsibleId);

                  return (
                    <tr key={`summary-${task.id}`}>
                      <td>{task.company}</td>
                      <td>
                        <span className="sales-product-cell">
                          <span className="sales-product-dot" style={{ background: product?.accentColor ?? "#2563eb" }} />
                          {product?.name ?? task.productId}
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

      <section className="panel sales-products-panel">
        <div className="panel-header">
          <div>
            <h2>Productos</h2>
            <span>{salesProducts.length} productos activos</span>
          </div>
          {canManageProducts ? (
            <button type="button" className="primary-button" onClick={() => setShowCreateProductForm((current) => !current)}>
              Dar de alta producto
            </button>
          ) : null}
        </div>

        {showCreateProductForm && canManageProducts ? (
          <form className="sales-product-form" onSubmit={handleCreateProduct}>
            <div className="sales-product-form-grid">
              <label className="form-field">
                <span>Nombre</span>
                <input
                  value={productForm.name}
                  onChange={(event) => updateProductForm("name", event.target.value)}
                  required
                />
              </label>
              <label className="form-field">
                <span>Color</span>
                <input
                  type="color"
                  value={productForm.accentColor}
                  onChange={(event) => updateProductForm("accentColor", event.target.value)}
                />
              </label>
              <label className="form-field sales-product-form-wide">
                <span>Descripcion breve</span>
                <input
                  value={productForm.tagline}
                  onChange={(event) => updateProductForm("tagline", event.target.value)}
                />
              </label>
              <label className="form-field sales-product-form-wide">
                <span>Logo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => updateProductForm("logoFile", event.target.files?.[0] ?? null)}
                />
              </label>
              <label className="form-field sales-copy-field">
                <span>Estrategia inicial</span>
                <textarea
                  value={productForm.defaultStrategy}
                  onChange={(event) => updateProductForm("defaultStrategy", event.target.value)}
                />
              </label>
              <label className="form-field sales-copy-field">
                <span>Guia de reporte diario</span>
                <textarea
                  value={productForm.defaultDailyReport}
                  onChange={(event) => updateProductForm("defaultDailyReport", event.target.value)}
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={() => {
                setProductForm(DEFAULT_PRODUCT_FORM);
                setShowCreateProductForm(false);
              }}>
                Cancelar
              </button>
              <button type="submit" className="primary-button">
                Crear producto
              </button>
            </div>
          </form>
        ) : null}

        <div className="sales-product-grid">
          {salesProducts.length === 0 ? (
            <p className="centered-inline-message sales-empty-report">No hay productos activos.</p>
          ) : (
            salesProducts.map((product) => {
              const productOpenTasks = salesTasks.filter((task) => task.productId === product.id && task.status !== "concluida").length;
              const isSelected = selectedProduct?.id === product.id;

              return (
                <article key={product.id} className={`sales-product-card ${isSelected ? "is-selected" : ""}`}>
                  <button
                    type="button"
                    className="sales-product-card-main"
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
                  {canManageProducts ? (
                    <div className="sales-product-card-actions">
                      <button type="button" className="secondary-button matter-inline-button" onClick={() => void handleArchiveProduct(product)}>
                        Archivar
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </section>

      {archivedProducts.length > 0 ? (
        <section className="panel sales-products-panel">
          <div className="panel-header">
            <div>
              <h2>Archivo</h2>
              <span>{archivedProducts.length} productos archivados</span>
            </div>
          </div>

          <div className="sales-product-grid">
            {archivedProducts.map((product) => (
              <article key={product.id} className="sales-product-card is-archived">
                <div className="sales-product-card-main">
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
                    <span className="sales-product-task-summary is-archived">Archivado</span>
                  </span>
                </div>
                {canManageProducts || canViewSuperadminSummary ? (
                  <div className="sales-product-card-actions">
                    {canManageProducts ? (
                      <button type="button" className="secondary-button matter-inline-button" onClick={() => void handleReactivateProduct(product)}>
                        Reactivar
                      </button>
                    ) : null}
                    {canViewSuperadminSummary ? (
                    <button type="button" className="danger-button matter-inline-button" onClick={() => void handleDeleteProduct(product)}>
                      Eliminar
                    </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {selectedProduct ? (
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
      ) : null}
    </section>
  );
}
