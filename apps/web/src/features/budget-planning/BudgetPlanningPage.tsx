import { useEffect, useMemo, useState } from "react";
import type { BudgetPlan, BudgetPlanSnapshot, FinanceRecord, GeneralExpense } from "@sige/contracts";

import { apiGet, apiPatch } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canWriteModule } from "../auth/permissions";

const YEAR_OPTIONS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];
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

interface BudgetPlanningOverview {
  plan: BudgetPlan;
  financeRecords: FinanceRecord[];
  generalExpenses: GeneralExpense[];
}

type BudgetPlanPatch = Partial<Pick<BudgetPlan, "expectedExpenseMxn" | "notes">>;
type BudgetPlanningTab = "current" | "snapshots";

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatEditableNumber(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

function getMonthName(month: number) {
  return MONTH_NAMES[month - 1] ?? `Mes ${month}`;
}

function getIncomeTotal(record: FinanceRecord) {
  return Number(record.paidThisMonthMxn || 0) + Number(record.payment2Mxn || 0) + Number(record.payment3Mxn || 0);
}

function getProgressPercent(actual: number, expected: number) {
  if (expected <= 0) {
    return actual > 0 ? 100 : 0;
  }

  return Math.min(100, Math.max(0, (actual / expected) * 100));
}

export function BudgetPlanningPage() {
  const { user } = useAuth();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [activeTab, setActiveTab] = useState<BudgetPlanningTab>("current");
  const [plan, setPlan] = useState<BudgetPlan | null>(null);
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>([]);
  const [generalExpenses, setGeneralExpenses] = useState<GeneralExpense[]>([]);
  const [snapshots, setSnapshots] = useState<BudgetPlanSnapshot[]>([]);
  const [draftExpectedExpense, setDraftExpectedExpense] = useState("0");
  const [editingExpectedExpense, setEditingExpectedExpense] = useState(false);
  const [draftNotes, setDraftNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const canWrite = canWriteModule(user, "budget-planning");

  async function loadOverview() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const overview = await apiGet<BudgetPlanningOverview>(`/budget-planning?year=${selectedYear}&month=${selectedMonth}`);
      setPlan(overview.plan);
      setFinanceRecords(overview.financeRecords);
      setGeneralExpenses(overview.generalExpenses);
      setDraftExpectedExpense(formatEditableNumber(overview.plan.expectedExpenseMxn));
      setDraftNotes(overview.plan.notes ?? "");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadSnapshots() {
    setLoadingSnapshots(true);
    setErrorMessage(null);

    try {
      const response = await apiGet<BudgetPlanSnapshot[]>(`/budget-planning/snapshots?year=${selectedYear}&month=${selectedMonth}`);
      setSnapshots(response);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoadingSnapshots(false);
    }
  }

  useEffect(() => {
    if (activeTab === "snapshots") {
      void loadSnapshots();
      return;
    }

    void loadOverview();
  }, [activeTab, selectedMonth, selectedYear]);

  async function persistPlanPatch(patch: BudgetPlanPatch) {
    if (!canWrite) {
      return;
    }

    try {
      const updated = await apiPatch<BudgetPlan>(`/budget-planning?year=${selectedYear}&month=${selectedMonth}`, patch);
      setPlan(updated);
      setDraftExpectedExpense(formatEditableNumber(updated.expectedExpenseMxn));
      setDraftNotes(updated.notes ?? "");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      await loadOverview();
    }
  }

  const totals = useMemo(() => {
    const actualIncomeMxn = financeRecords.reduce((sum, record) => sum + getIncomeTotal(record), 0);
    const actualExpenseMxn = generalExpenses.reduce((sum, expense) => sum + Number(expense.amountMxn || 0), 0);
    const expectedIncomeMxn = plan?.expectedIncomeMxn ?? 0;
    const expectedExpenseMxn = plan?.expectedExpenseMxn ?? 0;
    const expectedResultMxn = expectedIncomeMxn - expectedExpenseMxn;
    const actualResultMxn = actualIncomeMxn - actualExpenseMxn;

    return {
      expectedIncomeMxn,
      expectedExpenseMxn,
      actualIncomeMxn,
      actualExpenseMxn,
      expectedResultMxn,
      actualResultMxn,
      incomeProgress: getProgressPercent(actualIncomeMxn, expectedIncomeMxn),
      expenseProgress: getProgressPercent(actualExpenseMxn, expectedExpenseMxn)
    };
  }, [financeRecords, generalExpenses, plan]);

  const expectedResultTone = totals.expectedResultMxn >= 0 ? "is-positive" : "is-negative";
  const actualResultTone = totals.actualResultMxn >= 0 ? "is-positive" : "is-negative";

  return (
    <section className="page-stack budget-planning-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">{"\u{1F4CB}"}</span>
          <div>
            <h2>Planeaci{"\u00f3"}n presupuestal</h2>
          </div>
        </div>
        <p className="muted">Vista mensual para comparar ingresos y gastos esperados contra lo reportado en Finanzas y Gastos generales.</p>
      </header>

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

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
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{getMonthName(month)}</option>)}
              </select>
            </label>
          </div>
          <button className="secondary-button" type="button" onClick={() => activeTab === "snapshots" ? void loadSnapshots() : void loadOverview()}>
            Actualizar
          </button>
        </div>
      </section>

      <section className="panel finance-tabs-panel">
        <div className="finance-tabs">
          <button className={`finance-tab ${activeTab === "current" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("current")}>
            Mes en curso
          </button>
          <button className={`finance-tab ${activeTab === "snapshots" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("snapshots")}>
            Estampas hist{"\u00f3"}ricas
          </button>
        </div>
      </section>

      {activeTab === "current" ? (
        <>
          <section className="budget-control-grid">
            <article className="budget-comparison-card">
              <div className="budget-card-head">
                <div>
                  <h3>Ingresos sin IVA</h3>
                  <span>Finanzas</span>
                </div>
                <strong>{Math.round(totals.incomeProgress)}%</strong>
              </div>
              <div className="budget-pair-grid">
                <div className="budget-reported-field budget-readonly-field">
                  <span>Esperados</span>
                  <strong>{formatCurrency(totals.expectedIncomeMxn)}</strong>
                </div>
                <div className="budget-reported-field">
                  <span>Reportados</span>
                  <strong>{formatCurrency(totals.actualIncomeMxn)}</strong>
                </div>
              </div>
              <div className="budget-progress-track">
                <div className="budget-progress-fill income" style={{ width: `${totals.incomeProgress}%` }} />
              </div>
            </article>

            <article className="budget-comparison-card">
              <div className="budget-card-head">
                <div>
                  <h3>Egresos sin IVA</h3>
                  <span>Gastos generales</span>
                </div>
                <strong>{Math.round(totals.expenseProgress)}%</strong>
              </div>
              <div className="budget-pair-grid">
                <label className="form-field budget-expected-field">
                  <span>Esperados</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editingExpectedExpense ? draftExpectedExpense : formatCurrency(Number(draftExpectedExpense || 0))}
                    disabled={!canWrite}
                    onFocus={() => setEditingExpectedExpense(true)}
                    onChange={(event) => setDraftExpectedExpense(event.target.value)}
                    onBlur={() => {
                      setEditingExpectedExpense(false);
                      void persistPlanPatch({ expectedExpenseMxn: Math.max(0, Number(draftExpectedExpense || 0)) });
                    }}
                  />
                </label>
                <div className="budget-reported-field">
                  <span>Reportados</span>
                  <strong>{formatCurrency(totals.actualExpenseMxn)}</strong>
                </div>
              </div>
              <div className="budget-progress-track">
                <div className="budget-progress-fill expense" style={{ width: `${totals.expenseProgress}%` }} />
              </div>
            </article>

            <article className="budget-result-comparison-card">
              <div className="budget-card-head">
                <div>
                  <h3>Resultado financiero</h3>
                  <span>Esperado vs real</span>
                </div>
              </div>
              <div className="budget-result-pair">
                <div className={`budget-result-value ${expectedResultTone}`}>
                  <span>Esperado</span>
                  <strong>{formatCurrency(totals.expectedResultMxn)}</strong>
                </div>
                <div className={`budget-result-value ${actualResultTone}`}>
                  <span>Real</span>
                  <strong>{formatCurrency(totals.actualResultMxn)}</strong>
                </div>
              </div>
              <small>Diferencia: {formatCurrency(totals.actualResultMxn - totals.expectedResultMxn)}</small>
            </article>
          </section>

          <section className="panel budget-notes-panel">
            <div className="panel-header">
              <h2>Notas de {getMonthName(selectedMonth)} {selectedYear}</h2>
              <span>{loading ? "Cargando..." : "En tiempo real"}</span>
            </div>
            <label className="form-field budget-notes-field">
              <span>Notas del mes</span>
              <textarea
                value={draftNotes}
                disabled={!canWrite}
                onChange={(event) => setDraftNotes(event.target.value)}
                onBlur={() => void persistPlanPatch({ notes: draftNotes })}
                rows={3}
              />
            </label>
          </section>
        </>
      ) : (
        <section className="panel budget-snapshots-panel">
          <div className="panel-header">
            <h2>Estampas anteriores a {getMonthName(selectedMonth)} {selectedYear}</h2>
            <span>{loadingSnapshots ? "Cargando..." : `${snapshots.length} estampas`}</span>
          </div>
          <div className="budget-snapshot-grid">
            {loadingSnapshots ? (
              <p className="muted">Cargando estampas historicas...</p>
            ) : snapshots.length === 0 ? (
              <p className="muted">Aun no hay meses anteriores con planeacion o movimientos para estampar.</p>
            ) : (
              snapshots.map((snapshot) => {
                const snapshotExpectedTone = snapshot.expectedResultMxn >= 0 ? "is-positive" : "is-negative";
                const snapshotActualTone = snapshot.actualResultMxn >= 0 ? "is-positive" : "is-negative";

                return (
                  <article className="budget-snapshot-card" key={snapshot.id}>
                    <div className="budget-card-head">
                      <div>
                        <h3>{getMonthName(snapshot.month)} {snapshot.year}</h3>
                        <span>Estampa congelada el {new Date(snapshot.createdAt).toLocaleDateString("es-MX")}</span>
                      </div>
                    </div>
                    <div className="budget-snapshot-metrics">
                      <div>
                        <span>Ingresos esperados</span>
                        <strong>{formatCurrency(snapshot.expectedIncomeMxn)}</strong>
                      </div>
                      <div>
                        <span>Ingresos reportados</span>
                        <strong>{formatCurrency(snapshot.actualIncomeMxn)}</strong>
                      </div>
                      <div>
                        <span>Egresos esperados</span>
                        <strong>{formatCurrency(snapshot.expectedExpenseMxn)}</strong>
                      </div>
                      <div>
                        <span>Egresos reportados</span>
                        <strong>{formatCurrency(snapshot.actualExpenseMxn)}</strong>
                      </div>
                    </div>
                    <div className="budget-result-pair">
                      <div className={`budget-result-value ${snapshotExpectedTone}`}>
                        <span>Resultado esperado</span>
                        <strong>{formatCurrency(snapshot.expectedResultMxn)}</strong>
                      </div>
                      <div className={`budget-result-value ${snapshotActualTone}`}>
                        <span>Resultado real</span>
                        <strong>{formatCurrency(snapshot.actualResultMxn)}</strong>
                      </div>
                    </div>
                    <small>{snapshot.financeRecordCount} ingresos y {snapshot.generalExpenseCount} egresos reportados</small>
                    {snapshot.notes ? <p className="muted">{snapshot.notes}</p> : null}
                  </article>
                );
              })
            )}
          </div>
        </section>
      )}
    </section>
  );
}
