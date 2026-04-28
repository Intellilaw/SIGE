import { useEffect, useMemo, useState } from "react";
import type {
  Client,
  CommissionBreakdownEntry,
  CommissionReceiver,
  CommissionSection,
  CommissionSnapshot,
  CommissionSnapshotData,
  FinanceRecord,
  FinanceRecordStats,
  GeneralExpense
} from "@sige/contracts";
import { COMMISSION_SECTIONS } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

type ActiveTab = "calculation" | "receivers" | "snapshots";

type FlashState =
  | {
      tone: "success" | "error";
      text: string;
    }
  | null;

interface CommissionsOverviewResponse {
  financeRecords: FinanceRecord[];
  generalExpenses: GeneralExpense[];
  receivers: CommissionReceiver[];
}

interface ComputedFinanceRecord extends FinanceRecord, FinanceRecordStats {
  effectiveClientNumber?: string;
  highlighted: boolean;
  highlightReason?: string;
}

interface SectionCalculation {
  financeRecords: ComputedFinanceRecord[];
  executionRecords: CommissionBreakdownEntry[];
  clientRecords: CommissionBreakdownEntry[];
  closingRecords: CommissionBreakdownEntry[];
  highlightedCount: number;
  grossTotalMxn: number;
  deductionRate: number;
  deductionBaseMxn: number;
  deductionMxn: number;
  netTotalMxn: number;
}

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

const EMPTY_CALCULATION: SectionCalculation = {
  financeRecords: [],
  executionRecords: [],
  clientRecords: [],
  closingRecords: [],
  highlightedCount: 0,
  grossTotalMxn: 0,
  deductionRate: 0,
  deductionBaseMxn: 0,
  deductionMxn: 0,
  netTotalMxn: 0
};

function normalizeText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN"
  }).format(value);
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString();
}

function toDateKey(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
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

function resolveEffectiveClientNumber(record: FinanceRecord, clients: Client[]) {
  if (record.clientNumber) {
    return record.clientNumber;
  }

  const match = clients.find((client) => normalizeText(client.name) === normalizeText(record.clientName));
  return match?.clientNumber;
}

function getExecutionAmount(record: FinanceRecord, stats: FinanceRecordStats, section: string) {
  const normalizedSection = normalizeText(section);

  switch (normalizedSection) {
    case normalizeText("Litigio (lider)"):
      return record.responsibleTeam === "LITIGATION" ? stats.litigationLeaderCommissionMxn : 0;
    case normalizeText("Litigio (colaborador)"):
      return record.responsibleTeam === "LITIGATION" ? stats.litigationCollaboratorCommissionMxn : 0;
    case normalizeText("Corporativo-laboral (lider)"):
      return record.responsibleTeam === "CORPORATE_LABOR" ? stats.corporateLeaderCommissionMxn : 0;
    case normalizeText("Corporativo-laboral (colaborador)"):
      return record.responsibleTeam === "CORPORATE_LABOR" ? stats.corporateCollaboratorCommissionMxn : 0;
    case normalizeText("Convenios (lider)"):
      return record.responsibleTeam === "SETTLEMENTS" ? stats.settlementsLeaderCommissionMxn : 0;
    case normalizeText("Convenios (colaborador)"):
      return record.responsibleTeam === "SETTLEMENTS" ? stats.settlementsCollaboratorCommissionMxn : 0;
    case normalizeText("Der Financiero (lider)"):
      return record.responsibleTeam === "FINANCIAL_LAW" ? stats.financialLeaderCommissionMxn : 0;
    case normalizeText("Der Financiero (colaborador)"):
      return record.responsibleTeam === "FINANCIAL_LAW" ? stats.financialCollaboratorCommissionMxn : 0;
    case normalizeText("Compliance Fiscal (lider)"):
      return record.responsibleTeam === "TAX_COMPLIANCE" ? stats.taxLeaderCommissionMxn : 0;
    case normalizeText("Compliance Fiscal (colaborador)"):
      return record.responsibleTeam === "TAX_COMPLIANCE" ? stats.taxCollaboratorCommissionMxn : 0;
    case normalizeText("Comunicacion con cliente"):
      return stats.clientRelationsCommissionMxn;
    case normalizeText("Finanzas"):
      return stats.financeCommissionMxn;
    default:
      return 0;
  }
}

function getDeductionConfiguration(section: string) {
  const normalizedSection = normalizeText(section);

  switch (normalizedSection) {
    case normalizeText("Litigio (lider)"):
      return { rate: 0.08, teamLabel: "Litigio", useAllExpenses: false };
    case normalizeText("Litigio (colaborador)"):
      return { rate: 0.01, teamLabel: "Litigio", useAllExpenses: false };
    case normalizeText("Corporativo-laboral (lider)"):
      return { rate: 0.08, teamLabel: "Corporativo y laboral", useAllExpenses: false };
    case normalizeText("Corporativo-laboral (colaborador)"):
      return { rate: 0.01, teamLabel: "Corporativo y laboral", useAllExpenses: false };
    case normalizeText("Convenios (lider)"):
      return { rate: 0.08, teamLabel: "Convenios", useAllExpenses: false };
    case normalizeText("Convenios (colaborador)"):
      return { rate: 0.01, teamLabel: "Convenios", useAllExpenses: false };
    case normalizeText("Der Financiero (lider)"):
      return { rate: 0, teamLabel: "Der Financiero", useAllExpenses: false };
    case normalizeText("Der Financiero (colaborador)"):
      return { rate: 0.01, teamLabel: "Der Financiero", useAllExpenses: false };
    case normalizeText("Compliance Fiscal (lider)"):
      return { rate: 0.08, teamLabel: "Compliance Fiscal", useAllExpenses: false };
    case normalizeText("Compliance Fiscal (colaborador)"):
      return { rate: 0.01, teamLabel: "Compliance Fiscal", useAllExpenses: false };
    case normalizeText("Comunicacion con cliente"):
    case normalizeText("Finanzas"):
      return { rate: 0.01, teamLabel: "", useAllExpenses: true };
    default:
      return { rate: 0, teamLabel: "", useAllExpenses: false };
  }
}

function buildHighlightReason(record: FinanceRecord, stats: FinanceRecordStats, clients: Client[]) {
  const effectiveClientNumber = resolveEffectiveClientNumber(record, clients);
  const requiredFields = [
    { label: "numero_cliente", missing: !effectiveClientNumber },
    { label: "cliente", missing: normalizeText(record.clientName).length === 0 },
    { label: "numero_cotizacion", missing: normalizeText(record.quoteNumber).length === 0 },
    { label: "asunto", missing: normalizeText(record.subject).length === 0 },
    { label: "total_asunto", missing: record.totalMatterMxn <= 0 },
    { label: "honorarios_conceptos", missing: record.conceptFeesMxn <= 0 },
    { label: "conceptos_trabajando", missing: normalizeText(record.workingConcepts).length === 0 },
    { label: "fecha_pactada_pago", missing: normalizeText(record.nextPaymentDate).length === 0 },
    { label: "detalle_fecha_pactada", missing: normalizeText(record.nextPaymentNotes).length === 0 },
    { label: "equipo_responsable", missing: !record.responsibleTeam },
    { label: "comision_cliente_quien", missing: normalizeText(record.clientCommissionRecipient).length === 0 },
    { label: "comision_cierre_quien", missing: normalizeText(record.closingCommissionRecipient).length === 0 }
  ];

  const missing = requiredFields.filter((field) => field.missing).map((field) => field.label);
  const today = new Date();
  const todayKey = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
  const nextPaymentDateKey = toDateKey(record.nextPaymentDate);
  const isDateUrgent = Boolean(nextPaymentDateKey) && nextPaymentDateKey <= todayKey && stats.dueTodayMxn > 1;
  const isSumIncorrect = stats.pctSum !== 100;
  const isContractPending = record.contractSignedStatus === "NO";

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`Faltan datos requeridos: ${missing.join(", ")}.`);
  }
  if (isContractPending) {
    parts.push("Contrato firmado en NO.");
  }
  if (isDateUrgent) {
    parts.push("ATENCION: tarea urgente por fecha pactada vencida o de hoy sin pago suficiente.");
  }
  if (isSumIncorrect) {
    parts.push(`ATENCION: la suma de porcentajes es ${stats.pctSum}%, debe ser 100%.`);
  }

  return parts.join(" ");
}

function calculateSection(
  financeRecords: FinanceRecord[],
  generalExpenses: GeneralExpense[],
  clients: Client[],
  section: string
): SectionCalculation {
  if (!section) {
    return EMPTY_CALCULATION;
  }

  const computedRecords: ComputedFinanceRecord[] = financeRecords.map((record) => {
    const stats = calculateFinanceStats(record);
    const highlightReason = buildHighlightReason(record, stats, clients);

    return {
      ...record,
      ...stats,
      effectiveClientNumber: resolveEffectiveClientNumber(record, clients),
      highlighted: highlightReason.length > 0,
      highlightReason: highlightReason || undefined
    };
  });

  const executionRecords = computedRecords
    .map<CommissionBreakdownEntry | null>((record) => {
      const amountMxn = getExecutionAmount(record, record, section);
      if (amountMxn <= 0) {
        return null;
      }

      const showOnePercentBase = ["Comunicacion con cliente", "Finanzas"].some(
        (targetSection) => normalizeText(targetSection) === normalizeText(section)
      );

      return {
        financeRecordId: record.id,
        clientName: record.clientName,
        clientNumber: record.effectiveClientNumber,
        quoteNumber: record.quoteNumber,
        subject: `${record.subject}${showOnePercentBase ? " (1% Base)" : ""}`,
        group: "EXECUTION",
        baseNetMxn: record.netFeesMxn,
        amountMxn,
        highlighted: record.highlighted,
        highlightReason: record.highlightReason
      };
    })
    .filter((record): record is CommissionBreakdownEntry => record !== null);

  const clientRecords = computedRecords
    .filter((record) => normalizeText(record.clientCommissionRecipient) === normalizeText(section) && record.clientCommissionMxn > 0)
    .map<CommissionBreakdownEntry>((record) => ({
      financeRecordId: record.id,
      clientName: record.clientName,
      clientNumber: record.effectiveClientNumber,
      quoteNumber: record.quoteNumber,
      subject: record.subject,
      group: "CLIENT",
      baseNetMxn: record.netFeesMxn,
      amountMxn: record.clientCommissionMxn,
      highlighted: record.highlighted,
      highlightReason: record.highlightReason
    }));

  const closingRecords = computedRecords
    .filter((record) => normalizeText(record.closingCommissionRecipient) === normalizeText(section) && record.closingCommissionMxn > 0)
    .map<CommissionBreakdownEntry>((record) => ({
      financeRecordId: record.id,
      clientName: record.clientName,
      clientNumber: record.effectiveClientNumber,
      quoteNumber: record.quoteNumber,
      subject: record.subject,
      group: "CLOSING",
      baseNetMxn: record.netFeesMxn,
      amountMxn: record.closingCommissionMxn,
      highlighted: record.highlighted,
      highlightReason: record.highlightReason
    }));

  const grossTotalMxn =
    executionRecords.reduce((sum, record) => sum + record.amountMxn, 0) +
    clientRecords.reduce((sum, record) => sum + record.amountMxn, 0) +
    closingRecords.reduce((sum, record) => sum + record.amountMxn, 0);

  const deductionConfiguration = getDeductionConfiguration(section);
  const deductionBaseMxn = generalExpenses.reduce((sum, expense) => {
    if (deductionConfiguration.useAllExpenses) {
      return sum + expense.amountMxn;
    }

    const isGeneralExpense = expense.generalExpense || normalizeText(expense.team) === normalizeText("General");
    if (isGeneralExpense) {
      return sum + (expense.amountMxn / 5);
    }

    if (normalizeText(expense.team) === normalizeText(deductionConfiguration.teamLabel)) {
      return sum + expense.amountMxn;
    }

    return sum;
  }, 0);

  const deductionMxn = deductionBaseMxn * deductionConfiguration.rate;

  return {
    financeRecords: computedRecords,
    executionRecords,
    clientRecords,
    closingRecords,
    highlightedCount: computedRecords.filter((record) => record.highlighted).length,
    grossTotalMxn,
    deductionRate: deductionConfiguration.rate,
    deductionBaseMxn,
    deductionMxn,
    netTotalMxn: grossTotalMxn - deductionMxn
  };
}

function CurrencyMetricCard(props: {
  label: string;
  value: number;
  accentClass: string;
  helper?: string;
}) {
  return (
    <article className={`commissions-metric-card ${props.accentClass}`}>
      <span>{props.label}</span>
      <strong>{formatCurrency(props.value)}</strong>
      {props.helper ? <small>{props.helper}</small> : null}
    </article>
  );
}

function CountMetricCard(props: {
  label: string;
  value: number;
  accentClass: string;
  helper?: string;
}) {
  return (
    <article className={`commissions-metric-card ${props.accentClass}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.helper ? <small>{props.helper}</small> : null}
    </article>
  );
}

function CommissionGroupTable(props: {
  title: string;
  toneClass: string;
  rows: CommissionBreakdownEntry[];
  showBaseNet?: boolean;
}) {
  const total = props.rows.reduce((sum, row) => sum + row.amountMxn, 0);
  const totalColumns = props.showBaseNet ? 4 : 3;
  const totalLabelColumns = props.showBaseNet ? 3 : 2;

  return (
    <section className="panel commissions-group-panel">
      <div className="panel-header">
        <h2>{props.title}</h2>
        <span>{props.rows.length} registros</span>
      </div>
      <div className="table-scroll">
        <table className={`data-table commissions-group-table ${props.toneClass}`}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Asunto</th>
              {props.showBaseNet ? <th>Base Neta</th> : null}
              <th>{props.showBaseNet ? "Comision" : "Monto"}</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.length === 0 ? (
              <tr>
                <td colSpan={totalColumns}>Sin comisiones en este rubro.</td>
              </tr>
            ) : (
              props.rows.map((row) => (
                <tr
                  key={`${row.group}-${row.financeRecordId}`}
                  className={row.highlighted ? "commissions-row-alert" : undefined}
                  style={row.highlighted ? { backgroundColor: "#fee2e2" } : undefined}
                  title={row.highlightReason}
                >
                  <td>{row.clientName || "-"}</td>
                  <td>{row.subject || "-"}</td>
                  {props.showBaseNet ? <td>{formatCurrency(row.baseNetMxn)}</td> : null}
                  <td>{formatCurrency(row.amountMxn)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={totalLabelColumns}>Total rubro</td>
              <td>{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function SnapshotDetailModal(props: {
  snapshot: CommissionSnapshot;
  onClose: () => void;
}) {
  const data = props.snapshot.snapshotData as CommissionSnapshotData | undefined;

  return (
    <div className="commissions-modal-backdrop" onClick={props.onClose}>
      <div className="commissions-modal" onClick={(event) => event.stopPropagation()}>
        <div className="commissions-modal-header">
          <div>
            <h2>{props.snapshot.title}</h2>
            <p className="muted">
              {props.snapshot.section} | {MONTH_NAMES[props.snapshot.month - 1]} {props.snapshot.year}
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={props.onClose}>
            Cerrar
          </button>
        </div>

        {!data ? (
          <div className="commissions-modal-body">
            <p className="muted">No hay detalle disponible para esta estampa.</p>
          </div>
        ) : (
          <div className="commissions-modal-body">
            <div className="commissions-metrics-grid">
              <CurrencyMetricCard label="Bruto" value={data.grossTotalMxn} accentClass="is-primary" />
              <CurrencyMetricCard
                label="Deduccion"
                value={data.deductionMxn}
                accentClass="is-warning"
                helper={`${Math.round(data.deductionRate * 100)}% de ${formatCurrency(data.deductionBaseMxn)}`}
              />
              <CurrencyMetricCard label="Neto" value={data.netTotalMxn} accentClass="is-success" />
            </div>

            <CommissionGroupTable title="1. Comision por ejecucion" toneClass="tone-primary" rows={data.executionRecords} showBaseNet />
            <CommissionGroupTable title="2. Comision por cliente" toneClass="tone-secondary" rows={data.clientRecords} showBaseNet />
            <CommissionGroupTable title="3. Comision por cierre" toneClass="tone-tertiary" rows={data.closingRecords} showBaseNet />
          </div>
        )}
      </div>
    </div>
  );
}

export function CommissionsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("calculation");
  const [activeSection, setActiveSection] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>([]);
  const [generalExpenses, setGeneralExpenses] = useState<GeneralExpense[]>([]);
  const [receivers, setReceivers] = useState<CommissionReceiver[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [snapshots, setSnapshots] = useState<CommissionSnapshot[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [loadingSnapshots, setLoadingSnapshots] = useState(true);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [savingReceiver, setSavingReceiver] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newReceiverName, setNewReceiverName] = useState("");
  const [editingReceiverId, setEditingReceiverId] = useState<string | null>(null);
  const [editingReceiverName, setEditingReceiverName] = useState("");
  const [viewingSnapshot, setViewingSnapshot] = useState<CommissionSnapshot | null>(null);

  const visibleSections = useMemo(() => {
    const userRole = normalizeText(user?.specificRole);

    if (user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN") {
      return [...COMMISSION_SECTIONS];
    }

    return COMMISSION_SECTIONS.filter((section) => normalizeText(section) === userRole);
  }, [user?.legacyRole, user?.role, user?.specificRole]);

  const canAccessCalculation = visibleSections.length > 0;

  useEffect(() => {
    if (visibleSections.length === 0) {
      setActiveSection("");
      return;
    }

    if (!visibleSections.includes(activeSection as CommissionSection)) {
      setActiveSection(visibleSections[0]);
    }
  }, [activeSection, visibleSections]);

  async function loadBoard() {
    setLoadingBoard(true);
    setErrorMessage(null);

    try {
      const [overview, clientsResponse] = await Promise.all([
        apiGet<CommissionsOverviewResponse>(`/commissions/overview?year=${selectedYear}&month=${selectedMonth}`),
        apiGet<Client[]>("/clients")
      ]);

      setFinanceRecords(overview.financeRecords);
      setGeneralExpenses(overview.generalExpenses);
      setReceivers(overview.receivers);
      setClients(clientsResponse);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoadingBoard(false);
    }
  }

  async function loadSnapshots() {
    setLoadingSnapshots(true);

    try {
      const data = await apiGet<CommissionSnapshot[]>("/commissions/snapshots");
      setSnapshots(data);
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setLoadingSnapshots(false);
    }
  }

  useEffect(() => {
    void loadBoard();
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    void loadSnapshots();
  }, []);

  const sectionCalculation = useMemo(
    () => calculateSection(financeRecords, generalExpenses, clients, activeSection),
    [activeSection, clients, financeRecords, generalExpenses]
  );

  async function handleCreateReceiver() {
    const name = newReceiverName.trim();
    if (!name) {
      return;
    }

    setSavingReceiver(true);
    setFlash(null);

    try {
      const receiver = await apiPost<CommissionReceiver>("/commissions/receivers", { name });
      setReceivers((current) => [...current, receiver].sort((left, right) => left.name.localeCompare(right.name)));
      setNewReceiverName("");
      setFlash({ tone: "success", text: "Receptor agregado correctamente." });
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setSavingReceiver(false);
    }
  }

  async function handleUpdateReceiver() {
    if (!editingReceiverId || !editingReceiverName.trim()) {
      return;
    }

    setSavingReceiver(true);
    setFlash(null);

    try {
      const receiver = await apiPatch<CommissionReceiver>(`/commissions/receivers/${editingReceiverId}`, {
        name: editingReceiverName.trim()
      });
      setReceivers((current) =>
        current
          .map((entry) => (entry.id === receiver.id ? receiver : entry))
          .sort((left, right) => left.name.localeCompare(right.name))
      );
      setEditingReceiverId(null);
      setEditingReceiverName("");
      setFlash({ tone: "success", text: "Receptor actualizado correctamente." });
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setSavingReceiver(false);
    }
  }

  async function handleDeleteReceiver(receiverId: string) {
    if (!window.confirm("Eliminar este receptor puede afectar calculos historicos. Deseas continuar?")) {
      return;
    }

    setSavingReceiver(true);
    setFlash(null);

    try {
      await apiDelete(`/commissions/receivers/${receiverId}`);
      setReceivers((current) => current.filter((entry) => entry.id !== receiverId));
      setFlash({ tone: "success", text: "Receptor eliminado correctamente." });
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setSavingReceiver(false);
    }
  }

  async function handleCreateSnapshot() {
    if (!activeSection) {
      setFlash({ tone: "error", text: "Selecciona primero una seccion para guardar la estampa." });
      return;
    }

    setSavingSnapshot(true);
    setFlash(null);

    const snapshotData: CommissionSnapshotData = {
      section: activeSection,
      financeRecords: sectionCalculation.financeRecords,
      generalExpenses,
      executionRecords: sectionCalculation.executionRecords,
      clientRecords: sectionCalculation.clientRecords,
      closingRecords: sectionCalculation.closingRecords,
      grossTotalMxn: sectionCalculation.grossTotalMxn,
      deductionRate: sectionCalculation.deductionRate,
      deductionBaseMxn: sectionCalculation.deductionBaseMxn,
      deductionMxn: sectionCalculation.deductionMxn,
      netTotalMxn: sectionCalculation.netTotalMxn,
      createdAt: new Date().toISOString()
    };

    try {
      const snapshot = await apiPost<CommissionSnapshot>("/commissions/snapshots", {
        year: selectedYear,
        month: selectedMonth,
        section: activeSection,
        title: `Estampa: ${activeSection} - ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`,
        totalNetMxn: sectionCalculation.netTotalMxn,
        snapshotData
      });
      setSnapshots((current) => [...current, snapshot]);
      setFlash({ tone: "success", text: "Estampa guardada correctamente." });
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setSavingSnapshot(false);
    }
  }

  const snapshotCards = loadingSnapshots ? [] : snapshots;
  const activeSectionLabel = activeSection || "Sin seccion";
  const shouldShowDeductionPanel = Boolean(activeSection && normalizeText(activeSection) !== normalizeText("Direccion general"));
  const yearOptions = Array.from({ length: 7 }, (_, index) => 2024 + index);

  return (
    <section className="page-stack commissions-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            Com
          </span>
          <div>
            <h2>Comisiones</h2>
          </div>
        </div>
        <p className="muted">
          Calculo por seccion, deduccion por gastos pagados, receptores editables, estampas historicas y resaltado
          visual en rojo sobre filas derivadas de registros incompletos.
        </p>
      </header>

      {flash ? <div className={`message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`}>{flash.text}</div> : null}
      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      <section className="panel">
        <div className="commissions-tabs" role="tablist" aria-label="Pestanas de comisiones">
          <button
            type="button"
            className={`commissions-tab ${activeTab === "calculation" ? "is-active" : ""}`}
            onClick={() => setActiveTab("calculation")}
          >
            Calculo de comisiones
          </button>
          <button
            type="button"
            className={`commissions-tab ${activeTab === "receivers" ? "is-active" : ""}`}
            onClick={() => setActiveTab("receivers")}
          >
            Receptores
          </button>
          <button
            type="button"
            className={`commissions-tab ${activeTab === "snapshots" ? "is-active" : ""}`}
            onClick={() => setActiveTab("snapshots")}
          >
            Estampas guardadas
          </button>
        </div>
      </section>

      {activeTab === "calculation" ? (
        canAccessCalculation ? (
          <div className="commissions-layout">
            <aside className="panel commissions-sidebar">
              <div className="panel-header">
                <h2>Secciones</h2>
                <span>{visibleSections.length}</span>
              </div>
              <div className="commissions-sidebar-list">
                {visibleSections.map((section) => (
                  <button
                    type="button"
                    key={section}
                    className={`commissions-sidebar-button ${section === activeSection ? "is-active" : ""}`}
                    onClick={() => setActiveSection(section)}
                  >
                    {section}
                  </button>
                ))}
              </div>
            </aside>

            <div className="commissions-main">
              <section className="panel">
                <div className="panel-header">
                  <h2>{activeSectionLabel}</h2>
                  <span>
                    {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                  </span>
                </div>

                <div className="commissions-toolbar">
                  <label className="form-field">
                    <span>Ano</span>
                    <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Mes</span>
                    <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
                      {MONTH_NAMES.map((monthLabel, index) => (
                        <option key={monthLabel} value={index + 1}>
                          {monthLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="secondary-button" type="button" onClick={() => void loadBoard()}>
                    Refrescar
                  </button>
                  <button className="primary-button" type="button" onClick={() => void handleCreateSnapshot()} disabled={savingSnapshot}>
                    {savingSnapshot ? "Guardando..." : "Guardar estampa"}
                  </button>
                </div>

                <div className="commissions-metrics-grid">
                  <CurrencyMetricCard label="Total bruto" value={sectionCalculation.grossTotalMxn} accentClass="is-primary" />
                  <CurrencyMetricCard
                    label="Deduccion por gastos"
                    value={sectionCalculation.deductionMxn}
                    accentClass="is-warning"
                    helper={`${Math.round(sectionCalculation.deductionRate * 100)}% de ${formatCurrency(sectionCalculation.deductionBaseMxn)}`}
                  />
                  <CurrencyMetricCard label="Neto a pagar" value={sectionCalculation.netTotalMxn} accentClass="is-success" />
                  <CountMetricCard
                    label="Registros fuente"
                    value={sectionCalculation.financeRecords.length}
                    accentClass="is-neutral"
                    helper={`${sectionCalculation.highlightedCount} en rojo`}
                  />
                </div>
              </section>

              {loadingBoard ? (
                <section className="panel">
                  <div className="centered-inline-message">Cargando informacion de comisiones...</div>
                </section>
              ) : (
                <>
                  <div className="commissions-group-grid">
                    <CommissionGroupTable
                      title="PRIMER GRUPO: Comisiones de Ejecucion"
                      toneClass="tone-primary"
                      rows={sectionCalculation.executionRecords}
                    />
                    <CommissionGroupTable
                      title="SEGUNDO GRUPO: Comisiones de Cliente (20%)"
                      toneClass="tone-secondary"
                      rows={sectionCalculation.clientRecords}
                    />
                    <CommissionGroupTable
                      title="TERCER GRUPO: Comisiones de Cierre (10%)"
                      toneClass="tone-tertiary"
                      rows={sectionCalculation.closingRecords}
                    />
                  </div>

                  {shouldShowDeductionPanel ? (
                    <section className="panel commissions-deduction-panel">
                      <div className="panel-header">
                        <h2>Deduccion de gastos ({Math.round(sectionCalculation.deductionRate * 100)}%)</h2>
                        <span>{formatCurrency(sectionCalculation.deductionMxn)}</span>
                      </div>
                      <p className="muted commissions-caption">
                        El total de gastos atribuibles a tu equipo este mes asciende a{" "}
                        <strong>{formatCurrency(sectionCalculation.deductionBaseMxn)}</strong>. De dicha suma, el{" "}
                        {Math.round(sectionCalculation.deductionRate * 100)}%, que asciende a{" "}
                        <strong>{formatCurrency(sectionCalculation.deductionMxn)}</strong>, se restara de tus comisiones.
                      </p>
                      <div className="commissions-deduction-summary">
                        <span>Total Comisiones Bruto: <strong>{formatCurrency(sectionCalculation.grossTotalMxn)}</strong></span>
                        <span>(-) Deduccion Gastos: <strong>{formatCurrency(sectionCalculation.deductionMxn)}</strong></span>
                        <span>Total Neto a Pagar: <strong>{formatCurrency(sectionCalculation.netTotalMxn)}</strong></span>
                      </div>
                    </section>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : (
          <section className="panel">
            <div className="centered-inline-message">
              No tienes asignado un rol de comisiones o no cuentas con permisos para esta pestana.
            </div>
          </section>
        )
      ) : null}

      {activeTab === "receivers" ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Receptores de comisiones</h2>
            <span>{receivers.length} registros</span>
          </div>

          <div className="commissions-receiver-form">
            <label className="form-field commissions-receiver-input">
              <span>Nuevo receptor</span>
              <input
                type="text"
                value={newReceiverName}
                onChange={(event) => setNewReceiverName(event.target.value)}
                placeholder="Ej. Juan Perez o un puesto"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreateReceiver();
                  }
                }}
              />
            </label>
            <button className="primary-button" type="button" onClick={() => void handleCreateReceiver()} disabled={savingReceiver || !newReceiverName.trim()}>
              {savingReceiver ? "Guardando..." : "Agregar receptor"}
            </button>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre / Puesto</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {receivers.length === 0 ? (
                  <tr>
                    <td colSpan={2}>No hay receptores registrados.</td>
                  </tr>
                ) : (
                  receivers.map((receiver) => (
                    <tr key={receiver.id}>
                      <td>
                        {editingReceiverId === receiver.id ? (
                          <input
                            value={editingReceiverName}
                            onChange={(event) => setEditingReceiverName(event.target.value)}
                            className="commissions-inline-input"
                            autoFocus
                          />
                        ) : (
                          receiver.name
                        )}
                      </td>
                      <td>
                        <div className="table-actions">
                          {editingReceiverId === receiver.id ? (
                            <>
                              <button className="primary-button" type="button" onClick={() => void handleUpdateReceiver()} disabled={savingReceiver}>
                                Guardar
                              </button>
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => {
                                  setEditingReceiverId(null);
                                  setEditingReceiverName("");
                                }}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => {
                                  setEditingReceiverId(receiver.id);
                                  setEditingReceiverName(receiver.name);
                                }}
                              >
                                Editar
                              </button>
                              <button className="danger-button" type="button" onClick={() => void handleDeleteReceiver(receiver.id)} disabled={savingReceiver}>
                                Borrar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "snapshots" ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Estampas de comisiones</h2>
            <span>{loadingSnapshots ? "Cargando..." : `${snapshotCards.length} registros`}</span>
          </div>

          {loadingSnapshots ? <div className="centered-inline-message">Cargando estampas...</div> : null}

          {!loadingSnapshots ? (
            <div className="commissions-snapshot-grid">
              {snapshotCards.length === 0 ? (
                <article className="commissions-snapshot-card is-empty">
                  <p className="muted">No hay estampas guardadas aun.</p>
                </article>
              ) : (
                snapshotCards.map((snapshot) => {
                  const data = snapshot.snapshotData as CommissionSnapshotData | undefined;
                  const executionTotal = data?.executionRecords.reduce((sum, row) => sum + row.amountMxn, 0) ?? 0;
                  const clientTotal = data?.clientRecords.reduce((sum, row) => sum + row.amountMxn, 0) ?? 0;
                  const closingTotal = data?.closingRecords.reduce((sum, row) => sum + row.amountMxn, 0) ?? 0;

                  return (
                    <article key={snapshot.id} className="commissions-snapshot-card">
                      <div className="commissions-snapshot-head">
                        <strong>{snapshot.title}</strong>
                        <span>ID: {snapshot.id}</span>
                      </div>

                      <div className="commissions-snapshot-total">{formatCurrency(snapshot.totalNetMxn)}</div>
                      <div className="commissions-snapshot-meta">
                        <span>Seccion: {snapshot.section}</span>
                        <span>
                          Periodo: {MONTH_NAMES[snapshot.month - 1]} {snapshot.year}
                        </span>
                        <span>Guardado: {formatDate(snapshot.createdAt)}</span>
                      </div>

                      {data ? (
                        <>
                          <div className="commissions-snapshot-financials">
                            <span>Bruto: <strong>{formatCurrency(data.grossTotalMxn)}</strong></span>
                            <span>Deduccion: <strong>-{formatCurrency(data.deductionMxn)}</strong></span>
                          </div>
                          <div className="commissions-snapshot-breakdown">
                            <span><strong>{formatCurrency(executionTotal)}</strong> Ejecucion ({data.executionRecords.length})</span>
                            <span><strong>{formatCurrency(clientTotal)}</strong> Cliente ({data.clientRecords.length})</span>
                            <span><strong>{formatCurrency(closingTotal)}</strong> Cierre ({data.closingRecords.length})</span>
                          </div>
                        </>
                      ) : (
                        <div className="commissions-snapshot-breakdown">
                          <span>Reg. Finanzas: 0</span>
                          <span>Gastos Gral.: 0</span>
                          <span>Reg. Manuales: 0</span>
                        </div>
                      )}

                      {data ? (
                        <button className="secondary-button" type="button" onClick={() => setViewingSnapshot(snapshot)}>
                          Ver detalle
                        </button>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {viewingSnapshot ? <SnapshotDetailModal snapshot={viewingSnapshot} onClose={() => setViewingSnapshot(null)} /> : null}
    </section>
  );
}
