import { useEffect, useMemo, useState } from "react";
import type { Client, CommissionReceiver, FinanceRecord, FinanceRecordStats, FinanceSnapshot, Matter } from "@sige/contracts";
import { TEAM_OPTIONS } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

type FinanceTab = "active-matters" | "monthly-view" | "snapshots";
type FinanceMatterRow = Matter & { transferYear: number; transferMonth: number };

type FinanceRecordPatchPayload = {
  clientNumber?: string | null;
  clientName?: string;
  quoteNumber?: string | null;
  matterType?: FinanceRecord["matterType"];
  subject?: string;
  contractSignedStatus?: FinanceRecord["contractSignedStatus"];
  responsibleTeam?: FinanceRecord["responsibleTeam"] | null;
  totalMatterMxn?: number;
  workingConcepts?: string | null;
  conceptFeesMxn?: number;
  previousPaymentsMxn?: number;
  nextPaymentDate?: string | null;
  nextPaymentNotes?: string | null;
  paidThisMonthMxn?: number;
  payment2Mxn?: number;
  payment3Mxn?: number;
  paymentDate1?: string | null;
  paymentDate2?: string | null;
  paymentDate3?: string | null;
  expenseNotes1?: string | null;
  expenseNotes2?: string | null;
  expenseNotes3?: string | null;
  expenseAmount1Mxn?: number;
  expenseAmount2Mxn?: number;
  expenseAmount3Mxn?: number;
  pctLitigation?: number;
  pctCorporateLabor?: number;
  pctSettlements?: number;
  pctFinancialLaw?: number;
  pctTaxCompliance?: number;
  clientCommissionRecipient?: string | null;
  closingCommissionRecipient?: string | null;
  milestone?: string | null;
  concluded?: boolean;
  financeComments?: string | null;
};

type CopyResult = {
  year: number;
  month: number;
  copied: number;
};

const MONTHLY_COLUMN_WIDTHS = [
  "56px",
  "120px",
  "240px",
  "140px",
  "110px",
  "360px",
  "170px",
  "220px",
  "150px",
  "300px",
  "170px",
  "170px",
  "150px",
  "170px",
  "280px",
  "180px",
  "180px",
  "160px",
  "170px",
  "190px",
  "220px",
  "190px",
  "220px",
  "220px",
  "96px",
  "96px",
  "96px",
  "96px",
  "96px",
  "100px",
  "230px",
  "230px",
  "230px",
  "230px",
  "230px",
  "230px",
  "230px",
  "230px",
  "230px",
  "230px",
  "190px",
  "190px",
  "180px",
  "220px",
  "110px",
  "320px",
  "110px"
] as const;

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeComparableText(value?: string | null) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatDateList(values: Array<string | null | undefined>) {
  const dates = values.map(toDateInput).filter(Boolean);
  return dates.length > 0 ? dates.join(" / ") : "-";
}

function getMonthName(month: number) {
  return [
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
  ][month - 1] ?? String(month);
}

function getMatterTypeLabel(type: FinanceRecord["matterType"] | Matter["matterType"]) {
  return type === "RETAINER" ? "Iguala" : "Unico";
}

function getDefaultPercentages(team?: FinanceRecord["responsibleTeam"] | null) {
  return {
    pctLitigation: team === "LITIGATION" ? 100 : 0,
    pctCorporateLabor: team === "CORPORATE_LABOR" ? 100 : 0,
    pctSettlements: team === "SETTLEMENTS" ? 100 : 0,
    pctFinancialLaw: team === "FINANCIAL_LAW" ? 100 : 0,
    pctTaxCompliance: team === "TAX_COMPLIANCE" ? 100 : 0
  };
}

function calculateFinanceStats(record: FinanceRecord): FinanceRecordStats {
  const totalPaidMxn = record.paidThisMonthMxn + record.payment2Mxn + record.payment3Mxn;
  const totalExpensesMxn = record.expenseAmount1Mxn + record.expenseAmount2Mxn + record.expenseAmount3Mxn;
  const netFeesMxn = totalPaidMxn - totalExpensesMxn;
  const remainingMxn = record.conceptFeesMxn - record.previousPaymentsMxn;
  const dueTodayMxn = remainingMxn - totalPaidMxn;
  const clientCommissionMxn = netFeesMxn * 0.2;
  const closingCommissionMxn = netFeesMxn * 0.1;
  const commissionableBaseMxn = netFeesMxn - clientCommissionMxn - closingCommissionMxn;
  const pctSum =
    record.pctLitigation +
    record.pctCorporateLabor +
    record.pctSettlements +
    record.pctFinancialLaw +
    record.pctTaxCompliance;
  const calculateExecutionCommission = (baseRate: number, percentage: number) =>
    percentage <= 0 ? 0 : commissionableBaseMxn * baseRate * (percentage / 100);
  const litigationLeaderCommissionMxn = calculateExecutionCommission(0.08, record.pctLitigation);
  const litigationCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctLitigation);
  const corporateLeaderCommissionMxn = calculateExecutionCommission(0.08, record.pctCorporateLabor);
  const corporateCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctCorporateLabor);
  const settlementsLeaderCommissionMxn = calculateExecutionCommission(0.08, record.pctSettlements);
  const settlementsCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctSettlements);
  const financialLeaderCommissionMxn = calculateExecutionCommission(0.1, record.pctFinancialLaw);
  const financialCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctFinancialLaw);
  const taxLeaderCommissionMxn = calculateExecutionCommission(0.08, record.pctTaxCompliance);
  const taxCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctTaxCompliance);
  const clientRelationsCommissionMxn = commissionableBaseMxn * 0.01;
  const financeCommissionMxn = commissionableBaseMxn * 0.01;
  const netProfitMxn =
    netFeesMxn -
    (
      clientCommissionMxn +
      closingCommissionMxn +
      litigationLeaderCommissionMxn +
      litigationCollaboratorCommissionMxn +
      corporateLeaderCommissionMxn +
      corporateCollaboratorCommissionMxn +
      settlementsLeaderCommissionMxn +
      settlementsCollaboratorCommissionMxn +
      financialLeaderCommissionMxn +
      financialCollaboratorCommissionMxn +
      taxLeaderCommissionMxn +
      taxCollaboratorCommissionMxn +
      clientRelationsCommissionMxn +
      financeCommissionMxn
    );

  return {
    totalPaidMxn,
    totalExpensesMxn,
    netFeesMxn,
    remainingMxn,
    dueTodayMxn,
    clientCommissionMxn,
    closingCommissionMxn,
    commissionableBaseMxn,
    pctSum,
    litigationLeaderCommissionMxn,
    litigationCollaboratorCommissionMxn,
    corporateLeaderCommissionMxn,
    corporateCollaboratorCommissionMxn,
    settlementsLeaderCommissionMxn,
    settlementsCollaboratorCommissionMxn,
    financialLeaderCommissionMxn,
    financialCollaboratorCommissionMxn,
    taxLeaderCommissionMxn,
    taxCollaboratorCommissionMxn,
    clientRelationsCommissionMxn,
    financeCommissionMxn,
    netProfitMxn
  };
}

function buildMatchKeys(input: { quoteNumber?: string | null; clientName?: string | null; subject?: string | null }) {
  const keys: string[] = [];
  const normalizedQuote = normalizeComparableText(input.quoteNumber);
  const normalizedClient = normalizeComparableText(input.clientName);
  const normalizedSubject = normalizeComparableText(input.subject);

  if (normalizedQuote) {
    keys.push(`quote:${normalizedQuote}`);
  }
  if (normalizedClient && normalizedSubject) {
    keys.push(`matter:${normalizedClient}|${normalizedSubject}`);
  }

  return keys;
}

function normalizeRecordPatchForState(patch: FinanceRecordPatchPayload): Partial<FinanceRecord> {
  return {
    ...patch,
    clientNumber: patch.clientNumber ?? undefined,
    quoteNumber: patch.quoteNumber ?? undefined,
    responsibleTeam: patch.responsibleTeam ?? undefined,
    workingConcepts: patch.workingConcepts ?? undefined,
    nextPaymentDate: patch.nextPaymentDate ?? undefined,
    nextPaymentNotes: patch.nextPaymentNotes ?? undefined,
    paymentDate1: patch.paymentDate1 ?? undefined,
    paymentDate2: patch.paymentDate2 ?? undefined,
    paymentDate3: patch.paymentDate3 ?? undefined,
    expenseNotes1: patch.expenseNotes1 ?? undefined,
    expenseNotes2: patch.expenseNotes2 ?? undefined,
    expenseNotes3: patch.expenseNotes3 ?? undefined,
    clientCommissionRecipient: patch.clientCommissionRecipient ?? undefined,
    closingCommissionRecipient: patch.closingCommissionRecipient ?? undefined,
    milestone: patch.milestone ?? undefined,
    financeComments: patch.financeComments ?? undefined
  };
}

function MonthSummaryCards({ records }: { records: FinanceRecord[] }) {
  const totals = useMemo(() => {
    return records.reduce(
      (acc, record) => {
        const stats = calculateFinanceStats(record);
        return {
          income: acc.income + stats.totalPaidMxn,
          expenses: acc.expenses + stats.totalExpensesMxn,
          remainingExpectedThisMonth: acc.remainingExpectedThisMonth + stats.remainingMxn,
          netBeforeCommissions: acc.netBeforeCommissions + stats.netFeesMxn,
          commissions:
            acc.commissions +
            stats.clientCommissionMxn +
            stats.closingCommissionMxn +
            stats.litigationLeaderCommissionMxn +
            stats.litigationCollaboratorCommissionMxn +
            stats.corporateLeaderCommissionMxn +
            stats.corporateCollaboratorCommissionMxn +
            stats.settlementsLeaderCommissionMxn +
            stats.settlementsCollaboratorCommissionMxn +
            stats.financialLeaderCommissionMxn +
            stats.financialCollaboratorCommissionMxn +
            stats.taxLeaderCommissionMxn +
            stats.taxCollaboratorCommissionMxn,
          netAfterCommissions: acc.netAfterCommissions + stats.netProfitMxn
        };
      },
      {
        income: 0,
        expenses: 0,
        remainingExpectedThisMonth: 0,
        netBeforeCommissions: 0,
        commissions: 0,
        netAfterCommissions: 0
      }
    );
  }, [records]);

  const cards = [
    { label: "Ingresos cobrados", value: totals.income, accent: "finance-card-green" },
    { label: "Remanente esperado este mes", value: totals.remainingExpectedThisMonth, accent: "finance-card-red" },
    { label: "Neto antes comisiones", value: totals.netBeforeCommissions, accent: "finance-card-blue" },
    { label: "Comisiones totales", value: totals.commissions, accent: "finance-card-orange" },
    { label: "Neto despues comisiones", value: totals.netAfterCommissions, accent: "finance-card-rose" }
  ];

  return (
    <div className="finance-summary-grid">
      {cards.map((card) => (
        <article className={`finance-summary-card ${card.accent}`} key={card.label}>
          <span>{card.label}</span>
          <strong>{formatCurrency(card.value)}</strong>
        </article>
      ))}
    </div>
  );
}

export function FinancesPage() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN";
  const canDeleteFinanceRecords = isSuperadmin || Boolean(user?.permissions.includes("finances:write"));
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [activeTab, setActiveTab] = useState<FinanceTab>("active-matters");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [snapshots, setSnapshots] = useState<FinanceSnapshot[]>([]);
  const [viewingSnapshot, setViewingSnapshot] = useState<FinanceSnapshot | null>(null);
  const [activeMatters, setActiveMatters] = useState<FinanceMatterRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [receivers, setReceivers] = useState<CommissionReceiver[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentMonthMatchKeys, setCurrentMonthMatchKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyModalOpen, setCopyModalOpen] = useState(false);

  const clientNumberByName = useMemo(() => {
    const lookup = new Map<string, string>();
    clients.forEach((client) => {
      lookup.set(normalizeComparableText(client.name), client.clientNumber);
    });
    return lookup;
  }, [clients]);

  const sortedActiveMatters = useMemo(() => {
    return [...activeMatters].sort((left, right) => {
      const leftNumber = Number.parseInt(
        clientNumberByName.get(normalizeComparableText(left.clientName)) ?? normalizeText(left.clientNumber),
        10
      );
      const rightNumber = Number.parseInt(
        clientNumberByName.get(normalizeComparableText(right.clientName)) ?? normalizeText(right.clientNumber),
        10
      );

      if (Number.isNaN(leftNumber) && Number.isNaN(rightNumber)) {
        return left.createdAt.localeCompare(right.createdAt);
      }
      if (Number.isNaN(leftNumber)) {
        return 1;
      }
      if (Number.isNaN(rightNumber)) {
        return -1;
      }
      if (leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }

      return left.createdAt.localeCompare(right.createdAt);
    });
  }, [activeMatters, clientNumberByName]);

  const uniqueMatters = useMemo(
    () => sortedActiveMatters.filter((matter) => matter.matterType !== "RETAINER"),
    [sortedActiveMatters]
  );
  const retainerMatters = useMemo(
    () => sortedActiveMatters.filter((matter) => matter.matterType === "RETAINER"),
    [sortedActiveMatters]
  );

  async function loadCurrentMonthPresence() {
    const currentRecords = await apiGet<FinanceRecord[]>(`/finances/records?year=${currentYear}&month=${currentMonth}`);
    const nextKeys = new Set<string>();
    currentRecords.forEach((record) => {
      buildMatchKeys(record).forEach((key) => nextKeys.add(key));
    });
    setCurrentMonthMatchKeys(nextKeys);
  }

  async function loadMonthlyView() {
    setLoading(true);
    setError(null);
    try {
      const [nextRecords, nextClients, nextReceivers] = await Promise.all([
        apiGet<FinanceRecord[]>(`/finances/records?year=${selectedYear}&month=${selectedMonth}`),
        apiGet<Client[]>("/clients"),
        apiGet<CommissionReceiver[]>("/finances/commission-receivers")
      ]);
      setRecords(nextRecords);
      setClients(nextClients);
      setReceivers(nextReceivers);
      setSelectedIds(new Set());
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }

  async function loadSnapshotsView() {
    setLoading(true);
    setError(null);
    try {
      const nextSnapshots = await apiGet<FinanceSnapshot[]>("/finances/snapshots");
      setSnapshots(nextSnapshots);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }

  async function loadActiveMattersView() {
    setLoading(true);
    setError(null);
    try {
      const [matters, nextClients] = await Promise.all([
        apiGet<Matter[]>("/matters"),
        apiGet<Client[]>("/clients")
      ]);
      setClients(nextClients);
      setActiveMatters(
        matters.map((matter) => ({
          ...matter,
          transferYear: currentYear,
          transferMonth: currentMonth
        }))
      );
      await loadCurrentMonthPresence();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "monthly-view") {
      void loadMonthlyView();
      return;
    }

    if (activeTab === "snapshots") {
      void loadSnapshotsView();
      return;
    }

    void loadActiveMattersView();
  }, [activeTab, selectedMonth, selectedYear]);

  function resolveClientNumber(clientName?: string | null, fallback?: string | null) {
    return clientNumberByName.get(normalizeComparableText(clientName)) ?? normalizeText(fallback);
  }

  function shouldHighlightMatter(matter: FinanceMatterRow) {
    if (!matter.nextPaymentDate) {
      return true;
    }

    const dueDate = new Date(`${matter.nextPaymentDate.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(dueDate.getTime())) {
      return false;
    }

    const endOfCurrentMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
    if (dueDate > endOfCurrentMonth) {
      return false;
    }

    const matchKeys = buildMatchKeys(matter);
    if (matchKeys.length === 0) {
      return false;
    }

    return !matchKeys.some((key) => currentMonthMatchKeys.has(key));
  }

  function getMatterHighlightMessage() {
    return "Falta la fecha de proximo pago o ya vence este mes o antes, y aun no esta en Finanzas > Ver mes del mes actual.";
  }

  function evaluateMonthlyRecord(record: FinanceRecord) {
    const stats = calculateFinanceStats(record);
    const effectiveClientNumber = resolveClientNumber(record.clientName, record.clientNumber);
    const requiredChecks: Array<{ label: string; present: boolean }> = [
      { label: "numero_cliente", present: Boolean(normalizeText(effectiveClientNumber)) },
      { label: "cliente", present: Boolean(normalizeText(record.clientName)) },
      { label: "numero_cotizacion", present: Boolean(normalizeText(record.quoteNumber)) },
      { label: "asunto", present: Boolean(normalizeText(record.subject)) },
      { label: "total_asunto", present: Boolean(record.totalMatterMxn) },
      { label: "honorarios_conceptos", present: Boolean(record.conceptFeesMxn) },
      { label: "conceptos_trabajando", present: Boolean(normalizeText(record.workingConcepts)) },
      { label: "fecha_pactada_pago", present: Boolean(record.nextPaymentDate) },
      { label: "detalle_fecha_pactada", present: Boolean(normalizeText(record.nextPaymentNotes)) },
      { label: "equipo_responsable", present: Boolean(record.responsibleTeam) },
      { label: "comision_cliente_quien", present: Boolean(normalizeText(record.clientCommissionRecipient)) },
      { label: "comision_cierre_quien", present: Boolean(normalizeText(record.closingCommissionRecipient)) }
    ];
    const missing = requiredChecks.filter((field) => !field.present).map((field) => field.label);
    const today = new Date();
    const todayValue = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const isContractPending = record.contractSignedStatus === "NO";
    const isDateUrgent = Boolean(record.nextPaymentDate && toDateInput(record.nextPaymentDate) <= todayValue && stats.dueTodayMxn > 1);
    const isPctInvalid = stats.pctSum !== 100;
    const reasons: string[] = [];

    if (missing.length > 0) {
      reasons.push(`Faltan datos requeridos: ${missing.join(", ")}.`);
    }
    if (isContractPending) {
      reasons.push("Contrato firmado en NO.");
    }
    if (isDateUrgent) {
      reasons.push("Atencion: tarea urgente (atrasada/hoy no pagada).");
    }
    if (isPctInvalid) {
      reasons.push(`Atencion: la suma de porcentajes es ${stats.pctSum}% y debe ser 100%.`);
    }

    return {
      stats,
      effectiveClientNumber,
      shouldHighlight: reasons.length > 0,
      reason: reasons.join(" ")
    };
  }

  function updateRecordLocal(recordId: string, patch: FinanceRecordPatchPayload) {
    const normalizedPatch = normalizeRecordPatchForState(patch);
    setRecords((current) =>
      current.map((record) => (record.id === recordId ? { ...record, ...normalizedPatch } : record))
    );
  }

  async function persistRecordPatch(recordId: string, patch: FinanceRecordPatchPayload) {
    try {
      const updated = await apiPatch<FinanceRecord>(`/finances/records/${recordId}`, patch);
      setRecords((current) => current.map((record) => (record.id === recordId ? updated : record)));
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function handleMatterNextPaymentDateChange(matterId: string, value: string) {
    const previous = activeMatters;
    setActiveMatters((current) =>
      current.map((matter) => (matter.id === matterId ? { ...matter, nextPaymentDate: value || undefined } : matter))
    );

    try {
      const updated = await apiPatch<Matter>(`/matters/${matterId}`, {
        nextPaymentDate: value || null
      });
      setActiveMatters((current) =>
        current.map((matter) =>
          matter.id === matterId ? { ...matter, nextPaymentDate: updated.nextPaymentDate } : matter
        )
      );
    } catch (caughtError) {
      setActiveMatters(previous);
      setError(toErrorMessage(caughtError));
    }
  }

  function updateMatterTransferTarget(matterId: string, field: "transferYear" | "transferMonth", value: number) {
    setActiveMatters((current) =>
      current.map((matter) => (matter.id === matterId ? { ...matter, [field]: value } : matter))
    );
  }

  async function handleSendMatterToFinance(matter: FinanceMatterRow) {
    try {
      await apiPost<FinanceRecord>("/finances/send-matter", {
        matterId: matter.id,
        year: matter.transferYear,
        month: matter.transferMonth
      });
      window.alert(`Asunto enviado a Finanzas (${getMonthName(matter.transferMonth)} ${matter.transferYear}).`);
      if (matter.transferYear === currentYear && matter.transferMonth === currentMonth) {
        await loadCurrentMonthPresence();
      }
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  function toggleRecordSelection(recordId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  }

  function toggleAllRecords() {
    setSelectedIds((current) => {
      if (current.size === records.length && records.length > 0) {
        return new Set();
      }

      return new Set(records.map((record) => record.id));
    });
  }

  async function handleDeleteRecord(recordId: string) {
    if (!canDeleteFinanceRecords) {
      window.alert("Solo el equipo de Finanzas puede borrar registros.");
      return;
    }

    if (!window.confirm("Borrar este registro?")) {
      return;
    }

    try {
      await apiDelete(`/finances/records/${recordId}`);
      setRecords((current) => current.filter((record) => record.id !== recordId));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(recordId);
        return next;
      });
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function handleBulkDelete() {
    if (!canDeleteFinanceRecords) {
      window.alert("Solo el equipo de Finanzas puede borrar registros.");
      return;
    }

    if (selectedIds.size === 0) {
      return;
    }

    if (!window.confirm(`Borrar ${selectedIds.size} registros seleccionados?`)) {
      return;
    }

    try {
      await apiPost<void>("/finances/records/bulk-delete", { ids: Array.from(selectedIds) });
      setRecords((current) => current.filter((record) => !selectedIds.has(record.id)));
      setSelectedIds(new Set());
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function handleCreateSnapshot() {
    try {
      await apiPost<FinanceSnapshot>("/finances/snapshots", {
        year: selectedYear,
        month: selectedMonth
      });
      window.alert("Estampa guardada correctamente.");
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function handleCopyToNextMonth() {
    try {
      const result = await apiPost<CopyResult>("/finances/records/copy-to-next-month", {
        year: selectedYear,
        month: selectedMonth
      });
      window.alert(`Se copiaron ${result.copied} registros a ${getMonthName(result.month)} ${result.year}.`);
      setCopyModalOpen(false);
      setSelectedYear(result.year);
      setSelectedMonth(result.month);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  function renderMonthlyTable() {
    const totals = records.reduce(
      (acc, record) => {
        const stats = calculateFinanceStats(record);
        return {
          totalMatterMxn: acc.totalMatterMxn + record.totalMatterMxn,
          conceptFeesMxn: acc.conceptFeesMxn + record.conceptFeesMxn,
          previousPaymentsMxn: acc.previousPaymentsMxn + record.previousPaymentsMxn,
          remainingMxn: acc.remainingMxn + stats.remainingMxn,
          totalPaidMxn: acc.totalPaidMxn + stats.totalPaidMxn,
          dueTodayMxn: acc.dueTodayMxn + stats.dueTodayMxn,
          netFeesMxn: acc.netFeesMxn + stats.netFeesMxn,
          clientCommissionMxn: acc.clientCommissionMxn + stats.clientCommissionMxn,
          closingCommissionMxn: acc.closingCommissionMxn + stats.closingCommissionMxn,
          litigationLeaderCommissionMxn: acc.litigationLeaderCommissionMxn + stats.litigationLeaderCommissionMxn,
          litigationCollaboratorCommissionMxn:
            acc.litigationCollaboratorCommissionMxn + stats.litigationCollaboratorCommissionMxn,
          corporateLeaderCommissionMxn: acc.corporateLeaderCommissionMxn + stats.corporateLeaderCommissionMxn,
          corporateCollaboratorCommissionMxn:
            acc.corporateCollaboratorCommissionMxn + stats.corporateCollaboratorCommissionMxn,
          settlementsLeaderCommissionMxn:
            acc.settlementsLeaderCommissionMxn + stats.settlementsLeaderCommissionMxn,
          settlementsCollaboratorCommissionMxn:
            acc.settlementsCollaboratorCommissionMxn + stats.settlementsCollaboratorCommissionMxn,
          financialLeaderCommissionMxn: acc.financialLeaderCommissionMxn + stats.financialLeaderCommissionMxn,
          financialCollaboratorCommissionMxn:
            acc.financialCollaboratorCommissionMxn + stats.financialCollaboratorCommissionMxn,
          taxLeaderCommissionMxn: acc.taxLeaderCommissionMxn + stats.taxLeaderCommissionMxn,
          taxCollaboratorCommissionMxn: acc.taxCollaboratorCommissionMxn + stats.taxCollaboratorCommissionMxn,
          clientRelationsCommissionMxn:
            acc.clientRelationsCommissionMxn + stats.clientRelationsCommissionMxn,
          financeCommissionMxn: acc.financeCommissionMxn + stats.financeCommissionMxn,
          netProfitMxn: acc.netProfitMxn + stats.netProfitMxn
        };
      },
      {
        totalMatterMxn: 0,
        conceptFeesMxn: 0,
        previousPaymentsMxn: 0,
        remainingMxn: 0,
        totalPaidMxn: 0,
        dueTodayMxn: 0,
        netFeesMxn: 0,
        clientCommissionMxn: 0,
        closingCommissionMxn: 0,
        litigationLeaderCommissionMxn: 0,
        litigationCollaboratorCommissionMxn: 0,
        corporateLeaderCommissionMxn: 0,
        corporateCollaboratorCommissionMxn: 0,
        settlementsLeaderCommissionMxn: 0,
        settlementsCollaboratorCommissionMxn: 0,
        financialLeaderCommissionMxn: 0,
        financialCollaboratorCommissionMxn: 0,
        taxLeaderCommissionMxn: 0,
        taxCollaboratorCommissionMxn: 0,
        clientRelationsCommissionMxn: 0,
        financeCommissionMxn: 0,
        netProfitMxn: 0
      }
    );

    return (
      <div className="finance-table-shell">
        <table className="finance-table finance-table-monthly">
          <colgroup>
            {MONTHLY_COLUMN_WIDTHS.map((width, index) => (
              <col key={`finance-monthly-col-${index}`} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th><input type="checkbox" checked={records.length > 0 && selectedIds.size === records.length} onChange={toggleAllRecords} /></th>
              <th>No. Cliente</th>
              <th>Cliente</th>
              <th>No. Cotizacion</th>
              <th>Tipo</th>
              <th>Asunto</th>
              <th>Contrato firmado</th>
              <th>Equipo Responsable</th>
              <th>Total Asunto</th>
              <th>Conceptos trabajando</th>
              <th>Honorarios conceptos</th>
              <th>Pagos previos</th>
              <th>Remanente esperado este mes</th>
              <th>Fecha de proximo pago</th>
              <th>Detalle Fecha</th>
              <th>Pagado este mes</th>
              <th>Fecha Pago Real</th>
              <th>Adeudado hoy</th>
              <th>Honorarios netos</th>
              <th>Comision cliente 20%</th>
              <th>Para quien</th>
              <th>Comision cierre 10%</th>
              <th>Para quien</th>
              <th>Ingresos menos 20% y 10%</th>
              <th>% Litigio</th>
              <th>% Corp-Lab</th>
              <th>% Convenios</th>
              <th>% Der Fin</th>
              <th>% Compl. Fis.</th>
              <th>SUM %</th>
              <th>COM. EJEC. LITIGIO (LIDER 8%)</th>
              <th>COM. EJEC. LITIGIO (COLAB 1%)</th>
              <th>COM. EJEC. CORP-LAB (LIDER 8%)</th>
              <th>COM. EJEC. CORP-LAB (COLAB 1%)</th>
              <th>COM. EJEC. CONVENIOS (LIDER 8%)</th>
              <th>COM. EJEC. CONVENIOS (COLAB 1%)</th>
              <th>COM. EJEC. DER FIN (LIDER 10%)</th>
              <th>COM. EJEC. DER FIN (COLAB 1%)</th>
              <th>COM. EJEC. COMPL FIS (LIDER 8%)</th>
              <th>COM. EJEC. COMPL FIS (COLAB 1%)</th>
              <th>Com. Com. Cliente (1% Neto)</th>
              <th>Com. Finanzas (1% Neto)</th>
              <th>Utilidad neta</th>
              <th>Hito conclusion</th>
              <th>Concluyo?</th>
              <th>Comentarios</th>
              <th>Accion</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const { stats, effectiveClientNumber, shouldHighlight, reason } = evaluateMonthlyRecord(record);
              const isSelected = selectedIds.has(record.id);
              const rowClassName = `${shouldHighlight ? "finance-row-danger" : ""} ${isSelected ? "finance-row-selected" : ""}`.trim();

              return (
                <tr className={rowClassName} key={record.id} title={reason}>
                  <td className="finance-cell-checkbox"><input type="checkbox" checked={isSelected} onChange={() => toggleRecordSelection(record.id)} /></td>
                  <td><input className="finance-input finance-input-readonly" value={effectiveClientNumber} readOnly /></td>
                  <td><input className="finance-input finance-input-readonly" value={record.clientName} readOnly /></td>
                  <td><input className="finance-input finance-input-readonly" value={record.quoteNumber ?? ""} readOnly /></td>
                  <td><span className={`finance-type-pill ${record.matterType === "RETAINER" ? "is-retainer" : ""}`}>{getMatterTypeLabel(record.matterType)}</span></td>
                  <td><input className="finance-input finance-input-readonly" value={record.subject} readOnly /></td>
                  <td>
                    <select
                      className={`finance-input ${record.contractSignedStatus === "NO" ? "finance-select-danger" : ""}`}
                      value={record.contractSignedStatus}
                      onChange={(event) => {
                        const contractSignedStatus = event.target.value as FinanceRecord["contractSignedStatus"];
                        updateRecordLocal(record.id, { contractSignedStatus });
                        void persistRecordPatch(record.id, { contractSignedStatus });
                      }}
                    >
                      <option value="NO">NO</option>
                      <option value="YES">SI</option>
                      <option value="NOT_REQUIRED">No es necesario</option>
                    </select>
                  </td>
                  <td>
                    {record.matterType === "RETAINER" ? (
                      <select
                        className="finance-input"
                        value={record.responsibleTeam ?? ""}
                        onChange={(event) => {
                          const responsibleTeam = (event.target.value || null) as FinanceRecord["responsibleTeam"] | null;
                          const percentages = getDefaultPercentages(responsibleTeam);
                          updateRecordLocal(record.id, { responsibleTeam, ...percentages });
                          void persistRecordPatch(record.id, { responsibleTeam, ...percentages });
                        }}
                      >
                        <option value="">Seleccionar...</option>
                        {TEAM_OPTIONS.filter((option) => ["LITIGATION", "CORPORATE_LABOR", "SETTLEMENTS", "FINANCIAL_LAW", "TAX_COMPLIANCE"].includes(option.key)).map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input className="finance-input finance-input-readonly" value={TEAM_OPTIONS.find((option) => option.key === record.responsibleTeam)?.label ?? ""} readOnly />
                    )}
                  </td>
                  <td><input className="finance-input finance-input-readonly finance-input-number" value={record.totalMatterMxn} readOnly /></td>
                  <td><input className="finance-input" value={record.workingConcepts ?? ""} onChange={(event) => updateRecordLocal(record.id, { workingConcepts: event.target.value })} onBlur={(event) => void persistRecordPatch(record.id, { workingConcepts: event.target.value })} /></td>
                  <td><input className="finance-input finance-input-number" type="number" min="0" step="0.01" value={record.conceptFeesMxn} onChange={(event) => updateRecordLocal(record.id, { conceptFeesMxn: Number(event.target.value || 0) })} onBlur={(event) => void persistRecordPatch(record.id, { conceptFeesMxn: Number(event.target.value || 0) })} /></td>
                  <td><input className="finance-input finance-input-number" type="number" min="0" step="0.01" value={record.previousPaymentsMxn} onChange={(event) => updateRecordLocal(record.id, { previousPaymentsMxn: Number(event.target.value || 0) })} onBlur={(event) => void persistRecordPatch(record.id, { previousPaymentsMxn: Number(event.target.value || 0) })} /></td>
                  <td><input className="finance-input finance-input-readonly finance-input-number" value={stats.remainingMxn} readOnly /></td>
                  <td><input className="finance-input finance-input-readonly" type="date" value={toDateInput(record.nextPaymentDate)} readOnly /></td>
                  <td><input className="finance-input" value={record.nextPaymentNotes ?? ""} onChange={(event) => updateRecordLocal(record.id, { nextPaymentNotes: event.target.value })} onBlur={(event) => void persistRecordPatch(record.id, { nextPaymentNotes: event.target.value })} /></td>
                  <td>
                    <div className="finance-stack">
                      <input className="finance-input finance-input-number" type="number" min="0" step="0.01" value={record.paidThisMonthMxn} onChange={(event) => updateRecordLocal(record.id, { paidThisMonthMxn: Number(event.target.value || 0) })} onBlur={(event) => void persistRecordPatch(record.id, { paidThisMonthMxn: Number(event.target.value || 0) })} />
                      <input className="finance-input finance-input-number" type="number" min="0" step="0.01" value={record.payment2Mxn} onChange={(event) => updateRecordLocal(record.id, { payment2Mxn: Number(event.target.value || 0) })} onBlur={(event) => void persistRecordPatch(record.id, { payment2Mxn: Number(event.target.value || 0) })} />
                      <input className="finance-input finance-input-number" type="number" min="0" step="0.01" value={record.payment3Mxn} onChange={(event) => updateRecordLocal(record.id, { payment3Mxn: Number(event.target.value || 0) })} onBlur={(event) => void persistRecordPatch(record.id, { payment3Mxn: Number(event.target.value || 0) })} />
                    </div>
                  </td>
                  <td>
                    <div className="finance-stack">
                      <input className="finance-input" type="date" value={toDateInput(record.paymentDate1)} onChange={(event) => updateRecordLocal(record.id, { paymentDate1: event.target.value || null })} onBlur={(event) => void persistRecordPatch(record.id, { paymentDate1: event.target.value || null })} />
                      <input className="finance-input" type="date" value={toDateInput(record.paymentDate2)} onChange={(event) => updateRecordLocal(record.id, { paymentDate2: event.target.value || null })} onBlur={(event) => void persistRecordPatch(record.id, { paymentDate2: event.target.value || null })} />
                      <input className="finance-input" type="date" value={toDateInput(record.paymentDate3)} onChange={(event) => updateRecordLocal(record.id, { paymentDate3: event.target.value || null })} onBlur={(event) => void persistRecordPatch(record.id, { paymentDate3: event.target.value || null })} />
                    </div>
                  </td>
                  <td><input className={`finance-input finance-input-readonly finance-input-number ${stats.dueTodayMxn > 0 ? "finance-cell-negative" : ""}`} value={stats.dueTodayMxn} readOnly /></td>
                  <td><input className="finance-input finance-input-readonly finance-input-number finance-cell-positive" value={stats.netFeesMxn} readOnly /></td>
                  <td>{formatCurrency(stats.clientCommissionMxn)}</td>
                  <td>
                    <select className="finance-input" value={record.clientCommissionRecipient ?? ""} onChange={(event) => { const clientCommissionRecipient = event.target.value || null; updateRecordLocal(record.id, { clientCommissionRecipient }); void persistRecordPatch(record.id, { clientCommissionRecipient }); }}>
                      <option value="">Seleccionar...</option>
                      {receivers.map((receiver) => <option key={receiver.id} value={receiver.name}>{receiver.name}</option>)}
                    </select>
                  </td>
                  <td>{formatCurrency(stats.closingCommissionMxn)}</td>
                  <td>
                    <select className="finance-input" value={record.closingCommissionRecipient ?? ""} onChange={(event) => { const closingCommissionRecipient = event.target.value || null; updateRecordLocal(record.id, { closingCommissionRecipient }); void persistRecordPatch(record.id, { closingCommissionRecipient }); }}>
                      <option value="">Seleccionar...</option>
                      {receivers.map((receiver) => <option key={receiver.id} value={receiver.name}>{receiver.name}</option>)}
                    </select>
                  </td>
                  <td className="finance-total-cell">{formatCurrency(stats.netFeesMxn - stats.clientCommissionMxn - stats.closingCommissionMxn)}</td>
                  {([
                    ["pctLitigation", record.pctLitigation],
                    ["pctCorporateLabor", record.pctCorporateLabor],
                    ["pctSettlements", record.pctSettlements],
                    ["pctFinancialLaw", record.pctFinancialLaw],
                    ["pctTaxCompliance", record.pctTaxCompliance]
                  ] as const).map(([field, value]) => (
                    <td key={field}><input className="finance-input finance-input-number" type="number" min="0" max="100" step="1" value={value} onChange={(event) => updateRecordLocal(record.id, { [field]: Number(event.target.value || 0) } as FinanceRecordPatchPayload)} onBlur={(event) => void persistRecordPatch(record.id, { [field]: Number(event.target.value || 0) } as FinanceRecordPatchPayload)} /></td>
                  ))}
                  <td className={stats.pctSum === 100 ? "finance-pct-ok" : "finance-pct-danger"}>{stats.pctSum}%</td>
                  <td>{formatCurrency(stats.litigationLeaderCommissionMxn)}</td>
                  <td>{formatCurrency(stats.litigationCollaboratorCommissionMxn)}</td>
                  <td>{formatCurrency(stats.corporateLeaderCommissionMxn)}</td>
                  <td>{formatCurrency(stats.corporateCollaboratorCommissionMxn)}</td>
                  <td>{formatCurrency(stats.settlementsLeaderCommissionMxn)}</td>
                  <td>{formatCurrency(stats.settlementsCollaboratorCommissionMxn)}</td>
                  <td>{formatCurrency(stats.financialLeaderCommissionMxn)}</td>
                  <td>{formatCurrency(stats.financialCollaboratorCommissionMxn)}</td>
                  <td>{formatCurrency(stats.taxLeaderCommissionMxn)}</td>
                  <td>{formatCurrency(stats.taxCollaboratorCommissionMxn)}</td>
                  <td>{formatCurrency(stats.clientRelationsCommissionMxn)}</td>
                  <td>{formatCurrency(stats.financeCommissionMxn)}</td>
                  <td className="finance-profit-cell">{formatCurrency(stats.netProfitMxn)}</td>
                  <td><input className="finance-input finance-input-readonly" value={record.milestone ?? ""} readOnly /></td>
                  <td className="finance-cell-checkbox"><input type="checkbox" checked={record.concluded} onChange={(event) => { updateRecordLocal(record.id, { concluded: event.target.checked }); void persistRecordPatch(record.id, { concluded: event.target.checked }); }} /></td>
                  <td><textarea className="finance-input finance-textarea" value={record.financeComments ?? ""} onChange={(event) => updateRecordLocal(record.id, { financeComments: event.target.value })} onBlur={(event) => void persistRecordPatch(record.id, { financeComments: event.target.value })} /></td>
                  <td><button className="danger-button finance-inline-button" type="button" onClick={() => void handleDeleteRecord(record.id)}>Borrar</button></td>
                </tr>
              );
            })}
            {!loading && records.length === 0 ? (
              <tr><td className="centered-inline-message" colSpan={47}>Sin registros para esta fecha.</td></tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="finance-total-row">
              <td colSpan={8}>Totales</td>
              <td>{formatCurrency(totals.totalMatterMxn)}</td>
              <td />
              <td>{formatCurrency(totals.conceptFeesMxn)}</td>
              <td>{formatCurrency(totals.previousPaymentsMxn)}</td>
              <td>{formatCurrency(totals.remainingMxn)}</td>
              <td colSpan={2} />
              <td>{formatCurrency(totals.totalPaidMxn)}</td>
              <td />
              <td>{formatCurrency(totals.dueTodayMxn)}</td>
              <td>{formatCurrency(totals.netFeesMxn)}</td>
              <td>{formatCurrency(totals.clientCommissionMxn)}</td>
              <td />
              <td>{formatCurrency(totals.closingCommissionMxn)}</td>
              <td />
              <td>{formatCurrency(totals.netFeesMxn - totals.clientCommissionMxn - totals.closingCommissionMxn)}</td>
              <td colSpan={6} />
              <td>{formatCurrency(totals.litigationLeaderCommissionMxn)}</td>
              <td>{formatCurrency(totals.litigationCollaboratorCommissionMxn)}</td>
              <td>{formatCurrency(totals.corporateLeaderCommissionMxn)}</td>
              <td>{formatCurrency(totals.corporateCollaboratorCommissionMxn)}</td>
              <td>{formatCurrency(totals.settlementsLeaderCommissionMxn)}</td>
              <td>{formatCurrency(totals.settlementsCollaboratorCommissionMxn)}</td>
              <td>{formatCurrency(totals.financialLeaderCommissionMxn)}</td>
              <td>{formatCurrency(totals.financialCollaboratorCommissionMxn)}</td>
              <td>{formatCurrency(totals.taxLeaderCommissionMxn)}</td>
              <td>{formatCurrency(totals.taxCollaboratorCommissionMxn)}</td>
              <td>{formatCurrency(totals.clientRelationsCommissionMxn)}</td>
              <td>{formatCurrency(totals.financeCommissionMxn)}</td>
              <td>{formatCurrency(totals.netProfitMxn)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  function renderActiveMattersTable(items: FinanceMatterRow[], variant: "unique" | "retainer") {
    return (
      <div className="finance-active-table-shell">
        <table className="finance-active-table">
          <thead>
            <tr>
              <th>No. Cliente</th>
              <th>Cliente</th>
              <th>No. Cotizacion</th>
              <th>Tipo</th>
              <th>Asunto</th>
              <th>Honorarios Totales</th>
              <th>Comision cierre</th>
              <th>Equipo Responsable</th>
              <th>Fecha de proximo pago</th>
              <th>Destino (Finanzas)</th>
              <th>Accion</th>
            </tr>
          </thead>
          <tbody>
            {items.map((matter) => {
              const highlight = shouldHighlightMatter(matter);
              const targetDate = new Date(matter.transferYear, matter.transferMonth - 1, 1);
              const currentDate = new Date(currentYear, currentMonth - 1, 1);
              const disabled = targetDate > currentDate;

              return (
                <tr className={highlight ? "finance-row-danger" : variant === "retainer" ? "finance-row-retainer" : ""} key={matter.id} title={highlight ? getMatterHighlightMessage() : ""}>
                  <td>{resolveClientNumber(matter.clientName, matter.clientNumber)}</td>
                  <td>{matter.clientName}</td>
                  <td>{matter.quoteNumber ?? "-"}</td>
                  <td><span className={`finance-type-pill ${matter.matterType === "RETAINER" ? "is-retainer" : ""}`}>{getMatterTypeLabel(matter.matterType)}</span></td>
                  <td>{matter.subject}</td>
                  <td>{formatCurrency(matter.totalFeesMxn)}</td>
                  <td>{matter.commissionAssignee ?? "-"}</td>
                  <td>{TEAM_OPTIONS.find((option) => option.key === matter.responsibleTeam)?.label ?? "-"}</td>
                  <td><input className="finance-input" type="date" value={toDateInput(matter.nextPaymentDate)} onChange={(event) => void handleMatterNextPaymentDateChange(matter.id, event.target.value)} /></td>
                  <td>
                    <div className="finance-target-picker">
                      <select className="finance-input" value={matter.transferYear} onChange={(event) => updateMatterTransferTarget(matter.id, "transferYear", Number(event.target.value))}>
                        {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((year) => <option key={year} value={year}>{year}</option>)}
                      </select>
                      <select className="finance-input" value={matter.transferMonth} onChange={(event) => updateMatterTransferTarget(matter.id, "transferMonth", Number(event.target.value))}>
                        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{getMonthName(month)}</option>)}
                      </select>
                    </div>
                  </td>
                  <td><button className={`finance-send-button ${variant === "retainer" ? "is-retainer" : ""}`} disabled={disabled} onClick={() => void handleSendMatterToFinance(matter)} type="button">Enviar</button></td>
                </tr>
              );
            })}
            {!loading && items.length === 0 ? (
              <tr><td className="centered-inline-message" colSpan={11}>{variant === "retainer" ? "No hay igualas activas." : "No hay asuntos unicos activos."}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    );
  }

  function renderSnapshots() {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>Estampas guardadas</h2>
          <span>{snapshots.length} registros</span>
        </div>
        <div className="finance-snapshot-grid">
          {snapshots.length === 0 ? (
            <p className="muted">No hay estampas guardadas aun.</p>
          ) : (
            snapshots.map((snapshot) => (
              <article className="finance-snapshot-card" key={snapshot.id}>
                <div className="finance-snapshot-head">
                  <strong>{snapshot.title}</strong>
                  <span>{new Date(snapshot.createdAt).toLocaleDateString("es-MX")}</span>
                </div>
                <dl className="finance-snapshot-stats">
                  <dt>Ingresos</dt>
                  <dd>{formatCurrency(snapshot.totalIncomeMxn)}</dd>
                  <dt>Egresos</dt>
                  <dd>{formatCurrency(snapshot.totalExpenseMxn)}</dd>
                  <dt>Balance</dt>
                  <dd>{formatCurrency(snapshot.balanceMxn)}</dd>
                </dl>
                {snapshot.snapshotData?.enrichedRecords?.length ? (
                  <button className="secondary-button" type="button" onClick={() => setViewingSnapshot(snapshot)}>
                    Ver detalle completo
                  </button>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="page-stack finances-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">Finanzas</span>
          <div>
            <h2>Finanzas</h2>
          </div>
        </div>
        <p className="muted">Asuntos activos con envio a Finanzas, vista mensual operativa, copiado al siguiente mes, estampas historicas y validacion visual en rojo.</p>
      </header>

      {error ? <div className="message-banner message-error">{error}</div> : null}

      <section className="panel finance-tabs-panel">
        <div className="finance-tabs">
          <button className={`finance-tab ${activeTab === "active-matters" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("active-matters")}>1. Asuntos activos</button>
          <button className={`finance-tab ${activeTab === "monthly-view" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("monthly-view")}>2. Ver mes</button>
          <button className={`finance-tab ${activeTab === "snapshots" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("snapshots")}>3. Estampas guardadas</button>
        </div>
      </section>

      {activeTab === "active-matters" ? (
        <>
          <section className="panel">
            <div className="panel-header"><h2>1. Asuntos Activos (Unicos)</h2><span>{uniqueMatters.length} registros</span></div>
            {renderActiveMattersTable(uniqueMatters, "unique")}
          </section>
          <section className="panel">
            <div className="panel-header"><h2>2. Igualas por asuntos varios</h2><span>{retainerMatters.length} registros</span></div>
            <p className="muted matter-table-caption">Los renglones siguen mostrando rojo cuando falta la fecha de proximo pago o el asunto ya debia estar visible en el mes actual.</p>
            {renderActiveMattersTable(retainerMatters, "retainer")}
          </section>
        </>
      ) : null}

      {activeTab === "monthly-view" ? (
        <section className="panel">
          <div className="finance-toolbar">
            <div className="finance-toolbar-group">
              <label className="form-field">
                <span>Ano</span>
                <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                  {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>Mes</span>
                <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{getMonthName(month)}</option>)}
                </select>
              </label>
            </div>
            <div className="finance-toolbar-actions">
              {selectedIds.size > 0 ? <button className="danger-button" type="button" onClick={() => void handleBulkDelete()}>Borrar ({selectedIds.size})</button> : null}
              <button className="secondary-button" type="button" onClick={() => void handleCreateSnapshot()}>Guardar estampa</button>
              <button className="primary-button" type="button" onClick={() => setCopyModalOpen(true)}>Copiar todo al mes siguiente</button>
            </div>
          </div>
          <MonthSummaryCards records={records} />
          {renderMonthlyTable()}
        </section>
      ) : null}

      {activeTab === "snapshots" ? renderSnapshots() : null}

      {copyModalOpen ? (
        <div className="finance-modal-backdrop">
          <div className="finance-modal">
            <h3>Advertencia</h3>
            <p>Esta accion borrara todos los registros existentes del siguiente mes y los reemplazara con los registros actuales.</p>
            <div className="finance-modal-actions">
              <button className="secondary-button" type="button" onClick={() => setCopyModalOpen(false)}>Cancelar</button>
              <button className="danger-button" type="button" onClick={() => void handleCopyToNextMonth()}>Continuar</button>
            </div>
          </div>
        </div>
      ) : null}

      {viewingSnapshot ? (
        <div className="finance-modal-backdrop">
          <div className="finance-modal finance-modal-wide">
            <div className="finance-modal-head">
              <div>
                <h3>{viewingSnapshot.title}</h3>
                <p className="muted">Guardado: {new Date(viewingSnapshot.createdAt).toLocaleString("es-MX")}</p>
              </div>
              <button className="secondary-button" type="button" onClick={() => setViewingSnapshot(null)}>Cerrar</button>
            </div>
            <div className="finance-table-shell">
              <table className="finance-table finance-table-snapshot">
                <thead>
                  <tr>
                    <th>No.</th><th>Cliente</th><th>No. Cot.</th><th>Responsable</th><th>Tipo Asunto</th><th>Asunto</th><th>Tipo</th><th>Total Asunto</th><th>Conceptos</th><th>Hon. Conceptos</th><th>Pagos Previos</th><th>Remanente</th><th>Fecha de proximo pago</th><th>Semana</th><th>Pagado este mes</th><th>Fecha Pago Real</th><th>Adeudado</th><th>Netos</th><th>Comm Cliente (20%)</th><th>Comm Cierre (10%)</th><th>Ut. Neta</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingSnapshot.snapshotData?.enrichedRecords ?? []).map((record, index) => {
                    const stats = calculateFinanceStats(record);
                    const paymentDates = formatDateList([record.paymentDate1, record.paymentDate2, record.paymentDate3]);
                    return (
                      <tr key={`${viewingSnapshot.id}-${record.id}`}>
                        <td>{index + 1}</td>
                        <td>{record.clientName}</td>
                        <td>{record.quoteNumber ?? "-"}</td>
                        <td>{TEAM_OPTIONS.find((option) => option.key === record.responsibleTeam)?.label ?? "-"}</td>
                        <td>{getMatterTypeLabel(record.matterType)}</td>
                        <td>{record.subject}</td>
                        <td>Ingreso</td>
                        <td>{formatCurrency(record.totalMatterMxn)}</td>
                        <td>{record.workingConcepts ?? "-"}</td>
                        <td>{formatCurrency(record.conceptFeesMxn)}</td>
                        <td>{formatCurrency(record.previousPaymentsMxn)}</td>
                        <td>{formatCurrency(stats.remainingMxn)}</td>
                        <td>{toDateInput(record.nextPaymentDate) || "-"}</td>
                        <td>-</td>
                        <td>{formatCurrency(stats.totalPaidMxn)}</td>
                        <td>{paymentDates}</td>
                        <td>{formatCurrency(stats.dueTodayMxn)}</td>
                        <td>{formatCurrency(stats.netFeesMxn)}</td>
                        <td>{formatCurrency(stats.clientCommissionMxn)}</td>
                        <td>{formatCurrency(stats.closingCommissionMxn)}</td>
                        <td>{formatCurrency(stats.netProfitMxn)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
