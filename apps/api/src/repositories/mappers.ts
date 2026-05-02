import type { Prisma } from "@prisma/client";
import type {
  AuthUser,
  BudgetPlan,
  BudgetPlanSnapshot,
  Client,
  CommissionReceiver,
  CommissionSnapshot,
  FinanceRecord,
  FinanceSnapshot,
  GeneralExpense,
  Lead,
  ManagedUser,
  Matter,
  Quote,
  QuoteTemplate,
  TaskAdditionalTask,
  TaskDistributionEvent,
  TaskDistributionHistory,
  TaskItem,
  TaskModuleDefinition,
  TaskTerm,
  TaskTrackingRecord
} from "@sige/contracts";

import type { RefreshTokenRecord, StoredUser } from "./types";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry));
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, String(entry)])
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asQuoteTemplateCell(value: unknown, fallback = ""): QuoteTemplate["tableRows"][number]["paymentMoment"] {
  if (!value || typeof value !== "object") {
    return {
      value: fallback,
      rowSpan: 1,
      hidden: false
    };
  }

  const candidate = value as {
    value?: unknown;
    rowSpan?: unknown;
    hidden?: unknown;
  };

  return {
    value: typeof candidate.value === "string" ? candidate.value : fallback,
    rowSpan: typeof candidate.rowSpan === "number" && candidate.rowSpan > 0 ? Math.floor(candidate.rowSpan) : 1,
    hidden: Boolean(candidate.hidden)
  };
}

function asQuoteTemplateAmountColumns(value: unknown): QuoteTemplate["amountColumns"] {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      { id: "primary", title: "Monto 1", enabled: true, mode: "FIXED" },
      { id: "secondary", title: "Monto 2", enabled: false, mode: "FIXED" }
    ];
  }

  const parsed = value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => {
      const candidate = entry as {
        id?: unknown;
        title?: unknown;
        enabled?: unknown;
        mode?: unknown;
      };

      return {
        id: typeof candidate.id === "string" ? candidate.id : index === 0 ? "primary" : "secondary",
        title: typeof candidate.title === "string" ? candidate.title : `Monto ${index + 1}`,
        enabled: index === 0 ? true : Boolean(candidate.enabled),
        mode: candidate.mode === "VARIABLE" ? "VARIABLE" : "FIXED"
      } satisfies QuoteTemplate["amountColumns"][number];
    });

  if (parsed.length === 1) {
    parsed.push({ id: "secondary", title: "Monto 2", enabled: false, mode: "FIXED" });
  }

  return parsed.slice(0, 2);
}

function asLegacyQuoteTemplateRows(lineItems: QuoteTemplate["lineItems"]): QuoteTemplate["tableRows"] {
  if (lineItems.length === 0) {
    return [
      {
        id: "row-1",
        conceptDescription: "",
        amountCells: [
          { value: "", rowSpan: 1, hidden: false },
          { value: "", rowSpan: 1, hidden: false }
        ],
        paymentMoment: { value: "", rowSpan: 1, hidden: false },
        notesCell: { value: "", rowSpan: 1, hidden: false }
      }
    ];
  }

  return lineItems.map((lineItem, index) => ({
    id: `legacy-row-${index + 1}`,
    conceptDescription: lineItem.concept,
    amountCells: [
      { value: String(lineItem.amountMxn), rowSpan: 1, hidden: false },
      { value: "", rowSpan: 1, hidden: false }
    ],
    paymentMoment: { value: "", rowSpan: 1, hidden: false },
    notesCell: { value: "", rowSpan: 1, hidden: false }
  }));
}

function asQuoteTemplateRows(value: unknown, lineItems: QuoteTemplate["lineItems"]): QuoteTemplate["tableRows"] {
  if (!Array.isArray(value) || value.length === 0) {
    return asLegacyQuoteTemplateRows(lineItems);
  }

  return value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => {
      const candidate = entry as {
        id?: unknown;
        conceptDescription?: unknown;
        amountCells?: unknown;
        paymentMoment?: unknown;
        notesCell?: unknown;
        notes?: unknown;
      };

      const amountCellsSource = Array.isArray(candidate.amountCells) ? candidate.amountCells : [];
      const amountCells = [0, 1].map((cellIndex) =>
        asQuoteTemplateCell(amountCellsSource[cellIndex], "")
      );

      return {
        id: typeof candidate.id === "string" ? candidate.id : `row-${index + 1}`,
        conceptDescription:
          typeof candidate.conceptDescription === "string" ? candidate.conceptDescription : "",
        amountCells,
        paymentMoment: asQuoteTemplateCell(candidate.paymentMoment, ""),
        notesCell: asQuoteTemplateCell(
          candidate.notesCell,
          typeof candidate.notes === "string" ? candidate.notes : ""
        )
      } satisfies QuoteTemplate["tableRows"][number];
    });
}

export function mapUser(record: {
  id: string;
  email: string;
  username: string;
  displayName: string;
  shortName: string | null;
  role: string;
  legacyRole: string;
  team: string | null;
  legacyTeam: string | null;
  specificRole: string | null;
  permissions: Prisma.JsonValue;
  isActive: boolean;
  passwordResetRequired: boolean;
}): AuthUser {
  return {
    id: record.id,
    email: record.email,
    username: record.username,
    displayName: record.displayName,
    shortName: record.shortName ?? undefined,
    role: record.role as AuthUser["role"],
    legacyRole: record.legacyRole as AuthUser["legacyRole"],
    team: (record.team ?? undefined) as AuthUser["team"],
    legacyTeam: record.legacyTeam ?? undefined,
    specificRole: record.specificRole ?? undefined,
    permissions: asStringArray(record.permissions),
    isActive: record.isActive,
    passwordResetRequired: record.passwordResetRequired
  };
}

export function mapStoredUser(record: {
  id: string;
  email: string;
  username: string;
  displayName: string;
  shortName: string | null;
  role: string;
  legacyRole: string;
  team: string | null;
  legacyTeam: string | null;
  specificRole: string | null;
  permissions: Prisma.JsonValue;
  isActive: boolean;
  passwordResetRequired: boolean;
  passwordHash: string;
}): StoredUser {
  return {
    ...mapUser(record),
    passwordHash: record.passwordHash
  };
}

export function mapManagedUser(record: {
  id: string;
  email: string;
  username: string;
  displayName: string;
  shortName: string | null;
  role: string;
  legacyRole: string;
  team: string | null;
  legacyTeam: string | null;
  specificRole: string | null;
  permissions: Prisma.JsonValue;
  isActive: boolean;
  passwordResetRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  emailConfirmedAt: Date | null;
}): ManagedUser {
  return {
    ...mapUser(record),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastLoginAt: record.lastLoginAt?.toISOString(),
    emailConfirmedAt: record.emailConfirmedAt?.toISOString()
  };
}

export function mapClient(record: { id: string; clientNumber: string; name: string; createdAt: Date }): Client {
  return {
    id: record.id,
    clientNumber: record.clientNumber,
    name: record.name,
    createdAt: record.createdAt.toISOString()
  };
}

export function mapQuote(record: {
  id: string;
  quoteNumber: string;
  clientId: string;
  clientName: string;
  responsibleTeam: string | null;
  subject: string;
  status: string;
  quoteType: string;
  language: string | null;
  quoteDate: Date;
  amountColumns: Prisma.JsonValue | null;
  tableRows: Prisma.JsonValue | null;
  lineItems: Prisma.JsonValue;
  totalMxn: Prisma.Decimal;
  milestone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Quote {
  return {
    id: record.id,
    quoteNumber: record.quoteNumber,
    clientId: record.clientId,
    clientName: record.clientName,
    responsibleTeam: record.responsibleTeam as Quote["responsibleTeam"],
    subject: record.subject,
    status: record.status as Quote["status"],
    quoteType: record.quoteType as Quote["quoteType"],
    language: record.language === "en" ? "en" : "es",
    quoteDate: record.quoteDate.toISOString(),
    amountColumns: record.amountColumns ? asQuoteTemplateAmountColumns(record.amountColumns) : undefined,
    tableRows: record.tableRows ? asQuoteTemplateRows(record.tableRows, ((Array.isArray(record.lineItems) ? record.lineItems : []) as unknown as Quote["lineItems"])) : undefined,
    lineItems: ((Array.isArray(record.lineItems) ? record.lineItems : []) as unknown as Quote["lineItems"]),
    totalMxn: Number(record.totalMxn),
    milestone: record.milestone ?? undefined,
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapQuoteTemplate(record: {
  id: string;
  templateNumber: string | null;
  name: string;
  team: string;
  subject: string;
  services: string | null;
  quoteType: string;
  amountColumns: Prisma.JsonValue | null;
  tableRows: Prisma.JsonValue | null;
  lineItems: Prisma.JsonValue;
  totalMxn: Prisma.Decimal;
  milestone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): QuoteTemplate {
  const lineItems = ((Array.isArray(record.lineItems) ? record.lineItems : []) as unknown as QuoteTemplate["lineItems"]);
  return {
    id: record.id,
    templateNumber: record.templateNumber ?? record.name,
    name: record.name,
    team: record.team as QuoteTemplate["team"],
    subject: record.subject,
    services: record.services ?? record.subject,
    quoteType: record.quoteType as QuoteTemplate["quoteType"],
    amountColumns: asQuoteTemplateAmountColumns(record.amountColumns),
    tableRows: asQuoteTemplateRows(record.tableRows, lineItems),
    lineItems,
    totalMxn: Number(record.totalMxn),
    milestone: record.milestone ?? undefined,
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapLead(record: {
  id: string;
  clientId: string | null;
  clientName: string;
  prospectName: string | null;
  commissionAssignee: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  subject: string;
  amountMxn: Prisma.Decimal;
  communicationChannel: string;
  lastInteractionLabel: string | null;
  lastInteraction: Date | null;
  nextInteractionLabel: string | null;
  nextInteraction: Date | null;
  notes: string | null;
  sentToClientAt: Date | null;
  sentToMattersAt: Date | null;
  hiddenFromTracking: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): Lead {
  return {
    id: record.id,
    clientId: record.clientId ?? undefined,
    clientName: record.clientName,
    prospectName: record.prospectName ?? undefined,
    commissionAssignee: record.commissionAssignee ?? undefined,
    quoteId: record.quoteId ?? undefined,
    quoteNumber: record.quoteNumber ?? undefined,
    subject: record.subject,
    amountMxn: Number(record.amountMxn),
    communicationChannel: record.communicationChannel as Lead["communicationChannel"],
    lastInteractionLabel: record.lastInteractionLabel ?? undefined,
    lastInteraction: record.lastInteraction?.toISOString(),
    nextInteractionLabel: record.nextInteractionLabel ?? undefined,
    nextInteraction: record.nextInteraction?.toISOString(),
    notes: record.notes ?? undefined,
    sentToClientAt: record.sentToClientAt?.toISOString(),
    sentToMattersAt: record.sentToMattersAt?.toISOString(),
    hiddenFromTracking: record.hiddenFromTracking,
    status: record.status as Lead["status"],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapMatter(record: {
  id: string;
  matterNumber: string;
  clientId: string | null;
  clientNumber: string | null;
  clientName: string;
  quoteId: string | null;
  quoteNumber: string | null;
  commissionAssignee: string | null;
  matterType: string;
  subject: string;
  specificProcess: string | null;
  totalFeesMxn: Prisma.Decimal;
  responsibleTeam: string | null;
  nextPaymentDate: Date | null;
  communicationChannel: string;
  r1InternalCreated: boolean;
  telegramBotLinked: boolean;
  rdCreated: boolean;
  rfCreated: string;
  r1ExternalCreated: boolean;
  billingChatCreated: boolean;
  matterIdentifier: string | null;
  executionLinkedModule: string | null;
  executionLinkedAt: Date | null;
  executionPrompt: string | null;
  nextAction: string | null;
  nextActionDueAt: Date | null;
  nextActionSource: string | null;
  milestone: string | null;
  concluded: boolean;
  stage: string;
  origin: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): Matter {
  return {
    id: record.id,
    matterNumber: record.matterNumber,
    clientId: record.clientId ?? undefined,
    clientNumber: record.clientNumber ?? undefined,
    clientName: record.clientName,
    quoteId: record.quoteId ?? undefined,
    quoteNumber: record.quoteNumber ?? undefined,
    commissionAssignee: record.commissionAssignee ?? undefined,
    matterType: record.matterType as Matter["matterType"],
    subject: record.subject,
    specificProcess: record.specificProcess ?? undefined,
    totalFeesMxn: Number(record.totalFeesMxn),
    responsibleTeam: (record.responsibleTeam ?? undefined) as Matter["responsibleTeam"],
    nextPaymentDate: record.nextPaymentDate?.toISOString(),
    communicationChannel: record.communicationChannel as Matter["communicationChannel"],
    r1InternalCreated: record.r1InternalCreated,
    telegramBotLinked: record.telegramBotLinked,
    rdCreated: record.rdCreated,
    rfCreated: record.rfCreated as Matter["rfCreated"],
    r1ExternalCreated: record.r1ExternalCreated,
    billingChatCreated: record.billingChatCreated,
    matterIdentifier: record.matterIdentifier ?? undefined,
    executionLinkedModule: record.executionLinkedModule ?? undefined,
    executionLinkedAt: record.executionLinkedAt?.toISOString(),
    executionPrompt: record.executionPrompt ?? undefined,
    nextAction: record.nextAction ?? undefined,
    nextActionDueAt: record.nextActionDueAt?.toISOString(),
    nextActionSource: record.nextActionSource ?? undefined,
    milestone: record.milestone ?? undefined,
    concluded: record.concluded,
    stage: record.stage as Matter["stage"],
    origin: record.origin as Matter["origin"],
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString()
  };
}

export function mapCommissionReceiver(record: {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
}): CommissionReceiver {
  return {
    id: record.id,
    name: record.name,
    active: record.active,
    createdAt: record.createdAt.toISOString()
  };
}

export function mapFinanceRecord(record: {
  id: string;
  year: number;
  month: number;
  clientNumber: string | null;
  clientName: string;
  quoteNumber: string | null;
  matterType: string;
  subject: string;
  contractSignedStatus: string;
  responsibleTeam: string | null;
  totalMatterMxn: Prisma.Decimal;
  workingConcepts: string | null;
  conceptFeesMxn: Prisma.Decimal;
  previousPaymentsMxn: Prisma.Decimal;
  nextPaymentDate: Date | null;
  nextPaymentNotes: string | null;
  paidThisMonthMxn: Prisma.Decimal;
  payment2Mxn: Prisma.Decimal;
  payment3Mxn: Prisma.Decimal;
  paymentDate1: Date | null;
  paymentDate2: Date | null;
  paymentDate3: Date | null;
  expenseNotes1: string | null;
  expenseNotes2: string | null;
  expenseNotes3: string | null;
  expenseAmount1Mxn: Prisma.Decimal;
  expenseAmount2Mxn: Prisma.Decimal;
  expenseAmount3Mxn: Prisma.Decimal;
  pctLitigation: number;
  pctCorporateLabor: number;
  pctSettlements: number;
  pctFinancialLaw: number;
  pctTaxCompliance: number;
  clientCommissionRecipient: string | null;
  closingCommissionRecipient: string | null;
  milestone: string | null;
  concluded: boolean;
  financeComments: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FinanceRecord {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    clientNumber: record.clientNumber ?? undefined,
    clientName: record.clientName,
    quoteNumber: record.quoteNumber ?? undefined,
    matterType: record.matterType as FinanceRecord["matterType"],
    subject: record.subject,
    contractSignedStatus: record.contractSignedStatus as FinanceRecord["contractSignedStatus"],
    responsibleTeam: (record.responsibleTeam ?? undefined) as FinanceRecord["responsibleTeam"],
    totalMatterMxn: Number(record.totalMatterMxn),
    workingConcepts: record.workingConcepts ?? undefined,
    conceptFeesMxn: Number(record.conceptFeesMxn),
    previousPaymentsMxn: Number(record.previousPaymentsMxn),
    nextPaymentDate: record.nextPaymentDate?.toISOString(),
    nextPaymentNotes: record.nextPaymentNotes ?? undefined,
    paidThisMonthMxn: Number(record.paidThisMonthMxn),
    payment2Mxn: Number(record.payment2Mxn),
    payment3Mxn: Number(record.payment3Mxn),
    paymentDate1: record.paymentDate1?.toISOString(),
    paymentDate2: record.paymentDate2?.toISOString(),
    paymentDate3: record.paymentDate3?.toISOString(),
    expenseNotes1: record.expenseNotes1 ?? undefined,
    expenseNotes2: record.expenseNotes2 ?? undefined,
    expenseNotes3: record.expenseNotes3 ?? undefined,
    expenseAmount1Mxn: Number(record.expenseAmount1Mxn),
    expenseAmount2Mxn: Number(record.expenseAmount2Mxn),
    expenseAmount3Mxn: Number(record.expenseAmount3Mxn),
    pctLitigation: record.pctLitigation,
    pctCorporateLabor: record.pctCorporateLabor,
    pctSettlements: record.pctSettlements,
    pctFinancialLaw: record.pctFinancialLaw,
    pctTaxCompliance: record.pctTaxCompliance,
    clientCommissionRecipient: record.clientCommissionRecipient ?? undefined,
    closingCommissionRecipient: record.closingCommissionRecipient ?? undefined,
    milestone: record.milestone ?? undefined,
    concluded: record.concluded,
    financeComments: record.financeComments ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapFinanceSnapshot(record: {
  id: string;
  year: number;
  month: number;
  title: string;
  totalIncomeMxn: Prisma.Decimal;
  totalExpenseMxn: Prisma.Decimal;
  balanceMxn: Prisma.Decimal;
  snapshotData: Prisma.JsonValue | null;
  createdAt: Date;
}): FinanceSnapshot {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    title: record.title,
    totalIncomeMxn: Number(record.totalIncomeMxn),
    totalExpenseMxn: Number(record.totalExpenseMxn),
    balanceMxn: Number(record.balanceMxn),
    snapshotData: (record.snapshotData ?? undefined) as FinanceSnapshot["snapshotData"],
    createdAt: record.createdAt.toISOString()
  };
}

export function mapGeneralExpense(record: {
  id: string;
  year: number;
  month: number;
  detail: string;
  amountMxn: Prisma.Decimal;
  countsTowardLimit: boolean;
  team: string;
  generalExpense: boolean;
  expenseWithoutTeam: boolean;
  pctLitigation: Prisma.Decimal;
  pctCorporateLabor: Prisma.Decimal;
  pctSettlements: Prisma.Decimal;
  pctFinancialLaw: Prisma.Decimal;
  pctTaxCompliance: Prisma.Decimal;
  paymentMethod: string;
  bank: string | null;
  recurring: boolean;
  approvedByEmrt: boolean;
  paidByEmrtAt: Date | null;
  reviewedByJnls: boolean;
  paid: boolean;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): GeneralExpense {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    detail: record.detail,
    amountMxn: Number(record.amountMxn),
    countsTowardLimit: record.countsTowardLimit,
    team: record.team as GeneralExpense["team"],
    generalExpense: record.generalExpense,
    expenseWithoutTeam: record.expenseWithoutTeam,
    pctLitigation: Number(record.pctLitigation),
    pctCorporateLabor: Number(record.pctCorporateLabor),
    pctSettlements: Number(record.pctSettlements),
    pctFinancialLaw: Number(record.pctFinancialLaw),
    pctTaxCompliance: Number(record.pctTaxCompliance),
    paymentMethod: record.paymentMethod as GeneralExpense["paymentMethod"],
    bank: (record.bank ?? undefined) as GeneralExpense["bank"],
    recurring: record.recurring,
    approvedByEmrt: record.approvedByEmrt,
    paidByEmrtAt: record.paidByEmrtAt?.toISOString(),
    reviewedByJnls: record.reviewedByJnls,
    paid: record.paid,
    paidAt: record.paidAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapBudgetPlan(record: {
  id: string;
  year: number;
  month: number;
  expectedIncomeMxn: Prisma.Decimal;
  expectedExpenseMxn: Prisma.Decimal;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): BudgetPlan {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    expectedIncomeMxn: Number(record.expectedIncomeMxn),
    expectedExpenseMxn: Number(record.expectedExpenseMxn),
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapBudgetPlanSnapshot(record: {
  id: string;
  year: number;
  month: number;
  expectedIncomeMxn: Prisma.Decimal;
  expectedExpenseMxn: Prisma.Decimal;
  actualIncomeMxn: Prisma.Decimal;
  actualExpenseMxn: Prisma.Decimal;
  expectedResultMxn: Prisma.Decimal;
  actualResultMxn: Prisma.Decimal;
  financeRecordCount: number;
  generalExpenseCount: number;
  notes: string | null;
  createdAt: Date;
}): BudgetPlanSnapshot {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    expectedIncomeMxn: Number(record.expectedIncomeMxn),
    expectedExpenseMxn: Number(record.expectedExpenseMxn),
    actualIncomeMxn: Number(record.actualIncomeMxn),
    actualExpenseMxn: Number(record.actualExpenseMxn),
    expectedResultMxn: Number(record.expectedResultMxn),
    actualResultMxn: Number(record.actualResultMxn),
    financeRecordCount: record.financeRecordCount,
    generalExpenseCount: record.generalExpenseCount,
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString()
  };
}

export function mapCommissionSnapshot(record: {
  id: string;
  year: number;
  month: number;
  section: string;
  title: string;
  totalNetMxn: Prisma.Decimal;
  snapshotData: Prisma.JsonValue | null;
  createdAt: Date;
}): CommissionSnapshot {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    section: record.section,
    title: record.title,
    totalNetMxn: Number(record.totalNetMxn),
    snapshotData: (record.snapshotData ?? undefined) as CommissionSnapshot["snapshotData"],
    createdAt: record.createdAt.toISOString()
  };
}

export function mapTaskItem(record: {
  id: string;
  moduleId: string;
  trackId: string;
  clientName: string;
  matterId: string | null;
  matterNumber: string | null;
  subject: string;
  responsible: string;
  dueDate: Date;
  state: string;
  recurring: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TaskItem {
  return {
    id: record.id,
    moduleId: record.moduleId,
    trackId: record.trackId,
    clientName: record.clientName,
    matterId: record.matterId ?? undefined,
    matterNumber: record.matterNumber ?? undefined,
    subject: record.subject,
    responsible: record.responsible,
    dueDate: record.dueDate.toISOString(),
    state: record.state as TaskItem["state"],
    recurring: record.recurring,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapTaskTrackingRecord(record: {
  id: string;
  moduleId: string;
  tableCode: string;
  sourceTable: string;
  matterId: string | null;
  matterNumber: string | null;
  clientNumber: string | null;
  clientName: string;
  subject: string;
  specificProcess: string | null;
  matterIdentifier: string | null;
  taskName: string;
  eventName: string | null;
  responsible: string;
  dueDate: Date | null;
  termDate: Date | null;
  completedAt: Date | null;
  status: string;
  workflowStage: number;
  reportedMonth: string | null;
  termId: string | null;
  data: Prisma.JsonValue;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TaskTrackingRecord {
  return {
    id: record.id,
    moduleId: record.moduleId,
    tableCode: record.tableCode,
    sourceTable: record.sourceTable,
    matterId: record.matterId ?? undefined,
    matterNumber: record.matterNumber ?? undefined,
    clientNumber: record.clientNumber ?? undefined,
    clientName: record.clientName,
    subject: record.subject,
    specificProcess: record.specificProcess ?? undefined,
    matterIdentifier: record.matterIdentifier ?? undefined,
    taskName: record.taskName,
    eventName: record.eventName ?? undefined,
    responsible: record.responsible,
    dueDate: record.dueDate?.toISOString(),
    termDate: record.termDate?.toISOString(),
    completedAt: record.completedAt?.toISOString(),
    status: record.status as TaskTrackingRecord["status"],
    workflowStage: record.workflowStage,
    reportedMonth: record.reportedMonth ?? undefined,
    termId: record.termId ?? undefined,
    data: asRecord(record.data),
    deletedAt: record.deletedAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapTaskTerm(record: {
  id: string;
  moduleId: string;
  sourceTable: string | null;
  sourceRecordId: string | null;
  matterId: string | null;
  matterNumber: string | null;
  clientNumber: string | null;
  clientName: string;
  subject: string;
  specificProcess: string | null;
  matterIdentifier: string | null;
  eventName: string;
  pendingTaskLabel: string | null;
  responsible: string;
  dueDate: Date | null;
  termDate: Date | null;
  status: string;
  recurring: boolean;
  reportedMonth: string | null;
  verification: Prisma.JsonValue;
  data: Prisma.JsonValue;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TaskTerm {
  return {
    id: record.id,
    moduleId: record.moduleId,
    sourceTable: record.sourceTable ?? undefined,
    sourceRecordId: record.sourceRecordId ?? undefined,
    matterId: record.matterId ?? undefined,
    matterNumber: record.matterNumber ?? undefined,
    clientNumber: record.clientNumber ?? undefined,
    clientName: record.clientName,
    subject: record.subject,
    specificProcess: record.specificProcess ?? undefined,
    matterIdentifier: record.matterIdentifier ?? undefined,
    eventName: record.eventName,
    pendingTaskLabel: record.pendingTaskLabel ?? undefined,
    responsible: record.responsible,
    dueDate: record.dueDate?.toISOString(),
    termDate: record.termDate?.toISOString(),
    status: record.status as TaskTerm["status"],
    recurring: record.recurring,
    reportedMonth: record.reportedMonth ?? undefined,
    verification: asStringRecord(record.verification),
    data: asRecord(record.data),
    deletedAt: record.deletedAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapTaskDistributionEvent(record: {
  id: string;
  moduleId: string;
  name: string;
  targetTables: Prisma.JsonValue;
  defaultTaskName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TaskDistributionEvent {
  return {
    id: record.id,
    moduleId: record.moduleId,
    name: record.name,
    targetTables: asStringArray(record.targetTables),
    defaultTaskName: record.defaultTaskName ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapTaskDistributionHistory(record: {
  id: string;
  moduleId: string;
  matterId: string | null;
  matterNumber: string | null;
  clientNumber: string | null;
  clientName: string;
  subject: string;
  specificProcess: string | null;
  matterIdentifier: string | null;
  eventName: string;
  targetTables: Prisma.JsonValue;
  eventNamesPerTable: Prisma.JsonValue;
  createdIds: Prisma.JsonValue;
  data: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): TaskDistributionHistory {
  return {
    id: record.id,
    moduleId: record.moduleId,
    matterId: record.matterId ?? undefined,
    matterNumber: record.matterNumber ?? undefined,
    clientNumber: record.clientNumber ?? undefined,
    clientName: record.clientName,
    subject: record.subject,
    specificProcess: record.specificProcess ?? undefined,
    matterIdentifier: record.matterIdentifier ?? undefined,
    eventName: record.eventName,
    targetTables: asStringArray(record.targetTables),
    eventNamesPerTable: asStringArray(record.eventNamesPerTable),
    createdIds: asStringRecord(record.createdIds),
    data: asRecord(record.data),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapTaskAdditionalTask(record: {
  id: string;
  moduleId: string;
  task: string;
  responsible: string;
  responsible2: string | null;
  dueDate: Date | null;
  recurring: boolean;
  status: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TaskAdditionalTask {
  return {
    id: record.id,
    moduleId: record.moduleId,
    task: record.task,
    responsible: record.responsible,
    responsible2: record.responsible2 ?? undefined,
    dueDate: record.dueDate?.toISOString(),
    recurring: record.recurring,
    status: record.status as TaskAdditionalTask["status"],
    deletedAt: record.deletedAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapRefreshToken(record: {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}): RefreshTokenRecord {
  return {
    id: record.id,
    userId: record.userId,
    tokenHash: record.tokenHash,
    expiresAt: record.expiresAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString()
  };
}

export function mapPasswordResetToken(record: {
  id: string;
  userId: string;
  tokenHash: string;
  purpose: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: record.id,
    userId: record.userId,
    tokenHash: record.tokenHash,
    purpose: record.purpose,
    expiresAt: record.expiresAt.toISOString(),
    consumedAt: record.consumedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString()
  };
}

export function mapTaskModule(record: {
  id: string;
  team: string;
  label: string;
  summary: string;
  tracks: Array<{
    trackCode: string;
    label: string;
    mode: string;
    recurring: boolean;
    recurrenceRule: Prisma.JsonValue | null;
  }>;
}): TaskModuleDefinition {
  return {
    id: record.id,
    team: record.team as TaskModuleDefinition["team"],
    label: record.label,
    summary: record.summary,
    tracks: record.tracks.map((track) => ({
      id: track.trackCode,
      label: track.label,
      mode: track.mode as TaskModuleDefinition["tracks"][number]["mode"],
      recurring: track.recurring,
      recurrenceRule: (track.recurrenceRule ?? undefined) as TaskModuleDefinition["tracks"][number]["recurrenceRule"]
    }))
  };
}
