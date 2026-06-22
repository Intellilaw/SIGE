import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, UIEvent } from "react";
import type {
  Client,
  CommissionReceiver,
  FinanceRecord,
  FinanceRecordStats,
  FinanceSnapshot,
  InternalContract,
  InternalContractDownloadFormat,
  Matter,
  ProfessionalServicesContractFieldValues,
  ProfessionalServicesContractPrefillResult
} from "@sige/contracts";
import { COMMISSION_SECTIONS, TEAM_OPTIONS } from "@sige/contracts";

import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canReadModule, canWriteModule } from "../auth/permissions";

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
  paymentMethod?: FinanceRecord["paymentMethod"];
  paymentMethod2?: FinanceRecord["paymentMethod2"];
  paymentMethod3?: FinanceRecord["paymentMethod3"];
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
  highCollectionProbability?: boolean;
  lowCollectionProbability?: boolean;
  milestone?: string | null;
  concluded?: boolean;
  financeComments?: string | null;
};

type CopyResult = {
  year: number;
  month: number;
  copied: number;
};

type FinancePaymentMethodField = "paymentMethod" | "paymentMethod2" | "paymentMethod3";

const MONTHLY_COLUMN_WIDTHS = [
  "56px",
  "64px",
  "120px",
  "240px",
  "140px",
  "110px",
  "360px",
  "220px",
  "150px",
  "300px",
  "170px",
  "170px",
  "280px",
  "180px",
  "180px",
  "170px",
  "160px",
  "150px",
  "150px",
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
  "190px",
  "180px",
  "220px",
  "110px",
  "320px",
  "110px"
] as const;

const PAYMENT_METHOD_OPTIONS: Array<{ value: FinanceRecord["paymentMethod"]; label: string }> = [
  { value: "blank", label: "" },
  { value: "T", label: "T" },
  { value: "E_RECEIVED", label: "E recibido" },
  { value: "E_PENDING", label: "E pendiente" }
];

const ACTIVE_COLUMN_WIDTHS = [
  "120px",
  "260px",
  "150px",
  "110px",
  "360px",
  "170px",
  "150px",
  "220px",
  "180px",
  "220px",
  "220px",
  "260px",
  "140px"
] as const;

const EMPTY_PROFESSIONAL_SERVICES_FIELDS: ProfessionalServicesContractFieldValues = {
  language: "ES",
  clientKind: "PERSONA_MORAL",
  clientRfc: "",
  legalRepresentative: "",
  clientAddress: "",
  clientPhone: "",
  clientEmail: "",
  startDate: "",
  endDate: "",
  signingDate: ""
};

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function hasPermission(permissions: string[] | undefined, permission: string) {
  return Boolean(permissions?.includes("*") || permissions?.includes(permission));
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

const COMMISSION_RECEIVER_ALIAS_PAIRS = [
  ["Derecho financiero (lider)", "Der Financiero (lider)"],
  ["Derecho financiero (colaborador)", "Der Financiero (colaborador)"],
  ["Cumplimiento fiscal (lider)", "Compliance Fiscal (lider)"],
  ["Cumplimiento fiscal (colaborador)", "Compliance Fiscal (colaborador)"],
  ["Fiscal de Cumplimiento (lider)", "Compliance Fiscal (lider)"],
  ["Fiscal de Cumplimiento (colaborador)", "Compliance Fiscal (colaborador)"]
] as const;

const COMMISSION_RECEIVER_NAME_BY_KEY = new Map<string, string>();

for (const name of COMMISSION_SECTIONS) {
  COMMISSION_RECEIVER_NAME_BY_KEY.set(normalizeComparableText(name), name);
}

for (const [alias, canonicalName] of COMMISSION_RECEIVER_ALIAS_PAIRS) {
  COMMISSION_RECEIVER_NAME_BY_KEY.set(normalizeComparableText(alias), canonicalName);
}

function getCanonicalCommissionReceiverName(value?: string | null) {
  const name = normalizeText(value);
  if (!name) {
    return "";
  }

  return COMMISSION_RECEIVER_NAME_BY_KEY.get(normalizeComparableText(name)) ?? name;
}

function getRequiredCommissionReceiverId(name: string) {
  const slug = normalizeComparableText(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `required-${slug}`;
}

function buildRequiredCommissionReceiver(name: string): CommissionReceiver {
  return {
    id: getRequiredCommissionReceiverId(name),
    name,
    active: true,
    createdAt: "1970-01-01T00:00:00.000Z"
  };
}

function getCommissionReceiverOptions(receivers: CommissionReceiver[]) {
  const byKey = new Map<string, CommissionReceiver>();

  const addReceiver = (receiver: CommissionReceiver) => {
    if (!receiver.active) {
      return;
    }

    const name = getCanonicalCommissionReceiverName(receiver.name);
    if (!name) {
      return;
    }

    const key = normalizeComparableText(name);
    if (!byKey.has(key)) {
      byKey.set(key, { ...receiver, name });
    }
  };

  receivers.forEach(addReceiver);
  COMMISSION_SECTIONS.forEach((name) => addReceiver(buildRequiredCommissionReceiver(name)));

  return [...byKey.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "es", { sensitivity: "base" })
  );
}

function getSearchWords(value: string) {
  return normalizeComparableText(value).split(/\s+/).filter(Boolean);
}

function matchesSearchWords(words: string[], values: Array<string | number | boolean | null | undefined>) {
  if (words.length === 0) {
    return true;
  }

  const haystack = normalizeComparableText(values.map((value) => String(value ?? "")).join(" "));
  return words.every((word) => haystack.includes(word));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function parseCurrencyValue(value: string) {
  const parsed = Number(value.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyDraftValue(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

function CurrencyInput({
  value,
  readOnly = false,
  className = "",
  onValueChange,
  onValueCommit
}: {
  value: number;
  readOnly?: boolean;
  className?: string;
  onValueChange?: (value: number) => void;
  onValueCommit?: (value: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(formatCurrency(value));

  useEffect(() => {
    if (!focused) {
      setDraft(formatCurrency(value));
    }
  }, [focused, value]);

  const classNames = [
    "finance-input",
    "finance-input-number",
    "finance-input-currency",
    readOnly ? "finance-input-readonly" : "",
    className
  ].filter(Boolean).join(" ");

  return (
    <input
      className={classNames}
      inputMode="decimal"
      readOnly={readOnly}
      type="text"
      value={focused && !readOnly ? draft : formatCurrency(value)}
      onFocus={() => {
        if (!readOnly) {
          setFocused(true);
          setDraft(formatCurrencyDraftValue(value));
        }
      }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        const nextValue = parseCurrencyValue(nextDraft);
        setDraft(nextDraft);
        onValueChange?.(nextValue);
      }}
      onBlur={() => {
        if (readOnly) {
          return;
        }

        const nextValue = parseCurrencyValue(draft);
        setFocused(false);
        setDraft(formatCurrency(nextValue));
        onValueCommit?.(nextValue);
      }}
    />
  );
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatDateList(values: Array<string | null | undefined>) {
  const dates = values.map(toDateInput).filter(Boolean);
  return dates.length > 0 ? dates.join(" / ") : "-";
}

function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function fetchOptionalRows<T>(request: Promise<T[]>) {
  try {
    return await request;
  } catch {
    return [];
  }
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

function getTeamLabel(team?: FinanceRecord["responsibleTeam"] | Matter["responsibleTeam"] | null) {
  return TEAM_OPTIONS.find((option) => option.key === team)?.label ?? "";
}

function isSalesTeamUser(user?: {
  team?: string;
  secondaryTeam?: string;
  legacyTeam?: string;
  secondaryLegacyTeam?: string;
  specificRole?: string;
  secondarySpecificRole?: string;
} | null) {
  if (!user) {
    return false;
  }

  const normalizedAssignments = [
    user.legacyTeam,
    user.secondaryLegacyTeam,
    user.specificRole,
    user.secondarySpecificRole
  ].map(normalizeComparableText);

  return user.team === "SALES" ||
    user.secondaryTeam === "SALES" ||
    normalizedAssignments.includes("ventas");
}

function isEmrtUser(user?: { shortName?: string; username?: string } | null) {
  return [user?.shortName, user?.username].some((value) => normalizeComparableText(value) === "emrt");
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

function isFinancePaymentMethodReceived(value?: FinanceRecord["paymentMethod"] | null) {
  return value === "T" || value === "E_RECEIVED";
}

function hasPaymentDate(value?: string | null) {
  return Boolean(toDateInput(value));
}

function getReceivedPaymentsMxn(
  record: Pick<
    FinanceRecord,
    | "paidThisMonthMxn"
    | "payment2Mxn"
    | "payment3Mxn"
    | "paymentDate1"
    | "paymentDate2"
    | "paymentDate3"
    | "paymentMethod"
    | "paymentMethod2"
    | "paymentMethod3"
  >
) {
  const payment1Mxn =
    hasPaymentDate(record.paymentDate1) && isFinancePaymentMethodReceived(record.paymentMethod)
      ? record.paidThisMonthMxn
      : 0;
  const payment2Mxn =
    hasPaymentDate(record.paymentDate2) && isFinancePaymentMethodReceived(record.paymentMethod2)
      ? record.payment2Mxn
      : 0;
  const payment3Mxn =
    hasPaymentDate(record.paymentDate3) && isFinancePaymentMethodReceived(record.paymentMethod3)
      ? record.payment3Mxn
      : 0;

  return payment1Mxn + payment2Mxn + payment3Mxn;
}

function calculateFinanceStats(record: FinanceRecord): FinanceRecordStats {
  const totalPaidMxn = getReceivedPaymentsMxn(record);
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
  const salesCommissionMxn = record.salesCommissionMxn;
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
      financeCommissionMxn +
      salesCommissionMxn
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
    salesCommissionMxn,
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
        const expectedThisMonthMxn = Number(record.conceptFeesMxn || 0);
        return {
          income: acc.income + stats.totalPaidMxn,
          netRemainingExpectedThisMonth: acc.netRemainingExpectedThisMonth + expectedThisMonthMxn,
          highCollectionProbability: acc.highCollectionProbability + (record.highCollectionProbability ? expectedThisMonthMxn : 0),
          lowCollectionProbability: acc.lowCollectionProbability + (record.lowCollectionProbability ? expectedThisMonthMxn : 0)
        };
      },
      {
        income: 0,
        netRemainingExpectedThisMonth: 0,
        highCollectionProbability: 0,
        lowCollectionProbability: 0
      }
    );
  }, [records]);

  const cards = [
    { label: "Ingresos cobrados", value: totals.income, accent: "finance-card-green" },
    { label: "Cuentas por cobrar totales de este mes", value: totals.netRemainingExpectedThisMonth, accent: "finance-card-red" },
    { label: "Honorarios con altas probabilidades de cobro", value: totals.highCollectionProbability, accent: "finance-card-blue" },
    { label: "Honorarios con bajas probabilidades de cobro", value: totals.lowCollectionProbability, accent: "finance-card-orange" }
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
  const canReadFinances = canReadModule(user, "finances");
  const canWriteFinances = canWriteModule(user, "finances");
  const canReadInternalContracts = hasPermission(user?.permissions, "internal-contracts:read") || hasPermission(user?.permissions, "internal-contracts:write");
  const isSuperadmin = user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN";
  const isSalesMonthlyViewer = isSalesTeamUser(user) && !canWriteFinances && !isSuperadmin;
  const canDeleteFinanceRecords = isSuperadmin || canWriteFinances;
  const canSelectReceivedCash = isEmrtUser(user);
  const pageRef = useRef<HTMLElement | null>(null);
  const tabsPanelRef = useRef<HTMLElement | null>(null);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [activeTab, setActiveTab] = useState<FinanceTab>("monthly-view");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [snapshots, setSnapshots] = useState<FinanceSnapshot[]>([]);
  const [viewingSnapshot, setViewingSnapshot] = useState<FinanceSnapshot | null>(null);
  const [activeMatters, setActiveMatters] = useState<FinanceMatterRow[]>([]);
  const [professionalContracts, setProfessionalContracts] = useState<InternalContract[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [receivers, setReceivers] = useState<CommissionReceiver[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentMonthMatchKeys, setCurrentMonthMatchKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [contractPrefillLoading, setContractPrefillLoading] = useState(false);
  const [contractGenerating, setContractGenerating] = useState(false);
  const [contractActionKey, setContractActionKey] = useState<string | null>(null);
  const [contractFlash, setContractFlash] = useState<string | null>(null);
  const [contractPrefill, setContractPrefill] = useState<ProfessionalServicesContractPrefillResult | null>(null);
  const [contractForm, setContractForm] = useState<ProfessionalServicesContractFieldValues>(EMPTY_PROFESSIONAL_SERVICES_FIELDS);
  const [wordSearch, setWordSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");

  useEffect(() => {
    const page = pageRef.current;
    const tabsPanel = tabsPanelRef.current;

    if (!page || !tabsPanel) {
      return;
    }

    const syncStickyTableOffset = () => {
      const tabsHeight = Math.ceil(tabsPanel.getBoundingClientRect().height);
      page.style.setProperty("--finance-sticky-tabs-height", `${tabsHeight}px`);
      page.style.setProperty("--finance-sticky-table-top", `${tabsHeight}px`);
    };

    syncStickyTableOffset();

    const resizeObserver = new ResizeObserver(syncStickyTableOffset);
    resizeObserver.observe(tabsPanel);
    window.addEventListener("resize", syncStickyTableOffset);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncStickyTableOffset);
    };
  }, []);

  function handleFinanceTableScroll(event: UIEvent<HTMLDivElement>) {
    const source = event.currentTarget;
    const shell = source.closest(".finance-table-shell-sticky") as HTMLElement | null;

    if (!shell) {
      return;
    }

    shell.querySelectorAll<HTMLElement>(".finance-table-scroll, .finance-table-x-nav").forEach((element) => {
      if (element !== source && element.scrollLeft !== source.scrollLeft) {
        element.scrollLeft = source.scrollLeft;
      }
    });
  }

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

  const clientSearchWords = useMemo(() => getSearchWords(clientSearch), [clientSearch]);
  const wordSearchWords = useMemo(() => getSearchWords(wordSearch), [wordSearch]);
  const commissionReceiverOptions = useMemo(() => getCommissionReceiverOptions(receivers), [receivers]);

  const filteredActiveMatters = useMemo(
    () =>
      sortedActiveMatters.filter((matter) => {
        const effectiveClientNumber = resolveClientNumber(matter.clientName, matter.clientNumber);
        return (
          matchesSearchWords(clientSearchWords, [matter.clientName, effectiveClientNumber]) &&
          matchesSearchWords(wordSearchWords, [
            effectiveClientNumber,
            matter.clientName,
            matter.quoteNumber,
            getMatterTypeLabel(matter.matterType),
            matter.subject,
            formatCurrency(matter.totalFeesMxn),
            matter.commissionAssignee,
            getTeamLabel(matter.responsibleTeam),
            toDateInput(matter.nextPaymentDate),
            getMonthName(matter.transferMonth),
            matter.transferYear
          ])
        );
      }),
    [clientNumberByName, clientSearchWords, sortedActiveMatters, wordSearchWords]
  );

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const stats = calculateFinanceStats(record);
        const effectiveClientNumber = resolveClientNumber(record.clientName, record.clientNumber);
        return (
          matchesSearchWords(clientSearchWords, [record.clientName, effectiveClientNumber]) &&
          matchesSearchWords(wordSearchWords, [
            effectiveClientNumber,
            record.clientName,
            record.quoteNumber,
            getMatterTypeLabel(record.matterType),
            record.subject,
            getTeamLabel(record.responsibleTeam),
            record.workingConcepts,
            record.nextPaymentNotes,
            record.clientCommissionRecipient,
            record.closingCommissionRecipient,
            record.milestone,
            record.financeComments,
            toDateInput(record.nextPaymentDate),
            formatDateList([record.paymentDate1, record.paymentDate2, record.paymentDate3]),
            record.totalMatterMxn,
            record.conceptFeesMxn,
            record.previousPaymentsMxn,
            stats.remainingMxn,
            stats.totalPaidMxn,
            stats.dueTodayMxn,
            stats.netFeesMxn,
            stats.salesCommissionMxn,
            stats.netProfitMxn,
            record.pctLitigation,
            record.pctCorporateLabor,
            record.pctSettlements,
            record.pctFinancialLaw,
            record.pctTaxCompliance,
            record.concluded
          ])
        );
      }),
    [clientNumberByName, clientSearchWords, records, wordSearchWords]
  );

  const uniqueMatters = useMemo(
    () => filteredActiveMatters.filter((matter) => matter.matterType !== "RETAINER"),
    [filteredActiveMatters]
  );
  const retainerMatters = useMemo(
    () => filteredActiveMatters.filter((matter) => matter.matterType === "RETAINER"),
    [filteredActiveMatters]
  );
  const professionalContractsByMatterId = useMemo(() => {
    const next = new Map<string, InternalContract>();

    professionalContracts
      .filter((contract) => contract.contractType === "PROFESSIONAL_SERVICES" && contract.sourceMatterId)
      .forEach((contract) => {
        next.set(contract.sourceMatterId!, contract);
      });

    return next;
  }, [professionalContracts]);

  function upsertProfessionalContract(contract: InternalContract) {
    setProfessionalContracts((current) => {
      const others = current.filter((entry) => entry.id !== contract.id);
      return [contract, ...others];
    });
  }

  function closeContractForm() {
    setContractFormOpen(false);
    setContractPrefillLoading(false);
    setContractGenerating(false);
    setContractActionKey(null);
    setContractPrefill(null);
    setContractForm(EMPTY_PROFESSIONAL_SERVICES_FIELDS);
    setContractFlash(null);
  }

  function getContractStatus(contract?: InternalContract) {
    if (!contract) {
      return {
        label: "Pendiente",
        className: "finance-contract-status finance-contract-status-missing"
      };
    }

    if (contract.signatureStatus === "SIGNED") {
      return {
        label: "Firmado",
        className: "finance-contract-status finance-contract-status-signed"
      };
    }

    return {
      label: "No firmado",
      className: "finance-contract-status finance-contract-status-pending"
    };
  }

  async function handleContractDownload(contractId: string, format: InternalContractDownloadFormat) {
    const actionKey = `${contractId}:${format}`;
    setContractActionKey(actionKey);
    setError(null);

    try {
      const suffix = format === "pdf" ? "?format=pdf" : "?format=docx";
      const { blob, filename } = await apiDownload(`/internal-contracts/${encodeURIComponent(contractId)}/document${suffix}`);
      downloadBlobFile(blob, filename ?? `contrato.${format === "pdf" ? "pdf" : "docx"}`);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setContractActionKey(null);
    }
  }

  function updateContractFormField<K extends keyof ProfessionalServicesContractFieldValues>(
    field: K,
    value: ProfessionalServicesContractFieldValues[K]
  ) {
    setContractForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "clientKind" && value === "PERSONA_FISICA" ? { legalRepresentative: "" } : {})
    }));
    setContractFlash(null);
  }

  async function handleOpenContractForm(matter: FinanceMatterRow) {
    setContractFormOpen(true);
    setContractPrefillLoading(true);
    setContractGenerating(false);
    setContractActionKey(null);
    setContractFlash(null);
    setContractPrefill(null);
    setError(null);

    try {
      const result = await apiGet<ProfessionalServicesContractPrefillResult>(
        `/internal-contracts/professional-services/prefill/${encodeURIComponent(matter.id)}`
      );
      setContractPrefill(result);
      setContractForm(result.fields);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
      setContractFormOpen(false);
    } finally {
      setContractPrefillLoading(false);
    }
  }

  async function handleGenerateContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contractPrefill) {
      return;
    }

    setContractGenerating(true);
    setContractFlash(null);
    setError(null);

    try {
      const created = await apiPost<InternalContract>("/internal-contracts/professional-services/generate", {
        matterId: contractPrefill.matterId,
        fields: contractForm
      });
      upsertProfessionalContract(created);
      setContractPrefill((current) => current
        ? {
            ...current,
            contractId: created.id,
            signatureStatus: created.signatureStatus ?? "PENDING",
            availableFormats: created.availableFormats
          }
        : current);
      setContractFlash("Contrato generado y guardado en Administracion de contratos internos.");
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setContractGenerating(false);
    }
  }

  async function loadCurrentMonthPresence() {
    if (!canReadFinances) {
      setCurrentMonthMatchKeys(new Set());
      return;
    }

    const currentRecords = await apiGet<FinanceRecord[]>(`/finances/records?year=${currentYear}&month=${currentMonth}`);
    const nextKeys = new Set<string>();
    currentRecords.forEach((record) => {
      buildMatchKeys(record).forEach((key) => nextKeys.add(key));
    });
    setCurrentMonthMatchKeys(nextKeys);
  }

  async function loadMonthlyView() {
    if (!canReadFinances) {
      setRecords([]);
      setClients([]);
      setReceivers([]);
      setSelectedIds(new Set());
      setLoading(false);
      setError("No tienes permisos para consultar Finanzas.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextRecords, nextClients, nextReceivers] = await Promise.all([
        apiGet<FinanceRecord[]>(`/finances/records?year=${selectedYear}&month=${selectedMonth}`),
        canWriteFinances ? apiGet<Client[]>("/clients") : Promise.resolve([]),
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
    if (!canReadFinances) {
      setSnapshots([]);
      setLoading(false);
      setError("No tienes permisos para consultar Finanzas.");
      return;
    }

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
    if (!canReadFinances) {
      setClients([]);
      setActiveMatters([]);
      setProfessionalContracts([]);
      setLoading(false);
      setError("No tienes permisos para consultar Finanzas.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [matters, nextClients, nextContracts] = await Promise.all([
        apiGet<Matter[]>("/matters"),
        canWriteFinances ? apiGet<Client[]>("/clients") : Promise.resolve([]),
        canReadInternalContracts ? fetchOptionalRows(apiGet<InternalContract[]>("/internal-contracts")) : Promise.resolve([])
      ]);
      setClients(nextClients);
      setProfessionalContracts(nextContracts.filter((contract) => contract.contractType === "PROFESSIONAL_SERVICES"));
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
    if (isSalesMonthlyViewer && activeTab !== "monthly-view") {
      setActiveTab("monthly-view");
    }
  }, [activeTab, isSalesMonthlyViewer]);

  useEffect(() => {
    if (isSalesMonthlyViewer && activeTab !== "monthly-view") {
      return;
    }

    if (activeTab === "monthly-view") {
      void loadMonthlyView();
      return;
    }

    if (activeTab === "snapshots") {
      void loadSnapshotsView();
      return;
    }

    void loadActiveMattersView();
  }, [activeTab, canReadFinances, canReadInternalContracts, isSalesMonthlyViewer, selectedMonth, selectedYear]);

  useEffect(() => {
    if (activeTab !== "active-matters" && contractFormOpen) {
      closeContractForm();
    }
  }, [activeTab, contractFormOpen]);

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
    const isDateUrgent = Boolean(record.nextPaymentDate && toDateInput(record.nextPaymentDate) <= todayValue && stats.dueTodayMxn > 1);
    const isPctInvalid = stats.pctSum !== 100;
    const reasons: string[] = [];

    if (missing.length > 0) {
      reasons.push(`Faltan datos requeridos: ${missing.join(", ")}.`);
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
    if (!canWriteFinances) {
      return;
    }

    try {
      const updated = await apiPatch<FinanceRecord>(`/finances/records/${recordId}`, patch);
      setRecords((current) => current.map((record) => {
        if (record.id !== recordId) {
          return record;
        }

        const nextRecord = { ...record, ...updated };
        (["paymentMethod", "paymentMethod2", "paymentMethod3"] as const).forEach((field) => {
          if (Object.prototype.hasOwnProperty.call(patch, field) && !Object.prototype.hasOwnProperty.call(updated, field)) {
            nextRecord[field] = patch[field] ?? record[field];
          }
        });

        return nextRecord;
      }));
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  function setCollectionProbability(record: FinanceRecord, probability: "high" | "low", checked: boolean) {
    const patch: FinanceRecordPatchPayload = probability === "high"
      ? {
          highCollectionProbability: checked,
          lowCollectionProbability: checked ? false : record.lowCollectionProbability
        }
      : {
          highCollectionProbability: checked ? false : record.highCollectionProbability,
          lowCollectionProbability: checked
        };

    updateRecordLocal(record.id, patch);
    void persistRecordPatch(record.id, patch);
  }

  async function handleMatterNextPaymentDateChange(matterId: string, value: string) {
    if (!canWriteFinances) {
      return;
    }

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
    if (!canWriteFinances) {
      return;
    }

    setActiveMatters((current) =>
      current.map((matter) => (matter.id === matterId ? { ...matter, [field]: value } : matter))
    );
  }

  async function handleSendMatterToFinance(matter: FinanceMatterRow) {
    if (!canWriteFinances) {
      return;
    }

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
      const visibleIds = filteredRecords.map((record) => record.id);
      if (visibleIds.length === 0) {
        return current;
      }

      const hasEveryVisibleRecord = visibleIds.every((id) => current.has(id));
      const next = new Set(current);
      visibleIds.forEach((id) => {
        if (hasEveryVisibleRecord) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });
      return next;
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
    if (!canWriteFinances) {
      return;
    }

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
    if (!canWriteFinances) {
      return;
    }

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
    const allVisibleSelected =
      filteredRecords.length > 0 && filteredRecords.every((record) => selectedIds.has(record.id));
    const totals = filteredRecords.reduce(
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
          salesCommissionMxn: acc.salesCommissionMxn + stats.salesCommissionMxn,
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
        salesCommissionMxn: 0,
        netProfitMxn: 0
      }
    );

    const renderMonthlyColGroup = () => (
      <colgroup>
        {MONTHLY_COLUMN_WIDTHS.map((width, index) => (
          <col key={`finance-monthly-col-${index}`} style={{ width }} />
        ))}
      </colgroup>
    );

    const renderMonthlyHeader = () => (
      <thead>
        <tr>
          <th><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllRecords} /></th>
          <th className="finance-row-index">No.</th>
          <th>No. Cliente</th>
          <th>Cliente</th>
          <th>No. Cotizacion</th>
          <th>Tipo</th>
          <th>Asunto</th>
          <th>Equipo Responsable</th>
          <th>Total Asunto</th>
          <th>Conceptos trabajando</th>
          <th>Honorarios pagaderos este mes</th>
          <th>Fecha de proximo pago</th>
          <th>Detalle Fecha</th>
          <th>Pagado este mes</th>
          <th>Fecha Pago Real</th>
          <th>Método de pago</th>
          <th>Adeudado hoy</th>
          <th>Alta probabilidad de cobro</th>
          <th>Baja probabilidad de cobro</th>
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
          <th>Com. Ventas (1% primer pago)</th>
          <th>Utilidad neta</th>
          <th>Hito conclusion</th>
          <th>Concluyo?</th>
          <th>Comentarios</th>
          <th>Accion</th>
        </tr>
      </thead>
    );

    const renderPaymentMethodSelect = (
      record: FinanceRecord,
      field: FinancePaymentMethodField,
      paymentDate?: string | null
    ) => {
      if (!hasPaymentDate(paymentDate)) {
        return <div aria-hidden="true" className="finance-payment-method-placeholder" />;
      }

      return (
        <select
          className="finance-input"
          value={record[field] ?? "blank"}
          onChange={(event) => {
            const paymentMethod = event.target.value as FinanceRecord[FinancePaymentMethodField];
            const patch = { [field]: paymentMethod } as FinanceRecordPatchPayload;
            updateRecordLocal(record.id, patch);
            void persistRecordPatch(record.id, patch);
          }}
        >
          {PAYMENT_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} disabled={option.value === "E_RECEIVED" && !canSelectReceivedCash}>
              {option.label}
            </option>
          ))}
        </select>
      );
    };

    return (
      <fieldset className="finance-readonly-fieldset" disabled={!canWriteFinances}>
        <div className="finance-table-shell finance-table-shell-sticky">
          <div className="finance-table-x-nav" onScroll={handleFinanceTableScroll} aria-label="Desplazamiento horizontal de la tabla mensual">
            <div className="finance-table-x-nav-spacer finance-table-monthly-x-nav-spacer" />
          </div>
          <div className="finance-table-scroll" onScroll={handleFinanceTableScroll}>
            <table className="finance-table finance-table-monthly">
              {renderMonthlyColGroup()}
              {renderMonthlyHeader()}
              <tbody>
            {filteredRecords.map((record, index) => {
              const { stats, effectiveClientNumber, shouldHighlight, reason } = evaluateMonthlyRecord(record);
              const isSelected = selectedIds.has(record.id);
              const rowClassName = `${shouldHighlight ? "finance-row-danger" : ""} ${isSelected ? "finance-row-selected" : ""}`.trim();

              return (
                <tr className={rowClassName} key={record.id} title={reason}>
                  <td className="finance-cell-checkbox"><input type="checkbox" checked={isSelected} onChange={() => toggleRecordSelection(record.id)} /></td>
                  <td className="finance-row-index">{index + 1}</td>
                  <td><input className="finance-input finance-input-readonly" value={effectiveClientNumber} readOnly /></td>
                  <td><input className="finance-input finance-input-readonly" value={record.clientName} readOnly /></td>
                  <td><input className="finance-input finance-input-readonly" value={record.quoteNumber ?? ""} readOnly /></td>
                  <td><span className={`finance-type-pill ${record.matterType === "RETAINER" ? "is-retainer" : ""}`}>{getMatterTypeLabel(record.matterType)}</span></td>
                  <td><input className="finance-input finance-input-readonly" value={record.subject} readOnly /></td>
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
                  <td><CurrencyInput value={record.totalMatterMxn} readOnly /></td>
                  <td><input className="finance-input" value={record.workingConcepts ?? ""} onChange={(event) => updateRecordLocal(record.id, { workingConcepts: event.target.value })} onBlur={(event) => void persistRecordPatch(record.id, { workingConcepts: event.target.value })} /></td>
                  <td><CurrencyInput value={record.conceptFeesMxn} onValueChange={(conceptFeesMxn) => updateRecordLocal(record.id, { conceptFeesMxn })} onValueCommit={(conceptFeesMxn) => void persistRecordPatch(record.id, { conceptFeesMxn })} /></td>
                  <td><input className="finance-input finance-input-readonly" type="date" value={toDateInput(record.nextPaymentDate)} readOnly /></td>
                  <td><input className="finance-input" value={record.nextPaymentNotes ?? ""} onChange={(event) => updateRecordLocal(record.id, { nextPaymentNotes: event.target.value })} onBlur={(event) => void persistRecordPatch(record.id, { nextPaymentNotes: event.target.value })} /></td>
                  <td>
                    <div className="finance-stack">
                      <CurrencyInput value={record.paidThisMonthMxn} onValueChange={(paidThisMonthMxn) => updateRecordLocal(record.id, { paidThisMonthMxn })} onValueCommit={(paidThisMonthMxn) => void persistRecordPatch(record.id, { paidThisMonthMxn })} />
                      <CurrencyInput value={record.payment2Mxn} onValueChange={(payment2Mxn) => updateRecordLocal(record.id, { payment2Mxn })} onValueCommit={(payment2Mxn) => void persistRecordPatch(record.id, { payment2Mxn })} />
                      <CurrencyInput value={record.payment3Mxn} onValueChange={(payment3Mxn) => updateRecordLocal(record.id, { payment3Mxn })} onValueCommit={(payment3Mxn) => void persistRecordPatch(record.id, { payment3Mxn })} />
                    </div>
                  </td>
                  <td>
                    <div className="finance-stack">
                      <input className="finance-input" type="date" value={toDateInput(record.paymentDate1)} onChange={(event) => updateRecordLocal(record.id, { paymentDate1: event.target.value || null })} onBlur={(event) => void persistRecordPatch(record.id, { paymentDate1: event.target.value || null })} />
                      <input className="finance-input" type="date" value={toDateInput(record.paymentDate2)} onChange={(event) => updateRecordLocal(record.id, { paymentDate2: event.target.value || null })} onBlur={(event) => void persistRecordPatch(record.id, { paymentDate2: event.target.value || null })} />
                      <input className="finance-input" type="date" value={toDateInput(record.paymentDate3)} onChange={(event) => updateRecordLocal(record.id, { paymentDate3: event.target.value || null })} onBlur={(event) => void persistRecordPatch(record.id, { paymentDate3: event.target.value || null })} />
                    </div>
                  </td>
                  <td>
                    <div className="finance-stack">
                      {renderPaymentMethodSelect(record, "paymentMethod", record.paymentDate1)}
                      {renderPaymentMethodSelect(record, "paymentMethod2", record.paymentDate2)}
                      {renderPaymentMethodSelect(record, "paymentMethod3", record.paymentDate3)}
                    </div>
                  </td>
                  <td><CurrencyInput className={stats.dueTodayMxn > 0 ? "finance-cell-negative" : ""} value={stats.dueTodayMxn} readOnly /></td>
                  <td className="finance-cell-checkbox">
                    <input
                      checked={record.highCollectionProbability}
                      onChange={(event) => setCollectionProbability(record, "high", event.target.checked)}
                      type="checkbox"
                    />
                  </td>
                  <td className="finance-cell-checkbox">
                    <input
                      checked={record.lowCollectionProbability}
                      onChange={(event) => setCollectionProbability(record, "low", event.target.checked)}
                      type="checkbox"
                    />
                  </td>
                  <td><CurrencyInput className="finance-cell-positive" value={stats.netFeesMxn} readOnly /></td>
                  <td>{formatCurrency(stats.clientCommissionMxn)}</td>
                  <td>
                    <select className="finance-input" value={getCanonicalCommissionReceiverName(record.clientCommissionRecipient)} onChange={(event) => { const clientCommissionRecipient = event.target.value || null; updateRecordLocal(record.id, { clientCommissionRecipient }); void persistRecordPatch(record.id, { clientCommissionRecipient }); }}>
                      <option value="">Seleccionar...</option>
                      {commissionReceiverOptions.map((receiver) => <option key={receiver.id} value={receiver.name}>{receiver.name}</option>)}
                    </select>
                  </td>
                  <td>{formatCurrency(stats.closingCommissionMxn)}</td>
                  <td>
                    <select className="finance-input" value={getCanonicalCommissionReceiverName(record.closingCommissionRecipient)} onChange={(event) => { const closingCommissionRecipient = event.target.value || null; updateRecordLocal(record.id, { closingCommissionRecipient }); void persistRecordPatch(record.id, { closingCommissionRecipient }); }}>
                      <option value="">Seleccionar...</option>
                      {commissionReceiverOptions.map((receiver) => <option key={receiver.id} value={receiver.name}>{receiver.name}</option>)}
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
                  <td>{formatCurrency(stats.salesCommissionMxn)}</td>
                  <td className="finance-profit-cell">{formatCurrency(stats.netProfitMxn)}</td>
                  <td><input className="finance-input finance-input-readonly" value={record.milestone ?? ""} readOnly /></td>
                  <td className="finance-cell-checkbox"><input type="checkbox" checked={record.concluded} onChange={(event) => { updateRecordLocal(record.id, { concluded: event.target.checked }); void persistRecordPatch(record.id, { concluded: event.target.checked }); }} /></td>
                  <td><textarea className="finance-input finance-textarea" value={record.financeComments ?? ""} onChange={(event) => updateRecordLocal(record.id, { financeComments: event.target.value })} onBlur={(event) => void persistRecordPatch(record.id, { financeComments: event.target.value })} /></td>
                  <td><button className="danger-button finance-inline-button" type="button" onClick={() => void handleDeleteRecord(record.id)}>Borrar</button></td>
                </tr>
              );
            })}
            {!loading && filteredRecords.length === 0 ? (
              <tr><td className="centered-inline-message" colSpan={49}>Sin registros para esta fecha.</td></tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="finance-total-row">
              <td colSpan={8}>Totales</td>
              <td>{formatCurrency(totals.totalMatterMxn)}</td>
              <td />
              <td>{formatCurrency(totals.conceptFeesMxn)}</td>
              <td colSpan={2} />
              <td>{formatCurrency(totals.totalPaidMxn)}</td>
              <td />
              <td />
              <td>{formatCurrency(totals.dueTodayMxn)}</td>
              <td />
              <td />
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
              <td>{formatCurrency(totals.salesCommissionMxn)}</td>
              <td>{formatCurrency(totals.netProfitMxn)}</td>
              <td colSpan={4} />
            </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </fieldset>
    );
  }

  function renderActiveMattersTable(items: FinanceMatterRow[], variant: "unique" | "retainer") {
    const renderActiveColGroup = () => (
      <colgroup>
        {ACTIVE_COLUMN_WIDTHS.map((width, index) => (
          <col key={`finance-active-col-${index}`} style={{ width }} />
        ))}
      </colgroup>
    );

    const renderActiveHeader = () => (
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
          <th>Generar contrato</th>
          <th>Estatus del contrato de PSP</th>
          <th>Fecha de proximo pago</th>
          <th>Destino (Finanzas)</th>
          <th>Accion</th>
        </tr>
      </thead>
    );

    return (
      <fieldset className="finance-readonly-fieldset" disabled={!canWriteFinances}>
        <div className="finance-active-table-shell">
          <table className="finance-active-table">
            {renderActiveColGroup()}
            {renderActiveHeader()}
            <tbody>
            {items.map((matter) => {
              const highlight = shouldHighlightMatter(matter);
              const targetDate = new Date(matter.transferYear, matter.transferMonth - 1, 1);
              const currentDate = new Date(currentYear, currentMonth - 1, 1);
              const disabled = targetDate > currentDate;
              const relatedContract = professionalContractsByMatterId.get(matter.id);
              const contractStatus = getContractStatus(relatedContract);

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
                  <td>
                    <button className="secondary-button finance-contract-button" type="button" onClick={() => void handleOpenContractForm(matter)}>
                      Generar contrato
                    </button>
                  </td>
                  <td>
                    <span className={contractStatus.className}>{contractStatus.label}</span>
                  </td>
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
              <tr><td className="centered-inline-message" colSpan={13}>{variant === "retainer" ? "No hay igualas activas." : "No hay asuntos unicos activos."}</td></tr>
            ) : null}
            </tbody>
          </table>
        </div>
      </fieldset>
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
    <section className="page-stack finances-page" ref={pageRef}>
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

      <section className="panel finance-tabs-panel" ref={tabsPanelRef}>
        <div className="finance-tabs">
          {!isSalesMonthlyViewer ? (
            <button className={`finance-tab ${activeTab === "active-matters" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("active-matters")}>1. Asuntos activos</button>
          ) : null}
          <button className={`finance-tab ${activeTab === "monthly-view" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("monthly-view")}>{isSalesMonthlyViewer ? "Ver mes" : "2. Ver mes"}</button>
          {!isSalesMonthlyViewer ? (
            <button className={`finance-tab ${activeTab === "snapshots" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("snapshots")}>3. Estampas guardadas</button>
          ) : null}
        </div>
      </section>

      {activeTab !== "snapshots" ? (
        <section className="panel finance-search-panel">
          <div className="panel-header">
            <h2>{activeTab === "monthly-view" ? "Registros de finanzas" : "Asuntos en finanzas"}</h2>
            <span>{activeTab === "monthly-view" ? filteredRecords.length : filteredActiveMatters.length} registros</span>
          </div>

          <div className="matters-toolbar execution-search-toolbar finance-search-toolbar">
            <div className="matters-filters leads-search-filters matters-active-search-filters execution-search-filters finance-search-filters">
              <label className="form-field matters-search-field">
                <span>Buscar por palabra</span>
                <input
                  type="text"
                  value={wordSearch}
                  onChange={(event) => setWordSearch(event.target.value)}
                  placeholder="Cotizacion, asunto, equipo, nota..."
                />
              </label>

              <label className="form-field matters-search-field">
                <span>Buscador por cliente</span>
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(event) => setClientSearch(event.target.value)}
                  placeholder="Buscar palabra del cliente..."
                />
              </label>
            </div>

            <div className="matters-toolbar-actions">
              <span className="muted">Filtra por cliente o palabra dentro de la vista actual.</span>
            </div>
          </div>
        </section>
      ) : null}

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
              {canDeleteFinanceRecords && selectedIds.size > 0 ? (
                <button className="danger-button" type="button" onClick={() => void handleBulkDelete()}>
                  Borrar ({selectedIds.size})
                </button>
              ) : null}
              {canWriteFinances ? (
                <>
                  <button className="secondary-button" type="button" onClick={() => void handleCreateSnapshot()}>
                    Guardar estampa
                  </button>
                  <button className="primary-button" type="button" onClick={() => setCopyModalOpen(true)}>
                    Copiar todo al mes siguiente
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <MonthSummaryCards records={filteredRecords} />
          {renderMonthlyTable()}
        </section>
      ) : null}

      {activeTab === "snapshots" ? renderSnapshots() : null}

      {contractFormOpen ? (
        <div className="finance-modal-backdrop" role="presentation" onClick={() => (contractGenerating ? undefined : closeContractForm())}>
          <div className="finance-modal finance-modal-wide finance-contract-modal" role="dialog" aria-modal="true" aria-label="Generar contrato de prestacion de servicios" onClick={(event) => event.stopPropagation()}>
            <div className="finance-modal-head">
              <div>
                <h3>Contrato de prestacion de servicios profesionales</h3>
                <p className="muted">La portada se llena aqui y los servicios, honorarios y momentos de pago se toman de la cotizacion vinculada.</p>
              </div>
              <button className="secondary-button" type="button" disabled={contractGenerating} onClick={closeContractForm}>Cerrar</button>
            </div>

            {contractPrefillLoading ? (
              <div className="centered-inline-message">Preparando formulario del contrato...</div>
            ) : contractPrefill ? (
              <form className="finance-contract-form" onSubmit={handleGenerateContract}>
                <div className="quotes-detail-grid finance-contract-summary-grid">
                  <div className="quotes-detail-block">
                    <strong>No. de contrato</strong>
                    <p>{contractPrefill.contractNumber}</p>
                  </div>
                  <div className="quotes-detail-block">
                    <strong>Cliente</strong>
                    <p>{[contractPrefill.clientNumber, contractPrefill.clientName].filter(Boolean).join(" - ")}</p>
                  </div>
                  <div className="quotes-detail-block">
                    <strong>No. de cotizacion</strong>
                    <p>{contractPrefill.quoteNumber ?? "-"}</p>
                  </div>
                  <div className="quotes-detail-block">
                    <strong>Asunto</strong>
                    <p>{contractPrefill.subject}</p>
                  </div>
                  <div className="quotes-detail-block">
                    <strong>Total cotizacion</strong>
                    <p>{formatCurrency(contractPrefill.totalMxn)}</p>
                  </div>
                  <div className="quotes-detail-block">
                    <strong>Estatus</strong>
                    <p>{getContractStatus(professionalContractsByMatterId.get(contractPrefill.matterId)).label}</p>
                  </div>
                </div>

                {contractFlash ? <div className="message-banner message-success">{contractFlash}</div> : null}

                <div className="finance-contract-form-section">
                  <div className="panel-header finance-contract-section-head">
                    <h4>Idioma del contrato</h4>
                    <span>Selecciona la plantilla que se usara al generar el archivo.</span>
                  </div>

                  <div className="finance-contract-field-grid">
                    <label className="form-field">
                      <span>Idioma</span>
                      <select value={contractForm.language} onChange={(event) => updateContractFormField("language", event.target.value as ProfessionalServicesContractFieldValues["language"])}>
                        <option value="ES">Espanol</option>
                        <option value="EN">Ingles</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="finance-contract-form-section">
                  <div className="panel-header finance-contract-section-head">
                    <h4>Datos editables de la portada</h4>
                    <span>Estos datos se guardan para futuras regeneraciones.</span>
                  </div>

                  <div className="finance-contract-field-grid">
                    <label className="form-field">
                      <span>Tipo de cliente</span>
                      <select value={contractForm.clientKind} onChange={(event) => updateContractFormField("clientKind", event.target.value as ProfessionalServicesContractFieldValues["clientKind"])}>
                        <option value="PERSONA_MORAL">Persona moral</option>
                        <option value="PERSONA_FISICA">Persona fisica</option>
                      </select>
                    </label>

                    <label className="form-field">
                      <span>RFC del cliente</span>
                      <input required value={contractForm.clientRfc} onChange={(event) => updateContractFormField("clientRfc", event.target.value)} />
                    </label>

                    {contractForm.clientKind === "PERSONA_MORAL" ? (
                      <label className="form-field">
                        <span>Representante legal</span>
                        <input required value={contractForm.legalRepresentative} onChange={(event) => updateContractFormField("legalRepresentative", event.target.value)} />
                      </label>
                    ) : null}

                    <label className="form-field finance-contract-wide-field">
                      <span>Domicilio</span>
                      <textarea required value={contractForm.clientAddress} onChange={(event) => updateContractFormField("clientAddress", event.target.value)} />
                    </label>

                    <label className="form-field">
                      <span>Telefono</span>
                      <input required value={contractForm.clientPhone} onChange={(event) => updateContractFormField("clientPhone", event.target.value)} />
                    </label>

                    <label className="form-field">
                      <span>Correo electronico</span>
                      <input required type="email" value={contractForm.clientEmail} onChange={(event) => updateContractFormField("clientEmail", event.target.value)} />
                    </label>

                    <label className="form-field">
                      <span>Fecha de inicio</span>
                      <input required type="date" value={contractForm.startDate} onChange={(event) => updateContractFormField("startDate", event.target.value)} />
                    </label>

                    <label className="form-field">
                      <span>Fecha de terminacion</span>
                      <input type="date" value={contractForm.endDate} onChange={(event) => updateContractFormField("endDate", event.target.value)} />
                    </label>

                    <label className="form-field">
                      <span>Fecha de firma</span>
                      <input required type="date" value={contractForm.signingDate} onChange={(event) => updateContractFormField("signingDate", event.target.value)} />
                    </label>
                  </div>
                </div>

                <div className="finance-contract-form-section">
                  <div className="panel-header finance-contract-section-head">
                    <h4>Informacion tomada automaticamente de la cotizacion</h4>
                    <span>Solo lectura para evitar doble captura.</span>
                  </div>

                  <div className="finance-table-shell finance-contract-table-shell">
                    <table className="finance-table finance-contract-detail-table">
                      <thead>
                        <tr>
                          <th>Servicio</th>
                          <th>Honorarios</th>
                          <th>Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contractPrefill.serviceLines.map((line) => (
                          <tr key={line.id}>
                            <td>{line.service}</td>
                            <td>{line.fees}</td>
                            <td>{line.observations}</td>
                          </tr>
                        ))}
                        {contractPrefill.serviceLines.length === 0 ? (
                          <tr>
                            <td className="centered-inline-message" colSpan={3}>La cotizacion no trae conceptos visibles.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div className="finance-contract-milestones">
                    <strong>Momentos de pago</strong>
                    <div>
                      {contractPrefill.paymentMilestones.length > 0
                        ? contractPrefill.paymentMilestones.map((milestone) => (
                            <span className="finance-contract-milestone-chip" key={milestone.id}>{milestone.label}</span>
                          ))
                        : <span className="muted">Sin momentos de pago especificados.</span>}
                    </div>
                  </div>
                </div>

                <div className="finance-modal-actions">
                  <button className="primary-button" type="submit" disabled={contractGenerating || contractPrefillLoading}>
                    {contractGenerating ? "Generando..." : "Generar y guardar"}
                  </button>
                  {contractPrefill.contractId && contractPrefill.availableFormats.includes("docx") ? (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={contractActionKey === `${contractPrefill.contractId}:docx`}
                      onClick={() => void handleContractDownload(contractPrefill.contractId!, "docx")}
                    >
                      {contractActionKey === `${contractPrefill.contractId}:docx` ? "DOCX..." : "Descargar DOCX"}
                    </button>
                  ) : null}
                  {contractPrefill.contractId && contractPrefill.availableFormats.includes("pdf") ? (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={contractActionKey === `${contractPrefill.contractId}:pdf`}
                      onClick={() => void handleContractDownload(contractPrefill.contractId!, "pdf")}
                    >
                      {contractActionKey === `${contractPrefill.contractId}:pdf` ? "PDF..." : "Descargar PDF"}
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <div className="centered-inline-message">No fue posible preparar el contrato para este asunto.</div>
            )}
          </div>
        </div>
      ) : null}

      {copyModalOpen ? (
        <div className="finance-modal-backdrop">
          <div className="finance-modal">
            <h3>Advertencia</h3>
            <p>Esta accion borrara todos los registros existentes del siguiente mes y los reemplazara con los registros actuales.</p>
            <div className="finance-modal-actions">
              <button className="secondary-button" type="button" onClick={() => setCopyModalOpen(false)}>Cancelar</button>
              <button className="danger-button" type="button" onClick={() => void handleCopyToNextMonth()} disabled={!canWriteFinances}>Continuar</button>
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
                    <th>No.</th><th>Cliente</th><th>No. Cot.</th><th>Responsable</th><th>Tipo Asunto</th><th>Asunto</th><th>Tipo</th><th>Total Asunto</th><th>Conceptos</th><th>Hon. Conceptos</th><th>Pagos Previos</th><th>Remanente</th><th>Fecha de proximo pago</th><th>Semana</th><th>Pagado este mes</th><th>Fecha Pago Real</th><th>Adeudado</th><th>Netos</th><th>Comm Cliente (20%)</th><th>Comm Cierre (10%)</th><th>Comm Ventas (1%)</th><th>Ut. Neta</th>
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
                        <td>{formatCurrency(stats.salesCommissionMxn)}</td>
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
