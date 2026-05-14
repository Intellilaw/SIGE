import { useEffect, useMemo, useState } from "react";
import type { GeneralExpense } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

type ActiveTab = "registro" | "emrt";
type ExpenseDraftField =
  | "detail"
  | "amountMxn"
  | "pctLitigation"
  | "pctCorporateLabor"
  | "pctSettlements"
  | "pctFinancialLaw"
  | "pctTaxCompliance";

type ExpenseDraftMap = Record<string, Partial<Record<ExpenseDraftField, string>>>;

type GeneralExpensePatchPayload = {
  detail?: string;
  amountMxn?: number;
  countsTowardLimit?: boolean;
  team?: GeneralExpense["team"];
  generalExpense?: boolean;
  expenseWithoutTeam?: boolean;
  pctLitigation?: number;
  pctCorporateLabor?: number;
  pctSettlements?: number;
  pctFinancialLaw?: number;
  pctTaxCompliance?: number;
  paymentMethod?: GeneralExpense["paymentMethod"];
  bank?: GeneralExpense["bank"] | null;
  recurring?: boolean;
  approvedByEmrt?: boolean;
  paidByEmrtAt?: string | null;
  reviewedByJnls?: boolean;
  paid?: boolean;
  paidAt?: string | null;
};

type CopyNextMonthResult = {
  year: number;
  month: number;
  copied: number;
};

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
const DISTRIBUTION_FIELDS = [
  { key: "pctLitigation", label: "% Litigio" },
  { key: "pctCorporateLabor", label: "% Corp-Lab" },
  { key: "pctSettlements", label: "% Convenios" },
  { key: "pctFinancialLaw", label: "% Der Fin" },
  { key: "pctTaxCompliance", label: "% Compl Fis" }
] as const;
const PCT_DRAFT_FIELDS: ExpenseDraftField[] = [
  "pctLitigation",
  "pctCorporateLabor",
  "pctSettlements",
  "pctFinancialLaw",
  "pctTaxCompliance"
];
const PAYMENT_METHOD_OPTIONS: GeneralExpense["paymentMethod"][] = ["Transferencia", "Efectivo"];
const BANK_OPTIONS: NonNullable<GeneralExpense["bank"]>[] = ["Banamex", "HSBC"];

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function normalizeComparableText(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPermission(permissions: string[] | undefined, permission: string) {
  return Boolean(permissions?.includes("*") || permissions?.includes(permission));
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatDateDisplay(value?: string | null) {
  const inputValue = toDateInput(value);
  if (!inputValue) {
    return "-";
  }

  const [year, month, day] = inputValue.split("-");
  return `${day}/${month}/${year}`;
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

function clampPercentage(value?: number | null) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.min(100, Math.max(0, numeric));
}

function getMonthName(month: number) {
  return MONTH_NAMES[month - 1] ?? `Mes ${month}`;
}

function getTodayInput() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isFinanceUser(input: {
  team?: string;
  legacyTeam?: string;
}) {
  return input.team === "FINANCE" || normalizeComparableText(input.legacyTeam) === "finanzas";
}

function isEduardoRusconi(input: {
  username?: string;
  displayName?: string;
  email?: string;
}) {
  return (
    normalizeComparableText(input.username) === "eduardo rusconi" ||
    normalizeComparableText(input.displayName) === "eduardo rusconi" ||
    (input.email ?? "").toLowerCase().startsWith("eduardo.rusconi")
  );
}

function isJaelLopez(input: {
  username?: string;
  displayName?: string;
  email?: string;
  shortName?: string;
}) {
  return (
    (input.email ?? "").toLowerCase() === "jael.lopez@calculadora.app" ||
    normalizeComparableText(input.username) === "jael lopez" ||
    normalizeComparableText(input.displayName) === "jael lopez" ||
    (input.shortName ?? "").trim().toUpperCase() === "JNLS"
  );
}

function canReviewJnls(input: {
  role?: string;
  specificRole?: string;
  username?: string;
  displayName?: string;
  email?: string;
  shortName?: string;
}) {
  return (input.role === "AUDITOR" || normalizeComparableText(input.specificRole) === "auditor") && isJaelLopez(input);
}

function getIvaAmount(expense: GeneralExpense) {
  if (expense.paymentMethod === "Efectivo") {
    return null;
  }

  const amount = Number(expense.amountMxn || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return amount * 0.16;
}

function getDistributionPct(expense: GeneralExpense) {
  const pctLitigation = Number(expense.pctLitigation || 0);
  const pctCorporateLabor = Number(expense.pctCorporateLabor || 0);
  const pctSettlements = Number(expense.pctSettlements || 0);
  const pctFinancialLaw = Number(expense.pctFinancialLaw || 0);
  const pctTaxCompliance = Number(expense.pctTaxCompliance || 0);

  return {
    pctLitigation,
    pctCorporateLabor,
    pctSettlements,
    pctFinancialLaw,
    pctTaxCompliance,
    sum: pctLitigation + pctCorporateLabor + pctSettlements + pctFinancialLaw + pctTaxCompliance
  };
}

function distributeExpense(expense: GeneralExpense) {
  const result = {
    withoutTeam: 0,
    litigation: 0,
    corporateLabor: 0,
    settlements: 0,
    financialLaw: 0,
    taxCompliance: 0,
    totalPaid: 0
  };

  if (!expense.paid || !expense.paidAt) {
    return result;
  }

  const amount = Number(expense.amountMxn || 0);
  if (expense.expenseWithoutTeam) {
    result.withoutTeam = amount;
    result.totalPaid = amount;
    return result;
  }

  if (expense.generalExpense) {
    const split = amount / 5;
    result.litigation = split;
    result.corporateLabor = split;
    result.settlements = split;
    result.financialLaw = split;
    result.taxCompliance = split;
    result.totalPaid = amount;
    return result;
  }

  const distribution = getDistributionPct(expense);
  if (distribution.sum > 0) {
    result.litigation = amount * (distribution.pctLitigation / 100);
    result.corporateLabor = amount * (distribution.pctCorporateLabor / 100);
    result.settlements = amount * (distribution.pctSettlements / 100);
    result.financialLaw = amount * (distribution.pctFinancialLaw / 100);
    result.taxCompliance = amount * (distribution.pctTaxCompliance / 100);
    if (distribution.sum < 100) {
      result.withoutTeam = amount * ((100 - distribution.sum) / 100);
    }
  } else {
    switch (expense.team) {
      case "General": {
        const split = amount / 5;
        result.litigation = split;
        result.corporateLabor = split;
        result.settlements = split;
        result.financialLaw = split;
        result.taxCompliance = split;
        break;
      }
      case "Litigio":
        result.litigation = amount;
        break;
      case "Corporativo y laboral":
        result.corporateLabor = amount;
        break;
      case "Convenios":
        result.settlements = amount;
        break;
      case "Der Financiero":
        result.financialLaw = amount;
        break;
      case "Compliance Fiscal":
        result.taxCompliance = amount;
        break;
      case "Sin equipo":
      default:
        result.withoutTeam = amount;
        break;
    }
  }

  result.totalPaid = amount;
  return result;
}

function isRowIncomplete(expense: GeneralExpense) {
  if (!expense.detail || expense.detail.trim() === "") return true;
  if (!expense.amountMxn || Number(expense.amountMxn) === 0) return true;
  if (!expense.expenseWithoutTeam && !expense.generalExpense) {
    const { sum } = getDistributionPct(expense);
    if (sum !== 100) return true;
  }
  if (!expense.paymentMethod) return true;
  if (expense.paymentMethod === "Transferencia" && !expense.bank) return true;
  if (!expense.approvedByEmrt) return true;
  if (!expense.reviewedByJnls) return true;
  if (!expense.paid) return true;
  if (!expense.paidAt) return true;
  return false;
}

function buildEmrtSummaryMessage(date: string, items: GeneralExpense[], total: number) {
  return [
    `Entrego a Araceli la suma de ${formatCurrency(total)} y el resumen:`,
    "",
    `Gastos pagados por EMRT el ${formatDateDisplay(date)}:`,
    ...items.map((item, index) => `${index + 1}. ${(item.detail || "Gasto sin detalle").trim()}`)
  ].join("\n");
}

async function copyTextToClipboard(text: string) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const temporaryTextArea = document.createElement("textarea");
  temporaryTextArea.value = text;
  temporaryTextArea.setAttribute("readonly", "");
  temporaryTextArea.style.position = "absolute";
  temporaryTextArea.style.left = "-9999px";
  document.body.appendChild(temporaryTextArea);
  temporaryTextArea.select();
  document.execCommand("copy");
  document.body.removeChild(temporaryTextArea);
}

function replaceExpense(items: GeneralExpense[], updated: GeneralExpense) {
  return items.map((item) => (item.id === updated.id ? updated : item));
}

function applyLocalPatch(expense: GeneralExpense, patch: GeneralExpensePatchPayload): GeneralExpense {
  const next: GeneralExpense = {
    ...expense,
    ...(patch as Partial<GeneralExpense>)
  };

  if (Object.prototype.hasOwnProperty.call(patch, "bank") && patch.bank == null) {
    next.bank = undefined;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "paidByEmrtAt") && !patch.paidByEmrtAt) {
    next.paidByEmrtAt = undefined;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "paidAt") && !patch.paidAt) {
    next.paidAt = undefined;
  }

  return next;
}

export function GeneralExpensesPage() {
  const { user } = useAuth();
  const now = new Date();
  const [activeTab, setActiveTab] = useState<ActiveTab>("registro");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<GeneralExpense[]>([]);
  const [drafts, setDrafts] = useState<ExpenseDraftMap>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedSummaryDate, setCopiedSummaryDate] = useState("");

  const canRead = hasPermission(user?.permissions, "general-expenses:read") || hasPermission(user?.permissions, "general-expenses:write");
  const canWrite = hasPermission(user?.permissions, "general-expenses:write");
  const canApprove = Boolean(user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN");
  const canPay = Boolean(user && isFinanceUser({ team: user.team, legacyTeam: user.legacyTeam }));
  const canEditEmrtDate = Boolean(user && isEduardoRusconi({ username: user.username, displayName: user.displayName, email: user.email }));
  const canReviewJnlsFlag = Boolean(user && canReviewJnls({
    role: user.role,
    specificRole: user.specificRole,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    shortName: user.shortName
  }));

  async function loadRecords() {
    if (!canRead) {
      setRecords([]);
      setLoading(false);
      setErrorMessage("No tienes permisos para consultar Gastos generales.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await apiGet<GeneralExpense[]>(`/general-expenses?year=${selectedYear}&month=${selectedMonth}`);
      setRecords(response);
      setDrafts({});
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords();
  }, [canRead, selectedMonth, selectedYear]);

  function setDraft(expenseId: string, field: ExpenseDraftField, value: string) {
    setDrafts((current) => ({
      ...current,
      [expenseId]: {
        ...current[expenseId],
        [field]: value
      }
    }));
  }

  function clearDraft(expenseId: string, field: ExpenseDraftField) {
    setDrafts((current) => {
      if (!current[expenseId]) {
        return current;
      }

      const nextFields = { ...current[expenseId] };
      delete nextFields[field];

      if (Object.keys(nextFields).length === 0) {
        const next = { ...current };
        delete next[expenseId];
        return next;
      }

      return {
        ...current,
        [expenseId]: nextFields
      };
    });
  }

  function clearDraftFields(expenseId: string, fields: ExpenseDraftField[]) {
    fields.forEach((field) => clearDraft(expenseId, field));
  }

  function updateExpenseLocal(expenseId: string, patch: GeneralExpensePatchPayload) {
    setRecords((items) => items.map((item) => (item.id === expenseId ? applyLocalPatch(item, patch) : item)));
  }

  async function persistExpensePatch(
    expenseId: string,
    payload: GeneralExpensePatchPayload,
    localPatch: GeneralExpensePatchPayload = payload
  ) {
    updateExpenseLocal(expenseId, localPatch);

    try {
      const updated = await apiPatch<GeneralExpense>(`/general-expenses/${expenseId}`, payload);
      setRecords((items) => replaceExpense(items, updated));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      await loadRecords();
    }
  }

  async function flushDraftField(expenseId: string, field: ExpenseDraftField) {
    const rawValue = drafts[expenseId]?.[field];
    if (rawValue === undefined) {
      return;
    }

    clearDraft(expenseId, field);

    if (field === "detail") {
      await persistExpensePatch(expenseId, { detail: rawValue }, { detail: rawValue });
      return;
    }

    const numericValue = field === "amountMxn"
      ? Math.max(0, Number(rawValue || 0))
      : clampPercentage(Number(rawValue || 0));

    await persistExpensePatch(
      expenseId,
      { [field]: numericValue } as GeneralExpensePatchPayload,
      { [field]: numericValue } as GeneralExpensePatchPayload
    );
  }

  async function handleAddRow() {
    if (!canWrite) {
      return;
    }

    try {
      const created = await apiPost<GeneralExpense>("/general-expenses", {
        year: selectedYear,
        month: selectedMonth
      });
      setRecords((items) => [...items, created]);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleDelete(expense: GeneralExpense) {
    if (!canWrite || expense.approvedByEmrt) {
      return;
    }

    if (!window.confirm("Eliminar este gasto?")) {
      return;
    }

    try {
      await apiDelete(`/general-expenses/${expense.id}`);
      setRecords((items) => items.filter((item) => item.id !== expense.id));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleCopyToNextMonth() {
    if (!canWrite) {
      return;
    }

    const recurringRows = records.filter((item) => item.recurring);
    if (recurringRows.length === 0) {
      window.alert("No hay gastos marcados como recurrentes para copiar.");
      return;
    }

    const nextMonthDate = new Date(selectedYear, selectedMonth, 1);
    const targetYear = nextMonthDate.getFullYear();
    const targetMonth = nextMonthDate.getMonth() + 1;

    if (!window.confirm(`Copiar ${recurringRows.length} gastos recurrentes de ${getMonthName(selectedMonth)}/${selectedYear} a ${getMonthName(targetMonth)}/${targetYear}?`)) {
      return;
    }

    try {
      const result = await apiPost<CopyNextMonthResult>("/general-expenses/copy-to-next-month", {
        year: selectedYear,
        month: selectedMonth
      });

      window.alert(`${result.copied} gastos copiados exitosamente a ${getMonthName(result.month)}.`);
      if (window.confirm("Ir al mes siguiente?")) {
        setSelectedYear(result.year);
        setSelectedMonth(result.month);
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  function handleDistributionModeChange(
    expense: GeneralExpense,
    field: "generalExpense" | "expenseWithoutTeam",
    checked: boolean
  ) {
    if (!canWrite || expense.approvedByEmrt) {
      return;
    }

    const payload: GeneralExpensePatchPayload = checked
      ? field === "generalExpense"
        ? {
            generalExpense: true,
            expenseWithoutTeam: false,
            pctLitigation: 20,
            pctCorporateLabor: 20,
            pctSettlements: 20,
            pctFinancialLaw: 20,
            pctTaxCompliance: 20
          }
        : {
            generalExpense: false,
            expenseWithoutTeam: true,
            pctLitigation: 0,
            pctCorporateLabor: 0,
            pctSettlements: 0,
            pctFinancialLaw: 0,
            pctTaxCompliance: 0
          }
      : field === "generalExpense"
        ? { generalExpense: false }
        : { expenseWithoutTeam: false };

    clearDraftFields(expense.id, PCT_DRAFT_FIELDS);
    void persistExpensePatch(expense.id, payload);
  }

  async function handleCopySummary(summaryMessage: string, date: string) {
    try {
      await copyTextToClipboard(summaryMessage);
      setCopiedSummaryDate(date);
      window.setTimeout(() => {
        setCopiedSummaryDate((current) => (current === date ? "" : current));
      }, 2000);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  const totals = useMemo(
    () =>
      records.reduce(
        (accumulator, expense) => {
          const distribution = distributeExpense(expense);
          return {
            totalAmount: accumulator.totalAmount + Number(expense.amountMxn || 0),
            totalLimit: accumulator.totalLimit + (expense.countsTowardLimit ? Number(expense.amountMxn || 0) : 0),
            withoutTeam: accumulator.withoutTeam + distribution.withoutTeam,
            litigation: accumulator.litigation + distribution.litigation,
            corporateLabor: accumulator.corporateLabor + distribution.corporateLabor,
            settlements: accumulator.settlements + distribution.settlements,
            financialLaw: accumulator.financialLaw + distribution.financialLaw,
            taxCompliance: accumulator.taxCompliance + distribution.taxCompliance,
            totalPaid: accumulator.totalPaid + distribution.totalPaid
          };
        },
        {
          totalAmount: 0,
          totalLimit: 0,
          withoutTeam: 0,
          litigation: 0,
          corporateLabor: 0,
          settlements: 0,
          financialLaw: 0,
          taxCompliance: 0,
          totalPaid: 0
        }
      ),
    [records]
  );

  const emrtDailyTotals = useMemo(() => {
    const grouped = records.reduce<Record<string, { total: number; items: GeneralExpense[] }>>((accumulator, expense) => {
      const key = toDateInput(expense.paidByEmrtAt);
      if (!key) {
        return accumulator;
      }

      if (!accumulator[key]) {
        accumulator[key] = {
          total: 0,
          items: []
        };
      }

      accumulator[key].items.push(expense);
      accumulator[key].total += Number(expense.amountMxn || 0);
      return accumulator;
    }, {});

    return Object.entries(grouped)
      .map(([date, data]) => ({
        date,
        total: data.total,
        items: data.items,
        summaryMessage: buildEmrtSummaryMessage(date, data.items, data.total)
      }))
      .sort((left, right) => left.date.localeCompare(right.date));
  }, [records]);

  const emrtGrandTotal = useMemo(
    () => emrtDailyTotals.reduce((sum, item) => sum + item.total, 0),
    [emrtDailyTotals]
  );

  return (
    <section className="page-stack general-expenses-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            Gastos
          </span>
          <div>
            <h2>Gastos generales</h2>
          </div>
        </div>
        <p className="muted">
          Registro mensual de gastos, distribucion por equipo, bloqueo por aprobaciones y resumen diario de gastos
          pagados por EMRT.
        </p>
      </header>

      <section className="panel">
        <div className="leads-tabs" role="tablist" aria-label="Vistas de gastos generales">
          <button
            type="button"
            className={`lead-tab ${activeTab === "registro" ? "is-active" : ""}`}
            onClick={() => setActiveTab("registro")}
          >
            1. Registro
          </button>
          <button
            type="button"
            className={`lead-tab ${activeTab === "emrt" ? "is-active" : ""}`}
            onClick={() => setActiveTab("emrt")}
          >
            2. Pagado por EMRT
          </button>
        </div>
      </section>

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      <section className="panel general-expenses-toolbar">
        <div className="general-expenses-filters">
          <label className="form-field">
            <span>Año</span>
            <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Mes</span>
            <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
              {MONTH_NAMES.map((monthName, index) => (
                <option key={monthName} value={index + 1}>
                  {monthName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="general-expenses-actions">
          <button type="button" className="secondary-button" onClick={() => void loadRecords()}>
            Refrescar
          </button>
          {activeTab === "registro" ? (
            <>
              <button type="button" className="secondary-button" onClick={() => void handleCopyToNextMonth()} disabled={!canWrite}>
                Copiar a mes siguiente
              </button>
              <button type="button" className="primary-button" onClick={() => void handleAddRow()} disabled={!canWrite}>
                + Agregar Gasto
              </button>
            </>
          ) : null}
        </div>
      </section>

      {activeTab === "registro" ? (
        <>
          <section className="panel">
            <div className="general-expense-summary-grid">
              <article className="general-expense-summary-card is-total">
                <span>Total gastos registrados</span>
                <strong>{formatCurrency(totals.totalAmount)}</strong>
              </article>
              <article className="general-expense-summary-card is-limit">
                <span>Total límite</span>
                <strong>{formatCurrency(totals.totalLimit)}</strong>
              </article>
              <article className="general-expense-summary-card is-paid">
                <span>Total pagado</span>
                <strong>{formatCurrency(totals.totalPaid)}</strong>
              </article>
              <article className="general-expense-summary-card is-pending">
                <span>Pendiente de pago</span>
                <strong>{formatCurrency(totals.totalAmount - totals.totalPaid)}</strong>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Registro mensual</h2>
              <span>{records.length} registros</span>
            </div>

            <div className="lead-table-shell">
              <div className="lead-table-wrapper general-expense-table-wrapper">
                <table className="lead-table general-expense-table">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>Detalle de Gasto</th>
                      <th>Monto</th>
                      <th>IVA</th>
                      <th>¿Cuenta para límite?</th>
                      <th>Suma Límite</th>
                      <th>Gasto general</th>
                      <th>Gasto sin equipo</th>
                      {DISTRIBUTION_FIELDS.map((field) => (
                        <th key={field.key}>{field.label}</th>
                      ))}
                      <th>SUM %</th>
                      <th>Método</th>
                      <th>Banco</th>
                      <th>Gasto Recurrente</th>
                      <th>Aprobado EMRT</th>
                      <th>Fecha pagado por EMRT</th>
                      <th>Aprobado por JNLS</th>
                      <th>¿Pagado a receptor final?</th>
                      <th>Fecha Pago</th>
                      <th>Sin equipo</th>
                      <th>Litigio</th>
                      <th>Corporativo</th>
                      <th>Convenios</th>
                      <th>Financiero</th>
                      <th>Fiscal</th>
                      <th>Total Pagado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={30} className="centered-inline-message">
                          Cargando gastos...
                        </td>
                      </tr>
                    ) : records.length === 0 ? (
                      <tr>
                        <td colSpan={30} className="centered-inline-message">
                          No hay gastos registrados en este mes.
                        </td>
                      </tr>
                    ) : (
                      (() => {
                        let runningLimit = 0;

                        return records.map((expense, index) => {
                          if (expense.countsTowardLimit) {
                            runningLimit += Number(expense.amountMxn || 0);
                          }

                          const distribution = distributeExpense(expense);
                          const ivaAmount = getIvaAmount(expense);
                          const { sum } = getDistributionPct(expense);
                          const pctDisabled = !canWrite || expense.approvedByEmrt || expense.generalExpense || expense.expenseWithoutTeam;
                          const rowIncomplete = isRowIncomplete(expense);
                          const draftAmount = drafts[expense.id]?.amountMxn ?? formatEditableNumber(Number(expense.amountMxn || 0));

                          return (
                            <tr key={expense.id} className={rowIncomplete ? "general-expense-row-danger" : undefined}>
                              <td className="general-expense-row-index">{index + 1}</td>
                              <td>
                                <textarea
                                  className="general-expense-input general-expense-textarea"
                                  value={drafts[expense.id]?.detail ?? expense.detail ?? ""}
                                  onChange={(event) => setDraft(expense.id, "detail", event.target.value)}
                                  onBlur={() => void flushDraftField(expense.id, "detail")}
                                  rows={2}
                                  disabled={!canWrite || expense.approvedByEmrt}
                                />
                              </td>
                              <td>
                                <input
                                  className="general-expense-input general-expense-number-input"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={draftAmount}
                                  onChange={(event) => setDraft(expense.id, "amountMxn", event.target.value)}
                                  onBlur={() => void flushDraftField(expense.id, "amountMxn")}
                                  disabled={!canWrite || expense.approvedByEmrt}
                                />
                              </td>
                              <td>
                                <div className={`general-expense-readonly-cell ${expense.paymentMethod === "Efectivo" ? "is-disabled" : ""}`}>
                                  {ivaAmount !== null ? formatCurrency(ivaAmount) : "-"}
                                </div>
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.countsTowardLimit}
                                  onChange={(event) => void persistExpensePatch(expense.id, { countsTowardLimit: event.target.checked })}
                                  disabled={!canWrite || expense.approvedByEmrt}
                                />
                              </td>
                              <td className={`general-expense-limit-cell ${expense.countsTowardLimit ? "is-active" : ""}`}>
                                {expense.countsTowardLimit ? formatCurrency(runningLimit) : "-"}
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.generalExpense}
                                  onChange={(event) => handleDistributionModeChange(expense, "generalExpense", event.target.checked)}
                                  disabled={!canWrite || expense.approvedByEmrt}
                                />
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.expenseWithoutTeam}
                                  onChange={(event) => handleDistributionModeChange(expense, "expenseWithoutTeam", event.target.checked)}
                                  disabled={!canWrite || expense.approvedByEmrt}
                                />
                              </td>
                              {DISTRIBUTION_FIELDS.map((field) => (
                                <td key={`${expense.id}-${field.key}`}>
                                  <div className="general-expense-percent-field">
                                    <input
                                      className="general-expense-input general-expense-percent-input"
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={drafts[expense.id]?.[field.key] ?? formatEditableNumber(Number(expense[field.key] || 0))}
                                      onChange={(event) => setDraft(expense.id, field.key, event.target.value)}
                                      onBlur={() => void flushDraftField(expense.id, field.key)}
                                      disabled={pctDisabled}
                                    />
                                    <span>%</span>
                                  </div>
                                </td>
                              ))}
                              <td className={`general-expense-percent-sum ${sum === 100 ? "is-valid" : "is-invalid"}`}>
                                {expense.expenseWithoutTeam ? "" : `${sum}%`}
                              </td>
                              <td>
                                <select
                                  className="general-expense-input"
                                  value={expense.paymentMethod}
                                  onChange={(event) => {
                                    const nextMethod = event.target.value as GeneralExpense["paymentMethod"];
                                    const localPatch = nextMethod === "Efectivo"
                                      ? { paymentMethod: nextMethod, bank: null }
                                      : { paymentMethod: nextMethod };
                                    void persistExpensePatch(expense.id, localPatch, localPatch);
                                  }}
                                  disabled={!canWrite || expense.approvedByEmrt}
                                >
                                  {PAYMENT_METHOD_OPTIONS.map((method) => (
                                    <option key={method} value={method}>
                                      {method}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  className="general-expense-input"
                                  value={expense.bank ?? ""}
                                  onChange={(event) => void persistExpensePatch(expense.id, {
                                    bank: (event.target.value || null) as GeneralExpense["bank"] | null
                                  })}
                                  disabled={!canWrite || expense.approvedByEmrt || expense.paymentMethod !== "Transferencia"}
                                >
                                  <option value="">Seleccionar...</option>
                                  {BANK_OPTIONS.map((bank) => (
                                    <option key={bank} value={bank}>
                                      {bank}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.recurring}
                                  onChange={(event) => void persistExpensePatch(expense.id, { recurring: event.target.checked })}
                                  disabled={!canWrite || expense.approvedByEmrt}
                                />
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.approvedByEmrt}
                                  onChange={(event) => void persistExpensePatch(expense.id, { approvedByEmrt: event.target.checked })}
                                  disabled={!canApprove}
                                />
                              </td>
                              <td>
                                <div className="general-expense-date-stack">
                                  <input
                                    className="general-expense-input"
                                    type="date"
                                    value={toDateInput(expense.paidByEmrtAt)}
                                    onChange={(event) => void persistExpensePatch(expense.id, { paidByEmrtAt: event.target.value || null })}
                                    disabled={!canEditEmrtDate || expense.paymentMethod !== "Efectivo"}
                                  />
                                  <button
                                    type="button"
                                    className="general-expense-inline-button"
                                    onClick={() => void persistExpensePatch(expense.id, { paidByEmrtAt: getTodayInput() })}
                                    disabled={!canEditEmrtDate || expense.paymentMethod !== "Efectivo"}
                                  >
                                    Hoy
                                  </button>
                                </div>
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.reviewedByJnls}
                                  onChange={(event) => void persistExpensePatch(expense.id, { reviewedByJnls: event.target.checked })}
                                  disabled={!canReviewJnlsFlag || expense.approvedByEmrt}
                                />
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.paid}
                                  onChange={(event) => void persistExpensePatch(expense.id, { paid: event.target.checked })}
                                  disabled={!canPay}
                                />
                              </td>
                              <td>
                                <input
                                  className="general-expense-input"
                                  type="date"
                                  value={toDateInput(expense.paidAt)}
                                  onChange={(event) => void persistExpensePatch(expense.id, { paidAt: event.target.value || null })}
                                  disabled={!canWrite}
                                />
                              </td>
                              <td className="general-expense-money-cell">{distribution.withoutTeam > 0 ? formatCurrency(distribution.withoutTeam) : "-"}</td>
                              <td className="general-expense-money-cell is-accent">{distribution.litigation > 0 ? formatCurrency(distribution.litigation) : "-"}</td>
                              <td className="general-expense-money-cell is-accent">{distribution.corporateLabor > 0 ? formatCurrency(distribution.corporateLabor) : "-"}</td>
                              <td className="general-expense-money-cell is-accent">{distribution.settlements > 0 ? formatCurrency(distribution.settlements) : "-"}</td>
                              <td className="general-expense-money-cell is-accent">{distribution.financialLaw > 0 ? formatCurrency(distribution.financialLaw) : "-"}</td>
                              <td className="general-expense-money-cell is-accent">{distribution.taxCompliance > 0 ? formatCurrency(distribution.taxCompliance) : "-"}</td>
                              <td className="general-expense-money-cell is-total">{distribution.totalPaid > 0 ? formatCurrency(distribution.totalPaid) : "-"}</td>
                              <td>
                                <button
                                  type="button"
                                  className="danger-button general-expense-delete-button"
                                  onClick={() => void handleDelete(expense)}
                                  disabled={!canWrite || expense.approvedByEmrt}
                                >
                                  Borrar
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()
                    )}
                    {!loading && records.length > 0 ? (
                      <tr className="general-expense-totals-row">
                        <td colSpan={22}>Totales distribuidos:</td>
                        <td>{formatCurrency(totals.withoutTeam)}</td>
                        <td>{formatCurrency(totals.litigation)}</td>
                        <td>{formatCurrency(totals.corporateLabor)}</td>
                        <td>{formatCurrency(totals.settlements)}</td>
                        <td>{formatCurrency(totals.financialLaw)}</td>
                        <td>{formatCurrency(totals.taxCompliance)}</td>
                        <td className="is-total">{formatCurrency(totals.totalPaid)}</td>
                        <td></td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="panel">
          <div className="general-expense-emrt-total-card">
            <span>Total pagado por Eduardo Rusconi (mes actual)</span>
            <strong>{formatCurrency(emrtGrandTotal)}</strong>
          </div>
          <div className="lead-table-shell">
            <div className="lead-table-wrapper">
              <table className="lead-table general-expense-emrt-table">
                <thead>
                  <tr>
                    <th>Fecha pagado por EMRT</th>
                    <th>Total pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={2} className="centered-inline-message">
                        Cargando resumen EMRT...
                      </td>
                    </tr>
                  ) : emrtDailyTotals.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="centered-inline-message">
                        Sin gastos con fecha pagada por EMRT en este mes.
                      </td>
                    </tr>
                  ) : (
                    emrtDailyTotals.map((item) => (
                      <tr key={item.date} className="general-expense-emrt-row">
                        <td>
                          <div className="general-expense-emrt-date">{formatDateDisplay(item.date)}</div>
                          <div className="general-expense-emrt-copy-block">
                            <div>
                              <strong>Mensaje copiable para Telegram</strong>
                            </div>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => void handleCopySummary(item.summaryMessage, item.date)}
                            >
                              {copiedSummaryDate === item.date ? "Copiado" : "Copiar mensaje"}
                            </button>
                          </div>
                          <textarea
                            className="general-expense-emrt-textarea"
                            readOnly
                            value={item.summaryMessage}
                          />
                        </td>
                        <td className="general-expense-emrt-total">{formatCurrency(item.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
