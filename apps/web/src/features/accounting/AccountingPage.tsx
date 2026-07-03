import { useEffect, useMemo, useState } from "react";
import type {
  AccountingAccount,
  AccountingAutomationResult,
  AccountingCatalogXmlImportResult,
  AccountingCatalogXmlPreviewResult,
  AccountingCfdiUploadResult,
  AccountingCreateAccountInput,
  AccountingJournalEntryInput,
  AccountingOverview,
  AccountingXmlExportResult
} from "@sige/contracts";

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
const XML_FORMATS: Array<{ value: AccountingXmlExportResult["format"]; label: string }> = [
  { value: "CATALOGO", label: "Catalogo" },
  { value: "BALANZA", label: "Balanza" },
  { value: "POLIZAS", label: "Polizas" },
  { value: "AUXILIAR_CUENTAS", label: "Auxiliar cuentas" },
  { value: "AUXILIAR_FOLIOS", label: "Auxiliar folios" }
];

type AccountingTab = "summary" | "catalog" | "entries" | "cfdi" | "reports" | "sat";
type CatalogVisibility = "ACTIVE" | "ALL" | "INACTIVE" | "MISSING_SAT";

interface JournalLineDraft {
  id: string;
  accountId: string;
  description: string;
  debitMxn: string;
  creditMxn: string;
}

function getMonthName(month: number) {
  return MONTH_NAMES[month - 1] ?? `Mes ${month}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function parseMoney(value: string) {
  const numeric = Number(value.replace(/[$,\s]/g, "") || 0);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Ocurrio un error inesperado.";
}

function createLineDraft(): JournalLineDraft {
  return {
    id: `line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    accountId: "",
    description: "",
    debitMxn: "",
    creditMxn: ""
  };
}

async function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function downloadXml(result: AccountingXmlExportResult) {
  const blob = new Blob([result.content], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function getActiveAccounts(accounts: AccountingAccount[]) {
  return accounts.filter((account) => account.isActive);
}

function getCatalogActionLabel(action: AccountingCatalogXmlPreviewResult["accounts"][number]["action"]) {
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
  const [activeTab, setActiveTab] = useState<AccountingTab>("summary");
  const [overview, setOverview] = useState<AccountingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState({ companyRfc: "", legalName: "" });
  const [accountDraft, setAccountDraft] = useState<AccountingCreateAccountInput>({
    code: "",
    name: "",
    type: "ASSET",
    nature: "DEBIT",
    satGroupingCode: ""
  });
  const [catalogVisibility, setCatalogVisibility] = useState<CatalogVisibility>("ACTIVE");
  const [replaceActiveCatalog, setReplaceActiveCatalog] = useState(false);
  const [catalogXmlPayload, setCatalogXmlPayload] = useState<{ originalFileName: string; xmlBase64: string } | null>(null);
  const [catalogXmlPreview, setCatalogXmlPreview] = useState<AccountingCatalogXmlPreviewResult | null>(null);
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
      const response = await apiGet<AccountingOverview>(`/accounting/overview?year=${selectedYear}&month=${selectedMonth}`);
      setOverview(response);
      setSettingsDraft({
        companyRfc: response.settings.companyRfc ?? "",
        legalName: response.settings.legalName ?? ""
      });
      if (!openingDraft.accountId && response.accounts.length > 0) {
        setOpeningDraft((current) => ({ ...current, accountId: response.accounts[0].id }));
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
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

  async function runAction(action: () => Promise<void>, successMessage: string) {
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
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
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

  async function previewCatalogXml(files: FileList | null) {
    if (!canWrite || !files || files.length === 0) {
      return;
    }

    const file = files[0];
    setBusy(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const xmlBase64 = await readFileAsBase64(file);
      const result = await apiPost<AccountingCatalogXmlPreviewResult>("/accounting/catalog/xml/preview", {
        originalFileName: file.name,
        xmlBase64,
        replaceActiveCatalog
      });
      setCatalogXmlPayload({ originalFileName: file.name, xmlBase64 });
      setCatalogXmlPreview(result);
      setMessage(`Vista previa lista: ${result.summary.create} nuevas, ${result.summary.update} por actualizar, ${result.summary.errors} con error.`);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
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
      const result = await apiPost<AccountingCatalogXmlImportResult>("/accounting/catalog/xml/import", {
        ...catalogXmlPayload,
        replaceActiveCatalog,
        confirm: true
      });
      setCatalogXmlPayload(null);
      setCatalogXmlPreview(null);
      setMessage(`Catalogo importado: ${result.preview.summary.create} creadas, ${result.preview.summary.update} actualizadas, ${result.deactivated} desactivadas.`);
      await loadOverview();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
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
      } satisfies AccountingJournalEntryInput);
      setEntryDraft({
        entryDate: `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`,
        description: "",
        lines: [createLineDraft(), createLineDraft()]
      });
    }, "Poliza manual creada.");
  }

  async function uploadCfdiFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    await runAction(async () => {
      const payload = await Promise.all(Array.from(files).map(async (file) => ({
        originalFileName: file.name,
        xmlBase64: await readFileAsBase64(file)
      })));
      const result = await apiPost<AccountingCfdiUploadResult>("/accounting/cfdi/upload", { files: payload });
      setMessage(`CFDI importados: ${result.imported.length}. Duplicados: ${result.duplicates.length}. Errores: ${result.errors.length}.`);
    }, "Carga masiva procesada.");
  }

  async function generateAutomaticEntries() {
    await runAction(async () => {
      const result = await apiPost<AccountingAutomationResult>("/accounting/generate-automatic", {
        year: selectedYear,
        month: selectedMonth
      });
      setMessage(`Polizas generadas: ${result.created.length}. Pendientes: ${result.skipped.length}.`);
    }, "Generacion automatica terminada.");
  }

  async function exportXml(format: AccountingXmlExportResult["format"]) {
    await runAction(async () => {
      const result = await apiPost<AccountingXmlExportResult>("/accounting/sat-xml", {
        year: selectedYear,
        month: selectedMonth,
        format
      });
      downloadXml(result);
    }, "XML generado.");
  }

  function updateEntryLine(lineId: string, patch: Partial<JournalLineDraft>) {
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

  return (
    <section className="page-stack accounting-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">{"\u{1F9FE}"}</span>
          <div>
            <h2>Contabilidad</h2>
          </div>
        </div>
        <p className="muted">Catalogo, polizas, CFDI, auxiliares, balanza y XML SAT por empresa.</p>
      </header>

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}
      {message ? <div className="message-banner message-success">{message}</div> : null}

      <section className="panel">
        <div className="finance-toolbar">
          <div className="finance-toolbar-group">
            <label className="form-field">
              <span>Ano</span>
              <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                {YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>Mes</span>
              <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                  <option key={month} value={month}>{getMonthName(month)}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="accounting-toolbar-actions">
            <button className="secondary-button" type="button" onClick={() => void loadOverview()} disabled={loading || busy}>
              Actualizar
            </button>
            <button className="primary-button" type="button" onClick={() => void generateAutomaticEntries()} disabled={!canWrite || busy}>
              Generar automaticas
            </button>
          </div>
        </div>
      </section>

      <section className="panel finance-tabs-panel">
        <div className="finance-tabs">
          {[
            ["summary", "Resumen"],
            ["catalog", "Catalogo"],
            ["entries", "Polizas"],
            ["cfdi", "CFDI"],
            ["reports", "Reportes"],
            ["sat", "XML SAT"]
          ].map(([tab, label]) => (
            <button
              key={tab}
              className={`finance-tab ${activeTab === tab ? "is-active" : ""}`}
              type="button"
              onClick={() => setActiveTab(tab as AccountingTab)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {loading || !overview ? (
        <section className="panel">
          <p className="muted">Cargando contabilidad...</p>
        </section>
      ) : null}

      {!loading && overview && activeTab === "summary" ? (
        <>
          <section className="accounting-metric-grid">
            <article className="accounting-metric">
              <span>Activos</span>
              <strong>{formatCurrency(overview.totals.assetsMxn)}</strong>
            </article>
            <article className="accounting-metric">
              <span>Pasivos</span>
              <strong>{formatCurrency(overview.totals.liabilitiesMxn)}</strong>
            </article>
            <article className="accounting-metric">
              <span>Capital</span>
              <strong>{formatCurrency(overview.totals.equityMxn)}</strong>
            </article>
            <article className="accounting-metric">
              <span>Resultado</span>
              <strong>{formatCurrency(overview.totals.netIncomeMxn)}</strong>
            </article>
          </section>

          <section className="accounting-grid-two">
            <article className="panel accounting-compact-panel">
              <div className="panel-header">
                <h2>Configuracion fiscal</h2>
                <span>{overview.settings.companyRfc ? "Lista" : "Pendiente"}</span>
              </div>
              <div className="accounting-form-grid">
                <label className="form-field">
                  <span>RFC empresa</span>
                  <input value={settingsDraft.companyRfc} onChange={(event) => setSettingsDraft((current) => ({ ...current, companyRfc: event.target.value }))} disabled={!canWrite || busy} />
                </label>
                <label className="form-field">
                  <span>Razon social</span>
                  <input value={settingsDraft.legalName} onChange={(event) => setSettingsDraft((current) => ({ ...current, legalName: event.target.value }))} disabled={!canWrite || busy} />
                </label>
              </div>
              <button className="primary-button" type="button" onClick={() => void saveSettings()} disabled={!canWrite || busy}>
                Guardar configuracion
              </button>
            </article>

            <article className="panel accounting-compact-panel">
              <div className="panel-header">
                <h2>Pendientes</h2>
                <span>{overview.pendingItems.length}</span>
              </div>
              <div className="accounting-pending-summary">
                <strong>{pendingBySeverity.errors}</strong><span>Errores</span>
                <strong>{pendingBySeverity.warnings}</strong><span>Alertas</span>
                <strong>{pendingBySeverity.info}</strong><span>Informativos</span>
              </div>
              <div className="accounting-pending-list">
                {overview.pendingItems.slice(0, 8).map((item) => (
                  <div key={item.id} className={`accounting-pending-item tone-${item.severity.toLowerCase()}`}>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                ))}
                {overview.pendingItems.length === 0 ? <p className="muted">Sin pendientes para el periodo.</p> : null}
              </div>
            </article>
          </section>
        </>
      ) : null}

      {!loading && overview && activeTab === "catalog" ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Catalogo de cuentas</h2>
            <div className="accounting-catalog-actions">
              <label className="accounting-inline-checkbox">
                <input
                  type="checkbox"
                  checked={replaceActiveCatalog}
                  onChange={(event) => {
                    setReplaceActiveCatalog(event.target.checked);
                    setCatalogXmlPreview(null);
                    setCatalogXmlPayload(null);
                  }}
                  disabled={!canWrite || busy || Boolean(catalogXmlPreview)}
                />
                <span>Reemplazar activos</span>
              </label>
              <label className="secondary-button accounting-file-button">
                Cargar XML
                <input
                  type="file"
                  accept=".xml,text/xml,application/xml"
                  onChange={(event) => {
                    void previewCatalogXml(event.target.files);
                    event.target.value = "";
                  }}
                  disabled={!canWrite || busy}
                />
              </label>
              <button className="secondary-button" type="button" onClick={() => void initializeCatalog()} disabled={!canWrite || busy}>
                Inicializar estandar
              </button>
            </div>
          </div>
          <div className="accounting-catalog-toolbar">
            <div className="accounting-catalog-stats">
              <span><strong>{catalogStats.active}</strong> Activas</span>
              <span><strong>{catalogStats.inactive}</strong> Inactivas</span>
              <span><strong>{catalogStats.missingSat}</strong> Sin SAT</span>
              <span><strong>{catalogStats.total}</strong> Total</span>
            </div>
            <div className="accounting-filter-tabs">
              {[
                ["ACTIVE", "Activas"],
                ["ALL", "Todas"],
                ["INACTIVE", "Inactivas"],
                ["MISSING_SAT", "Sin SAT"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`accounting-filter-tab ${catalogVisibility === value ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setCatalogVisibility(value as CatalogVisibility)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="accounting-form-grid accounting-form-grid-wide">
            <input placeholder="Codigo" value={accountDraft.code} onChange={(event) => setAccountDraft((current) => ({ ...current, code: event.target.value }))} disabled={!canWrite || busy} />
            <input placeholder="Nombre" value={accountDraft.name} onChange={(event) => setAccountDraft((current) => ({ ...current, name: event.target.value }))} disabled={!canWrite || busy} />
            <select value={accountDraft.type} onChange={(event) => setAccountDraft((current) => ({ ...current, type: event.target.value as AccountingCreateAccountInput["type"] }))} disabled={!canWrite || busy}>
              <option value="ASSET">Activo</option>
              <option value="LIABILITY">Pasivo</option>
              <option value="EQUITY">Capital</option>
              <option value="INCOME">Ingresos</option>
              <option value="COST">Costos</option>
              <option value="EXPENSE">Gastos</option>
            </select>
            <input placeholder="Codigo agrupador SAT" value={accountDraft.satGroupingCode ?? ""} onChange={(event) => setAccountDraft((current) => ({ ...current, satGroupingCode: event.target.value }))} disabled={!canWrite || busy} />
            <button className="primary-button" type="button" onClick={() => void createAccount()} disabled={!canWrite || busy}>
              Crear cuenta
            </button>
          </div>
          {catalogXmlPreview ? (
            <div className="accounting-preview-block">
              <div className="accounting-preview-head">
                <div>
                  <h3>Vista previa XML</h3>
                  <span>{catalogXmlPreview.originalFileName}</span>
                </div>
                <div className="accounting-preview-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setCatalogXmlPreview(null);
                      setCatalogXmlPayload(null);
                    }}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void importCatalogXml()}
                    disabled={!canWrite || busy || catalogXmlPreview.summary.errors > 0}
                  >
                    Confirmar importacion
                  </button>
                </div>
              </div>
              <div className="accounting-preview-summary">
                <span><strong>{catalogXmlPreview.summary.create}</strong> Crear</span>
                <span><strong>{catalogXmlPreview.summary.update}</strong> Actualizar</span>
                <span><strong>{catalogXmlPreview.summary.unchanged}</strong> Sin cambios</span>
                <span className={catalogXmlPreview.summary.errors > 0 ? "is-danger" : ""}><strong>{catalogXmlPreview.summary.errors}</strong> Errores</span>
              </div>
              <div className="accounting-table-wrap">
                <table className="data-table accounting-table accounting-preview-table">
                  <thead>
                    <tr>
                      <th>Accion</th>
                      <th>Cuenta</th>
                      <th>Nombre</th>
                      <th>SAT</th>
                      <th>Padre</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogXmlPreview.accounts.map((account, index) => (
                      <tr key={`${account.code || "sin-codigo"}-${index}`} className={account.action === "ERROR" ? "accounting-preview-error-row" : undefined}>
                        <td>{getCatalogActionLabel(account.action)}</td>
                        <td>{account.code || "-"}</td>
                        <td>{account.name || "-"}</td>
                        <td>{account.satGroupingCode ?? "-"}</td>
                        <td>{account.parentCode ?? "-"}</td>
                        <td>{account.error ?? `${account.level} / ${account.nature === "DEBIT" ? "Deudora" : "Acreedora"}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="accounting-table-wrap">
            <table className="data-table accounting-table">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>SAT</th>
                  <th>Naturaleza</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {catalogAccounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.code}</td>
                    <td>{account.name}</td>
                    <td>{account.type}</td>
                    <td>{account.satGroupingCode ?? "-"}</td>
                    <td>{account.nature === "DEBIT" ? "Deudora" : "Acreedora"}</td>
                    <td>{account.isActive ? "Activa" : "Inactiva"}</td>
                  </tr>
                ))}
                {catalogAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">Sin cuentas para este filtro.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!loading && overview && activeTab === "entries" ? (
        <section className="accounting-grid-two accounting-grid-two-wide">
          <article className="panel">
            <div className="panel-header">
              <h2>Saldos iniciales</h2>
              <span>Poliza de apertura</span>
            </div>
            <div className="accounting-form-grid">
              <select value={openingDraft.accountId} onChange={(event) => setOpeningDraft((current) => ({ ...current, accountId: event.target.value }))} disabled={!canWrite || busy}>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
              </select>
              <input placeholder="Cargo" value={openingDraft.debitMxn} onChange={(event) => setOpeningDraft((current) => ({ ...current, debitMxn: event.target.value }))} disabled={!canWrite || busy} />
              <input placeholder="Abono" value={openingDraft.creditMxn} onChange={(event) => setOpeningDraft((current) => ({ ...current, creditMxn: event.target.value }))} disabled={!canWrite || busy} />
              <button className="primary-button" type="button" onClick={() => void createOpeningBalance()} disabled={!canWrite || busy}>
                Registrar saldo
              </button>
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2>Poliza manual</h2>
              <button className="secondary-button" type="button" onClick={() => setEntryDraft((current) => ({ ...current, lines: [...current.lines, createLineDraft()] }))} disabled={!canWrite || busy}>
                Agregar linea
              </button>
            </div>
            <div className="accounting-form-grid">
              <input type="date" value={entryDraft.entryDate} onChange={(event) => setEntryDraft((current) => ({ ...current, entryDate: event.target.value }))} disabled={!canWrite || busy} />
              <input placeholder="Concepto" value={entryDraft.description} onChange={(event) => setEntryDraft((current) => ({ ...current, description: event.target.value }))} disabled={!canWrite || busy} />
            </div>
            <div className="accounting-entry-lines">
              {entryDraft.lines.map((line) => (
                <div className="accounting-entry-line" key={line.id}>
                  <select value={line.accountId} onChange={(event) => updateEntryLine(line.id, { accountId: event.target.value })} disabled={!canWrite || busy}>
                    <option value="">Cuenta</option>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
                  </select>
                  <input placeholder="Descripcion" value={line.description} onChange={(event) => updateEntryLine(line.id, { description: event.target.value })} disabled={!canWrite || busy} />
                  <input placeholder="Cargo" value={line.debitMxn} onChange={(event) => updateEntryLine(line.id, { debitMxn: event.target.value })} disabled={!canWrite || busy} />
                  <input placeholder="Abono" value={line.creditMxn} onChange={(event) => updateEntryLine(line.id, { creditMxn: event.target.value })} disabled={!canWrite || busy} />
                </div>
              ))}
            </div>
            <button className="primary-button" type="button" onClick={() => void createManualEntry()} disabled={!canWrite || busy}>
              Guardar poliza
            </button>
          </article>

          <article className="panel accounting-span-two">
            <div className="panel-header">
              <h2>Polizas de {getMonthName(selectedMonth)} {selectedYear}</h2>
              <span>{overview.entries.length}</span>
            </div>
            <div className="accounting-table-wrap">
              <table className="data-table accounting-table">
                <thead>
                  <tr>
                    <th>Numero</th>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Concepto</th>
                    <th>Cargos</th>
                    <th>Abonos</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.number}</td>
                      <td>{entry.entryDate}</td>
                      <td>{entry.entryType}</td>
                      <td>{entry.description}</td>
                      <td>{formatCurrency(entry.totalDebitMxn)}</td>
                      <td>{formatCurrency(entry.totalCreditMxn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {!loading && overview && activeTab === "cfdi" ? (
        <section className="panel">
          <div className="panel-header">
            <h2>CFDI cargados</h2>
            <label className="secondary-button accounting-file-button">
              Cargar XML
              <input type="file" accept=".xml,text/xml,application/xml" multiple onChange={(event) => void uploadCfdiFiles(event.target.files)} disabled={!canWrite || busy} />
            </label>
          </div>
          <div className="accounting-table-wrap">
            <table className="data-table accounting-table">
              <thead>
                <tr>
                  <th>UUID</th>
                  <th>Tipo</th>
                  <th>Emisor</th>
                  <th>Receptor</th>
                  <th>Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {overview.cfdiDocuments.map((document) => (
                  <tr key={document.id}>
                    <td>{document.uuid}</td>
                    <td>{document.type}</td>
                    <td>{document.issuerRfc}</td>
                    <td>{document.receiverRfc}</td>
                    <td>{formatCurrency(document.totalMxn)}</td>
                    <td>{document.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!loading && overview && activeTab === "reports" ? (
        <section className="accounting-grid-two accounting-grid-two-wide">
          <article className="panel accounting-span-two">
            <div className="panel-header">
              <h2>Balanza de comprobacion</h2>
              <span>{getMonthName(selectedMonth)} {selectedYear}</span>
            </div>
            <div className="accounting-table-wrap">
              <table className="data-table accounting-table">
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th>Inicial debe</th>
                    <th>Inicial haber</th>
                    <th>Debe</th>
                    <th>Haber</th>
                    <th>Final debe</th>
                    <th>Final haber</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.trialBalance.map((line) => (
                    <tr key={line.accountId}>
                      <td>{line.accountCode} {line.accountName}</td>
                      <td>{formatCurrency(line.openingDebitMxn)}</td>
                      <td>{formatCurrency(line.openingCreditMxn)}</td>
                      <td>{formatCurrency(line.periodDebitMxn)}</td>
                      <td>{formatCurrency(line.periodCreditMxn)}</td>
                      <td>{formatCurrency(line.endingDebitMxn)}</td>
                      <td>{formatCurrency(line.endingCreditMxn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2>Balance general</h2>
              <span>{formatCurrency(overview.totals.assetsMxn)}</span>
            </div>
            {overview.balanceSheet.map((line) => (
              <div className="accounting-report-line" key={line.accountId}>
                <span>{line.accountCode} {line.accountName}</span>
                <strong>{formatCurrency(line.amountMxn)}</strong>
              </div>
            ))}
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2>Estado de resultados</h2>
              <span>{formatCurrency(overview.totals.netIncomeMxn)}</span>
            </div>
            {overview.incomeStatement.map((line) => (
              <div className="accounting-report-line" key={line.accountId}>
                <span>{line.accountCode} {line.accountName}</span>
                <strong>{formatCurrency(line.amountMxn)}</strong>
              </div>
            ))}
          </article>
        </section>
      ) : null}

      {!loading && overview && activeTab === "sat" ? (
        <section className="panel">
          <div className="panel-header">
            <h2>XML SAT</h2>
            <span>{overview.period.requiresRegeneration ? "Requiere regeneracion" : "Sin cambios pendientes"}</span>
          </div>
          <div className="accounting-xml-grid">
            {XML_FORMATS.map((format) => (
              <button key={format.value} className="secondary-button" type="button" onClick={() => void exportXml(format.value)} disabled={!canWrite || busy}>
                {format.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
