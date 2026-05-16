export type Team =
  | "ADMIN"
  | "CLIENT_RELATIONS"
  | "FINANCE"
  | "LITIGATION"
  | "CORPORATE_LABOR"
  | "SETTLEMENTS"
  | "FINANCIAL_LAW"
  | "TAX_COMPLIANCE"
  | "AUDIT"
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

export type InternalContractType = "PROFESSIONAL_SERVICES" | "LABOR";
export type InternalContractDocumentKind = "CONTRACT" | "ADDENDUM";

export interface InternalContractPaymentMilestone {
  id: string;
  label: string;
  dueDate?: string;
  amountMxn?: number;
  notes?: string;
}

export interface InternalContract {
  id: string;
  contractNumber: string;
  contractType: InternalContractType;
  documentKind: InternalContractDocumentKind;
  clientId?: string;
  clientNumber?: string;
  clientName?: string;
  collaboratorName?: string;
  originalFileName?: string;
  fileMimeType?: string;
  fileSizeBytes?: number;
  paymentMilestones: InternalContractPaymentMilestone[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InternalContractTemplate {
  id: string;
  title: string;
  originalFileName: string;
  fileMimeType?: string;
  fileSizeBytes?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InternalContractCollaborator {
  id: string;
  name: string;
  shortName?: string;
  team?: Team;
}

export type LaborFileStatus = "INCOMPLETE" | "COMPLETE";
export type LaborEmploymentStatus = "ACTIVE" | "FORMER";

export type LaborFileDocumentType =
  | "EMPLOYMENT_CONTRACT"
  | "ADDENDUM"
  | "PROOF_OF_ADDRESS"
  | "TAX_STATUS_CERTIFICATE"
  | "OFFICIAL_ID"
  | "CV"
  | "PROFESSIONAL_TITLE"
  | "PROFESSIONAL_LICENSE";

export type LaborFileDocumentRequirement = "ALWAYS" | "PROFESSIONAL_CREDENTIAL" | "OPTIONAL";

export interface LaborFileDocumentDefinition {
  type: LaborFileDocumentType;
  label: string;
  requirement: LaborFileDocumentRequirement;
  contractSection?: boolean;
  pdfOnly?: boolean;
  wordAllowed?: boolean;
}

export const LABOR_FILE_DOCUMENT_DEFINITIONS: LaborFileDocumentDefinition[] = [
  { type: "EMPLOYMENT_CONTRACT", label: "Contrato laboral", requirement: "ALWAYS", contractSection: true, wordAllowed: true },
  { type: "ADDENDUM", label: "Addendum", requirement: "OPTIONAL", contractSection: true, pdfOnly: true },
  { type: "PROOF_OF_ADDRESS", label: "Comprobante de domicilio", requirement: "ALWAYS" },
  { type: "TAX_STATUS_CERTIFICATE", label: "Constancia de situación fiscal", requirement: "ALWAYS" },
  { type: "OFFICIAL_ID", label: "Identificación oficial", requirement: "ALWAYS" },
  { type: "CV", label: "CV", requirement: "ALWAYS" },
  { type: "PROFESSIONAL_TITLE", label: "Título profesional", requirement: "PROFESSIONAL_CREDENTIAL" },
  { type: "PROFESSIONAL_LICENSE", label: "Cédula profesional", requirement: "PROFESSIONAL_CREDENTIAL" }
];

export type LaborVacationEventType = "PREVIOUS_YEAR_DEDUCTION" | "VACATION";

export interface LaborFileDocument {
  id: string;
  laborFileId: string;
  documentType: LaborFileDocumentType;
  originalFileName: string;
  fileMimeType?: string;
  fileSizeBytes?: number;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LaborVacationEvent {
  id: string;
  laborFileId: string;
  eventType: LaborVacationEventType;
  startDate?: string;
  endDate?: string;
  vacationDates?: string[];
  days: number;
  description?: string;
  acceptanceOriginalFileName?: string;
  acceptanceFileMimeType?: string;
  acceptanceFileSizeBytes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LaborGlobalVacationDay {
  id: string;
  date: string;
  days: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LaborContractFieldValues {
  employeeName: string;
  rfc: string;
  curp: string;
  employeeAddress: string;
  employeePhone: string;
  position: string;
  originalContractDate: string;
  workdayStart: string;
  workdayEnd: string;
  monthlyGrossSalary: string;
  monthlyGrossSalaryText: string;
  biweeklyGrossSalary: string;
  biweeklyGrossSalaryText: string;
  signingDate: string;
  signingCity: string;
}

export interface LaborContractPrefillSource {
  field: keyof LaborContractFieldValues;
  documentType?: LaborFileDocumentType;
  originalFileName?: string;
  confidence?: "LOW" | "MEDIUM" | "HIGH";
}

export interface LaborContractPrefillResult {
  fields: LaborContractFieldValues;
  sources: LaborContractPrefillSource[];
  notes: string[];
}

export interface LaborVacationFormatFieldValues {
  employeeName: string;
  requestDate: string;
  vacationDates: string[];
  vacationDays: number;
  enjoymentText: string;
  interestedName: string;
  authorizerName: string;
  hireDate: string;
  vacationYearStartDate: string;
  completedYearsLabel: string;
  entitlementDays: number;
  pendingDays: number;
  enjoyedDays: number;
  description: string;
}

export interface LaborVacationSummary {
  hireDate: string;
  currentYearStartDate: string;
  completedYears: number;
  completedYearsLabel: string;
  entitlementDays: number;
  usedDays: number;
  remainingDays: number;
  lines: string[];
}

export interface LaborFile {
  id: string;
  userId?: string;
  employeeName: string;
  employeeEmail?: string;
  employeeUsername: string;
  employeeShortName?: string;
  team?: Team;
  legacyTeam?: string;
  specificRole?: string;
  status: LaborFileStatus;
  employmentStatus: LaborEmploymentStatus;
  hireDate: string;
  employmentEndedAt?: string;
  notes?: string;
  documents: LaborFileDocument[];
  vacationEvents: LaborVacationEvent[];
  globalVacationDays: LaborGlobalVacationDay[];
  vacationSummary: LaborVacationSummary;
  createdAt: string;
  updatedAt: string;
}

export interface LaborFileUpdateInput {
  hireDate?: string;
  notes?: string | null;
}

export interface LaborFileDocumentUploadInput {
  documentType: LaborFileDocumentType;
  originalFileName: string;
  fileMimeType?: string | null;
  fileBase64: string;
}

export interface LaborVacationEventInput {
  eventType: LaborVacationEventType;
  startDate?: string | null;
  endDate?: string | null;
  vacationDates?: string[];
  days?: number;
  description?: string | null;
  acceptanceOriginalFileName?: string | null;
  acceptanceFileMimeType?: string | null;
  acceptanceFileBase64?: string | null;
}

export interface LaborGlobalVacationDayInput {
  date: string;
  days?: number;
  description?: string | null;
}

export type DailyDocumentTemplateId =
  | "general-power-letter"
  | "labor-power-letter"
  | "money-receipt"
  | "rc-received-document-receipt"
  | "rc-delivered-document-receipt"
  | "property-delivery-receipt";

export interface DailyDocumentAssignment {
  id: string;
  templateId: DailyDocumentTemplateId;
  templateTitle: string;
  title: string;
  clientId: string;
  clientNumber: string;
  clientName: string;
  values: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export const HOLIDAY_AUTHORITIES = [
  { shortName: "PJF", name: "Poder Judicial de la Federaci\u00f3n" },
  { shortName: "TSJCDMX", name: "Tribunal Superior de Justicia de la Ciudad de M\u00e9xico" },
  { shortName: "PJEdoMex", name: "Poder Judicial del Estado de M\u00e9xico" },
  { shortName: "TFJA", name: "Tribunal Federal de Justicia Administrativa" },
  { shortName: "TJACDMX", name: "Tribunal de Justicia Administrativa de la Ciudad de M\u00e9xico" },
  { shortName: "SAT", name: "Sistema de Administraci\u00f3n Tributaria" },
  { shortName: "APF", name: "Administraci\u00f3n P\u00fablica Federal" },
  { shortName: "APCDMX", name: "Administraci\u00f3n P\u00fablica de la Ciudad de M\u00e9xico" },
  { shortName: "EMPRESA", name: "Toda la empresa" }
] as const;

export type HolidayAuthorityShortName = typeof HOLIDAY_AUTHORITIES[number]["shortName"];
export type HolidaySource = "MANUAL" | "WEEKEND" | "LFT_OFFICIAL";

export const EXECUTION_HOLIDAY_AUTHORITIES = [
  "PJF",
  "PJCDMX",
  "PJEdoMex",
  "TFJA",
  "TJACDMX",
  "SAT",
  "APF",
  "APCDMX"
] as const;

export type ExecutionHolidayAuthorityShortName = typeof EXECUTION_HOLIDAY_AUTHORITIES[number];

export interface HolidayAuthority {
  shortName: HolidayAuthorityShortName;
  name: string;
}

export interface Holiday {
  id: string;
  date: string;
  authorityShortName: HolidayAuthorityShortName;
  authorityName: string;
  label: string;
  source: HolidaySource;
  automatic: boolean;
  createdAt: string;
  updatedAt: string;
}

export function isHolidayAuthorityShortName(value: string): value is HolidayAuthorityShortName {
  return HOLIDAY_AUTHORITIES.some((authority) => authority.shortName === value);
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
  excludeFromIva?: boolean;
  amountCells: QuoteTemplateCell[];
  paymentMoment: QuoteTemplateCell;
  notesCell: QuoteTemplateCell;
}

export type QuoteStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED";
export type QuoteType = "ONE_TIME" | "RETAINER";
export type QuoteLanguage = "es" | "en";

export interface Quote {
  id: string;
  quoteNumber: string;
  clientId: string;
  clientName: string;
  responsibleTeam?: Team;
  subject: string;
  status: QuoteStatus;
  quoteType: QuoteType;
  language: QuoteLanguage;
  quoteDate?: string;
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
  holidayAuthorityShortName?: ExecutionHolidayAuthorityShortName;
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

export type KpiMetricKind = "production" | "deadline";
export type KpiMetricStatus = "met" | "warning" | "missed" | "not-configured";

export interface KpiIncident {
  id: string;
  sourceType: "tracking-record" | "term";
  moduleId: string;
  tableCode?: string;
  tableLabel: string;
  clientName: string;
  subject: string;
  matterIdentifier?: string;
  taskName: string;
  responsible: string;
  dueDate?: string;
  termDate?: string;
  completedAt?: string;
  status: LegacyTaskStatus;
  reason: string;
}

export interface KpiMetric {
  id: string;
  label: string;
  description: string;
  kind: KpiMetricKind;
  status: KpiMetricStatus;
  value: number;
  target: number;
  unit: string;
  progressPct: number;
  targetLabel: string;
  actualLabel: string;
  helper: string;
  sourceDescription: string;
  sourceTables: string[];
  incidents: KpiIncident[];
}

export interface KpiUserSummary {
  userId: string;
  username: string;
  displayName: string;
  shortName?: string;
  team?: Team;
  teamLabel: string;
  specificRole?: string;
  configured: boolean;
  metrics: KpiMetric[];
}

export interface KpiTeamSummary {
  teamKey: string;
  teamLabel: string;
  users: KpiUserSummary[];
  configuredMetricsCount: number;
  missedMetricsCount: number;
}

export interface KpiOverview {
  year: number;
  month: number;
  generatedAt: string;
  cutoffDate: string;
  businessDaysInPeriod: number;
  businessDaysElapsed: number;
  sourceNote: string;
  teams: KpiTeamSummary[];
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

export interface BudgetPlan {
  id: string;
  year: number;
  month: number;
  expectedIncomeMxn: number;
  expectedExpenseMxn: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetPlanSnapshot {
  id: string;
  year: number;
  month: number;
  expectedIncomeMxn: number;
  expectedExpenseMxn: number;
  actualIncomeMxn: number;
  actualExpenseMxn: number;
  expectedResultMxn: number;
  actualResultMxn: number;
  financeRecordCount: number;
  generalExpenseCount: number;
  notes?: string;
  createdAt: string;
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
  recurring: boolean;
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
