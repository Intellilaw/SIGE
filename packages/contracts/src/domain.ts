export type Team =
  | "ADMIN"
  | "CLIENT_RELATIONS"
  | "FINANCE"
  | "LITIGATION"
  | "CORPORATE_LABOR"
  | "SETTLEMENTS"
  | "FINANCIAL_LAW"
  | "TAX_COMPLIANCE"
  | "ADMIN_OPERATIONS";

export type SystemRole =
  | "SUPERADMIN"
  | "DIRECTOR"
  | "TEAM_LEAD"
  | "ANALYST"
  | "AUDITOR";

export type LegacyAccessRole = "SUPERADMIN" | "INTRANET" | "PUBLIC";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  shortName?: string;
  role: SystemRole;
  legacyRole: LegacyAccessRole;
  team?: Team;
  legacyTeam?: string;
  specificRole?: string;
  permissions: string[];
  isActive: boolean;
  passwordResetRequired: boolean;
}

export interface Client {
  id: string;
  clientNumber: string;
  name: string;
  createdAt: string;
}

export interface QuoteLineItem {
  concept: string;
  amountMxn: number;
}

export type QuoteTemplateAmountMode = "FIXED" | "VARIABLE";

export interface QuoteTemplateCell {
  value: string;
  rowSpan: number;
  hidden: boolean;
}

export interface QuoteTemplateAmountColumn {
  id: string;
  title: string;
  enabled: boolean;
  mode: QuoteTemplateAmountMode;
}

export interface QuoteTemplateTableRow {
  id: string;
  conceptDescription: string;
  amountCells: QuoteTemplateCell[];
  paymentMoment: QuoteTemplateCell;
  notesCell: QuoteTemplateCell;
}

export type QuoteStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED";
export type QuoteType = "ONE_TIME" | "RETAINER";

export interface Quote {
  id: string;
  quoteNumber: string;
  clientId: string;
  clientName: string;
  responsibleTeam?: Team;
  subject: string;
  status: QuoteStatus;
  quoteType: QuoteType;
  amountColumns?: QuoteTemplateAmountColumn[];
  tableRows?: QuoteTemplateTableRow[];
  lineItems: QuoteLineItem[];
  totalMxn: number;
  milestone?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteTemplate {
  id: string;
  templateNumber: string;
  name: string;
  team: Team;
  subject: string;
  services: string;
  quoteType: QuoteType;
  amountColumns: QuoteTemplateAmountColumn[];
  tableRows: QuoteTemplateTableRow[];
  lineItems: QuoteLineItem[];
  totalMxn: number;
  milestone?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus = "ACTIVE" | "MOVED_TO_MATTERS" | "ARCHIVED";

export interface Lead {
  id: string;
  clientId?: string;
  clientName: string;
  prospectName?: string;
  commissionAssignee?: string;
  quoteId?: string;
  quoteNumber?: string;
  subject: string;
  amountMxn: number;
  communicationChannel: "WHATSAPP" | "TELEGRAM" | "WECHAT" | "EMAIL" | "PHONE";
  lastInteractionLabel?: string;
  lastInteraction?: string;
  nextInteractionLabel?: string;
  nextInteraction?: string;
  notes?: string;
  sentToClientAt?: string;
  sentToMattersAt?: string;
  hiddenFromTracking: boolean;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
}

export type MatterStage = "INTAKE" | "EXECUTION" | "CLOSED";
export type MatterRfStatus = "YES" | "NO" | "NOT_REQUIRED";
export type ContractSignedStatus = "YES" | "NO" | "NOT_REQUIRED";

export interface Matter {
  id: string;
  matterNumber: string;
  clientId?: string;
  clientNumber?: string;
  clientName: string;
  quoteId?: string;
  quoteNumber?: string;
  commissionAssignee?: string;
  matterType: QuoteType;
  subject: string;
  specificProcess?: string;
  totalFeesMxn: number;
  responsibleTeam?: Team;
  nextPaymentDate?: string;
  communicationChannel: Lead["communicationChannel"];
  r1InternalCreated: boolean;
  telegramBotLinked: boolean;
  rdCreated: boolean;
  rfCreated: MatterRfStatus;
  r1ExternalCreated: boolean;
  billingChatCreated: boolean;
  matterIdentifier?: string;
  executionLinkedModule?: string;
  executionLinkedAt?: string;
  executionPrompt?: string;
  nextAction?: string;
  nextActionDueAt?: string;
  nextActionSource?: string;
  milestone?: string;
  concluded: boolean;
  stage: MatterStage;
  origin: "MANUAL" | "LEAD" | "QUOTE";
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CommissionReceiver {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
}

export const COMMISSION_SECTIONS = [
  "Direccion general",
  "Litigio (lider)",
  "Litigio (colaborador)",
  "Corporativo-laboral (lider)",
  "Corporativo-laboral (colaborador)",
  "Convenios (lider)",
  "Convenios (colaborador)",
  "Der Financiero (lider)",
  "Der Financiero (colaborador)",
  "Compliance Fiscal (lider)",
  "Compliance Fiscal (colaborador)",
  "Comunicacion con cliente",
  "Finanzas"
] as const;

export type CommissionSection = typeof COMMISSION_SECTIONS[number];

export interface FinanceRecordStats {
  totalPaidMxn: number;
  totalExpensesMxn: number;
  netFeesMxn: number;
  remainingMxn: number;
  dueTodayMxn: number;
  clientCommissionMxn: number;
  closingCommissionMxn: number;
  commissionableBaseMxn: number;
  pctSum: number;
  litigationLeaderCommissionMxn: number;
  litigationCollaboratorCommissionMxn: number;
  corporateLeaderCommissionMxn: number;
  corporateCollaboratorCommissionMxn: number;
  settlementsLeaderCommissionMxn: number;
  settlementsCollaboratorCommissionMxn: number;
  financialLeaderCommissionMxn: number;
  financialCollaboratorCommissionMxn: number;
  taxLeaderCommissionMxn: number;
  taxCollaboratorCommissionMxn: number;
  clientRelationsCommissionMxn: number;
  financeCommissionMxn: number;
  netProfitMxn: number;
}

export interface FinanceRecord {
  id: string;
  year: number;
  month: number;
  clientNumber?: string;
  clientName: string;
  quoteNumber?: string;
  matterType: QuoteType;
  subject: string;
  contractSignedStatus: ContractSignedStatus;
  responsibleTeam?: Team;
  totalMatterMxn: number;
  workingConcepts?: string;
  conceptFeesMxn: number;
  previousPaymentsMxn: number;
  nextPaymentDate?: string;
  nextPaymentNotes?: string;
  paidThisMonthMxn: number;
  payment2Mxn: number;
  payment3Mxn: number;
  paymentDate1?: string;
  paymentDate2?: string;
  paymentDate3?: string;
  expenseNotes1?: string;
  expenseNotes2?: string;
  expenseNotes3?: string;
  expenseAmount1Mxn: number;
  expenseAmount2Mxn: number;
  expenseAmount3Mxn: number;
  pctLitigation: number;
  pctCorporateLabor: number;
  pctSettlements: number;
  pctFinancialLaw: number;
  pctTaxCompliance: number;
  clientCommissionRecipient?: string;
  closingCommissionRecipient?: string;
  milestone?: string;
  concluded: boolean;
  financeComments?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceSnapshotData {
  enrichedRecords: Array<FinanceRecord & FinanceRecordStats>;
}

export interface FinanceSnapshot {
  id: string;
  year: number;
  month: number;
  title: string;
  totalIncomeMxn: number;
  totalExpenseMxn: number;
  balanceMxn: number;
  snapshotData?: FinanceSnapshotData;
  createdAt: string;
}

export interface CommissionBreakdownEntry {
  financeRecordId: string;
  clientName: string;
  clientNumber?: string;
  quoteNumber?: string;
  subject: string;
  group: "EXECUTION" | "CLIENT" | "CLOSING";
  baseNetMxn: number;
  amountMxn: number;
  highlighted?: boolean;
  highlightReason?: string;
}

export interface CommissionSnapshotFinanceRecord extends FinanceRecord, FinanceRecordStats {
  effectiveClientNumber?: string;
  highlighted: boolean;
  highlightReason?: string;
}

export interface CommissionSnapshotData {
  section: string;
  financeRecords: CommissionSnapshotFinanceRecord[];
  generalExpenses: GeneralExpense[];
  executionRecords: CommissionBreakdownEntry[];
  clientRecords: CommissionBreakdownEntry[];
  closingRecords: CommissionBreakdownEntry[];
  grossTotalMxn: number;
  deductionRate: number;
  deductionBaseMxn: number;
  deductionMxn: number;
  netTotalMxn: number;
  createdAt: string;
}

export interface CommissionSnapshot {
  id: string;
  year: number;
  month: number;
  section: string;
  title: string;
  totalNetMxn: number;
  snapshotData?: CommissionSnapshotData;
  createdAt: string;
}

export type GeneralExpenseTeam =
  | "Sin equipo"
  | "General"
  | "Litigio"
  | "Corporativo y laboral"
  | "Convenios"
  | "Der Financiero"
  | "Compliance Fiscal";

export type GeneralExpensePaymentMethod = "Transferencia" | "Efectivo";
export type GeneralExpenseBank = "Banamex" | "HSBC";

export interface GeneralExpense {
  id: string;
  year: number;
  month: number;
  detail: string;
  amountMxn: number;
  countsTowardLimit: boolean;
  team: GeneralExpenseTeam;
  generalExpense: boolean;
  expenseWithoutTeam: boolean;
  pctLitigation: number;
  pctCorporateLabor: number;
  pctSettlements: number;
  pctFinancialLaw: number;
  pctTaxCompliance: number;
  paymentMethod: GeneralExpensePaymentMethod;
  bank?: GeneralExpenseBank;
  recurring: boolean;
  approvedByEmrt: boolean;
  paidByEmrtAt?: string;
  reviewedByJnls: boolean;
  paid: boolean;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskState = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "MONTHLY_VIEW";
export type TaskMode = "STATUS" | "WORKFLOW";

export interface RecurrenceRule {
  kind:
    | "monthly_fixed_day"
    | "monthly_last_business_day"
    | "quarterly_fixed_day"
    | "yearly_last_business_day_of_month"
    | "cuatrimestral_last_business_day";
  day?: number;
  month?: number;
}

export interface TaskTrackDefinition {
  id: string;
  label: string;
  mode: TaskMode;
  recurring?: boolean;
  recurrenceRule?: RecurrenceRule;
}

export interface TaskModuleDefinition {
  id: string;
  team: Team;
  label: string;
  summary: string;
  tracks: TaskTrackDefinition[];
}

export interface TaskItem {
  id: string;
  moduleId: string;
  trackId: string;
  clientName: string;
  matterId?: string;
  matterNumber?: string;
  subject: string;
  responsible: string;
  dueDate: string;
  state: TaskState;
  recurring: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type LegacyTaskStatus = "pendiente" | "presentado" | "concluida";
export type LegacyTaskData = Record<string, unknown>;

export interface TaskTrackingRecord {
  id: string;
  moduleId: string;
  tableCode: string;
  sourceTable: string;
  matterId?: string;
  matterNumber?: string;
  clientNumber?: string;
  clientName: string;
  subject: string;
  specificProcess?: string;
  matterIdentifier?: string;
  taskName: string;
  eventName?: string;
  responsible: string;
  dueDate?: string;
  termDate?: string;
  completedAt?: string;
  status: LegacyTaskStatus;
  workflowStage: number;
  reportedMonth?: string;
  termId?: string;
  data: LegacyTaskData;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskTerm {
  id: string;
  moduleId: string;
  sourceTable?: string;
  sourceRecordId?: string;
  matterId?: string;
  matterNumber?: string;
  clientNumber?: string;
  clientName: string;
  subject: string;
  specificProcess?: string;
  matterIdentifier?: string;
  eventName: string;
  pendingTaskLabel?: string;
  responsible: string;
  dueDate?: string;
  termDate?: string;
  status: LegacyTaskStatus;
  recurring: boolean;
  reportedMonth?: string;
  verification: Record<string, string>;
  data: LegacyTaskData;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDistributionEvent {
  id: string;
  moduleId: string;
  name: string;
  targetTables: string[];
  defaultTaskName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDistributionHistory {
  id: string;
  moduleId: string;
  matterId?: string;
  matterNumber?: string;
  clientNumber?: string;
  clientName: string;
  subject: string;
  specificProcess?: string;
  matterIdentifier?: string;
  eventName: string;
  targetTables: string[];
  eventNamesPerTable: string[];
  createdIds: Record<string, string>;
  data: LegacyTaskData;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAdditionalTask {
  id: string;
  moduleId: string;
  task: string;
  responsible: string;
  responsible2?: string;
  dueDate?: string;
  status: LegacyTaskStatus;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  clients: number;
  quotes: number;
  leads: number;
  matters: number;
  pendingTasks: number;
}
