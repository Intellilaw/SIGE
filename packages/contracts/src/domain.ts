export type KnownTeam =
  | "ADMIN"
  | "CLIENT_RELATIONS"
  | "SALES"
  | "FINANCE"
  | "LITIGATION"
  | "CORPORATE_LABOR"
  | "SETTLEMENTS"
  | "FINANCIAL_LAW"
  | "TAX_COMPLIANCE"
  | "AUDIT"
  | "ADMIN_OPERATIONS";

export type Team = KnownTeam | (string & {});

export type SystemRole =
  | "SUPERADMIN"
  | "DIRECTOR"
  | "TEAM_LEAD"
  | "ANALYST"
  | "AUDITOR";

export type LegacyAccessRole = "SUPERADMIN" | "INTRANET" | "PUBLIC";

export const ORGANIZATION_SLUGS = {
  RUSCONI_CONSULTING: "rusconi-consulting",
  INTELLILAW: "intellilaw",
  LEGALFLOW: "legalflow"
} as const;

export type OrganizationSlug = typeof ORGANIZATION_SLUGS[keyof typeof ORGANIZATION_SLUGS];

export interface OrganizationProfile {
  id: string;
  slug: OrganizationSlug;
  name: string;
  isActive: boolean;
}

export const ORGANIZATION_PROFILES_BY_SLUG: Record<OrganizationSlug, OrganizationProfile> = {
  [ORGANIZATION_SLUGS.RUSCONI_CONSULTING]: {
    id: "org-rusconi",
    slug: ORGANIZATION_SLUGS.RUSCONI_CONSULTING,
    name: "Rusconi Consulting",
    isActive: true
  },
  [ORGANIZATION_SLUGS.INTELLILAW]: {
    id: "org-intellilaw",
    slug: ORGANIZATION_SLUGS.INTELLILAW,
    name: "Intellilaw",
    isActive: true
  },
  [ORGANIZATION_SLUGS.LEGALFLOW]: {
    id: "org-legalflow",
    slug: ORGANIZATION_SLUGS.LEGALFLOW,
    name: "LegalFlow",
    isActive: true
  }
};

export const ORGANIZATIONS: OrganizationProfile[] = [
  ORGANIZATION_PROFILES_BY_SLUG[ORGANIZATION_SLUGS.RUSCONI_CONSULTING],
  ORGANIZATION_PROFILES_BY_SLUG[ORGANIZATION_SLUGS.INTELLILAW],
  ORGANIZATION_PROFILES_BY_SLUG[ORGANIZATION_SLUGS.LEGALFLOW]
];

export const DEFAULT_ORGANIZATION_SLUG: OrganizationSlug = ORGANIZATION_SLUGS.RUSCONI_CONSULTING;

export function findOrganizationBySlug(slug?: string | null) {
  return ORGANIZATIONS.find((organization) => organization.slug === slug);
}

export function getDefaultOrganization() {
  return ORGANIZATIONS.find((organization) => organization.slug === DEFAULT_ORGANIZATION_SLUG) ?? ORGANIZATIONS[0];
}

export function getOrganizationAccessLabel(organization: OrganizationProfile) {
  return `Acceso ${organization.name}`;
}

export function getOrganizationUnavailableTitle(organization: OrganizationProfile) {
  return `El acceso de ${organization.name} estara disponible proximamente.`;
}

export interface AuthUser {
  id: string;
  organizationId: string;
  organizationSlug: OrganizationSlug;
  organizationName: string;
  email: string;
  username: string;
  displayName: string;
  shortName?: string;
  role: SystemRole;
  legacyRole: LegacyAccessRole;
  team?: Team;
  legacyTeam?: string;
  secondaryTeam?: Team;
  secondaryLegacyTeam?: string;
  specificRole?: string;
  secondarySpecificRole?: string;
  permissions: string[];
  isExternal: boolean;
  createLaborFile: boolean;
  isActive: boolean;
  passwordResetRequired: boolean;
}

export interface Client {
  id: string;
  clientNumber: string;
  name: string;
  createdAt: string;
}

export type InternalContractType = "PROFESSIONAL_SERVICES" | "LEGAL_POLICIES" | "LABOR";
export type InternalContractDocumentKind = "CONTRACT" | "ADDENDUM";
export type InternalContractDownloadFormat = "docx" | "pdf";
export type InternalContractSignatureStatus = "PENDING" | "SIGNED";
export type ProfessionalServicesContractClientKind = "PERSONA_FISICA" | "PERSONA_MORAL";
export type ProfessionalServicesContractLanguage = "ES" | "EN";

export interface InternalContractPaymentMilestone {
  id: string;
  label: string;
  dueDate?: string;
  amountMxn?: number;
  notes?: string;
}

export interface ProfessionalServicesContractFieldValues {
  language: ProfessionalServicesContractLanguage;
  clientKind: ProfessionalServicesContractClientKind;
  clientRfc: string;
  legalRepresentative: string;
  clientAddress: string;
  clientPhone: string;
  clientEmail: string;
  startDate: string;
  endDate: string;
  signingDate: string;
}

export interface ProfessionalServicesContractServiceLine {
  id: string;
  service: string;
  fees: string;
  observations: string;
  paymentMoment: string;
}

export interface InternalContract {
  id: string;
  contractNumber: string;
  title?: string;
  contractType: InternalContractType;
  documentKind: InternalContractDocumentKind;
  clientId?: string;
  clientNumber?: string;
  clientName?: string;
  collaboratorName?: string;
  originalFileName?: string;
  fileMimeType?: string;
  fileSizeBytes?: number;
  pdfOriginalFileName?: string;
  pdfFileMimeType?: string;
  pdfFileSizeBytes?: number;
  sourceMatterId?: string;
  sourceQuoteId?: string;
  signatureStatus?: InternalContractSignatureStatus;
  availableFormats: InternalContractDownloadFormat[];
  paymentMilestones: InternalContractPaymentMilestone[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfessionalServicesContractPrefillResult {
  contractId?: string;
  matterId: string;
  contractNumber: string;
  clientNumber?: string;
  clientName: string;
  quoteId?: string;
  quoteNumber?: string;
  subject: string;
  title: string;
  signatureStatus: InternalContractSignatureStatus;
  availableFormats: InternalContractDownloadFormat[];
  fields: ProfessionalServicesContractFieldValues;
  serviceLines: ProfessionalServicesContractServiceLine[];
  paymentMilestones: InternalContractPaymentMilestone[];
  totalMxn: number;
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
export type LaborEmploymentStatus = "ACTIVE" | "FORMER" | "ARCHIVED";

export type LaborFileDocumentType =
  | "EMPLOYMENT_CONTRACT"
  | "ADDENDUM"
  | "PROOF_OF_ADDRESS"
  | "TAX_STATUS_CERTIFICATE"
  | "CURP"
  | "IMSS_WEEKS_CERTIFICATE"
  | "BANK_ACCOUNT_STATEMENT"
  | "OFFICIAL_ID"
  | "CV"
  | "EDUCATION_PROOF"
  | "PROFESSIONAL_TITLE"
  | "PROFESSIONAL_LICENSE"
  | "EQUIPMENT_DELIVERY_FORMAT";

export type LaborFileDocumentRequirement = "ALWAYS" | "PROFESSIONAL_CREDENTIAL" | "OPTIONAL";

export interface LaborFileDocumentDefinition {
  type: LaborFileDocumentType;
  label: string;
  requirement: LaborFileDocumentRequirement;
  contractSection?: boolean;
  pdfOnly?: boolean;
  wordAllowed?: boolean;
  multiple?: boolean;
  maxFiles?: number;
}

export const LABOR_FILE_DOCUMENT_DEFINITIONS: LaborFileDocumentDefinition[] = [
  { type: "EMPLOYMENT_CONTRACT", label: "Contrato laboral", requirement: "ALWAYS", contractSection: true, wordAllowed: true },
  { type: "ADDENDUM", label: "Addendum", requirement: "OPTIONAL", contractSection: true, pdfOnly: true },
  { type: "PROOF_OF_ADDRESS", label: "Comprobante de domicilio", requirement: "ALWAYS" },
  { type: "TAX_STATUS_CERTIFICATE", label: "Constancia de situación fiscal", requirement: "ALWAYS" },
  { type: "CURP", label: "CURP", requirement: "ALWAYS" },
  { type: "IMSS_WEEKS_CERTIFICATE", label: "Constancia de semanas cotizadas IMSS", requirement: "ALWAYS", pdfOnly: true },
  { type: "BANK_ACCOUNT_STATEMENT", label: "Estado de cuenta con CLABE y número de cuenta", requirement: "ALWAYS" },
  { type: "OFFICIAL_ID", label: "Identificación oficial", requirement: "ALWAYS" },
  { type: "CV", label: "CV", requirement: "ALWAYS" },
  { type: "EDUCATION_PROOF", label: "Comprobante de estudios", requirement: "OPTIONAL" },
  { type: "PROFESSIONAL_TITLE", label: "Título profesional", requirement: "OPTIONAL" },
  { type: "PROFESSIONAL_LICENSE", label: "Cédula profesional", requirement: "OPTIONAL" },
  {
    type: "EQUIPMENT_DELIVERY_FORMAT",
    label: "Formato de entrega de equipo",
    requirement: "OPTIONAL",
    wordAllowed: true,
    multiple: true,
    maxFiles: 10
  }
];

export type LaborVacationEventType =
  | "PREVIOUS_YEAR_DEDUCTION"
  | "PREVIOUS_YEAR_PENDING"
  | "VACATION"
  | "GLOBAL_VACATION";

export interface LaborFileDocument {
  id: string;
  laborFileId: string;
  documentType: LaborFileDocumentType;
  originalFileName: string;
  fileMimeType?: string;
  fileSizeBytes?: number;
  riExtractedDailySalaryMxn?: number;
  riExtractedMonthlyGrossSalaryMxn?: number;
  riSalaryExtractionDetail?: string;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LaborVacationEvent {
  id: string;
  laborFileId: string;
  globalVacationDayId?: string;
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
  vacationDates: string[];
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LaborGlobalVacationBatchResult {
  day: LaborGlobalVacationDay;
  generatedFormats: number;
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
  attendanceBonus: string;
  attendanceBonusText: string;
  punctualityBonus: string;
  punctualityBonusText: string;
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
  overrideTeamVacationConflict?: boolean;
}

export interface LaborVacationSummary {
  hireDate: string;
  currentYearStartDate: string;
  previousYearStartDate: string;
  previousYearEndDate: string;
  yearBeforeLastStartDate: string;
  yearBeforeLastEndDate: string;
  completedYears: number;
  completedYearsLabel: string;
  entitlementDays: number;
  previousYearPendingDays: number;
  yearBeforeLastPendingDays: number;
  ignoredPreviousYearPendingDays: number;
  earnedDays: number;
  unearnedDays: number;
  scheduledDays: number;
  authorizedDays: number;
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
  personalPhone?: string;
  personalEmail?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactAddress?: string;
  team?: Team;
  legacyTeam?: string;
  specificRole?: string;
  status: LaborFileStatus;
  employmentStatus: LaborEmploymentStatus;
  hireDate: string;
  dailySalaryMxn?: number;
  advanceVacationDaysPaidBalance: number;
  advanceVacationDaysPaidCutoffDate?: string;
  advanceVacationDaysPaidPrevious: number;
  advanceVacationDaysPaidCurrent: number;
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
  dailySalaryMxn?: number | null;
  personalPhone?: string | null;
  personalEmail?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactAddress?: string | null;
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
  globalVacationDayId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  vacationDates?: string[];
  days?: number;
  description?: string | null;
  acceptanceOriginalFileName?: string | null;
  acceptanceFileMimeType?: string | null;
  acceptanceFileBase64?: string | null;
}

export interface LaborPreviousYearPendingVacationInput {
  days: number;
  description?: string | null;
  manualOverrideConfirmed?: boolean;
  pendingPeriod?: "LAST_YEAR" | "YEAR_BEFORE_LAST";
}

export interface LaborGlobalVacationDayInput {
  date: string;
  days?: number;
  vacationDates?: string[];
  description?: string | null;
}

export type DailyDocumentTemplateId =
  | "general-power-letter"
  | "labor-power-letter"
  | "money-receipt"
  | "rc-received-document-receipt"
  | "rc-delivered-document-receipt"
  | "property-delivery-receipt"
  | "promissory-note";

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
  { shortName: "FGJCDMX", name: "Fiscal\u00eda General de Justicia de la CDMX" },
  { shortName: "FGR", name: "Fiscal\u00eda General de la Rep\u00fablica" },
  { shortName: "TFCyA", name: "Tribunal Federal de Conciliaci\u00f3n y Arbitraje" },
  { shortName: "JLCyA", name: "Junta Local de Conciliaci\u00f3n y Arbitraje" },
  { shortName: "SAT", name: "Sistema de Administraci\u00f3n Tributaria" },
  { shortName: "APF", name: "Administraci\u00f3n P\u00fablica Federal" },
  { shortName: "APCDMX", name: "Administraci\u00f3n P\u00fablica de la Ciudad de M\u00e9xico" },
  { shortName: "EMPRESA", name: "Toda la empresa" }
] as const;

export type HolidayAuthorityShortName = typeof HOLIDAY_AUTHORITIES[number]["shortName"];
export type HolidaySource = "MANUAL" | "WEEKEND" | "LFT_OFFICIAL";

export const EXECUTION_HOLIDAY_AUTHORITIES = [
  "PJF",
  "TSJCDMX",
  "PJEdoMex",
  "TFJA",
  "TJACDMX",
  "FGJCDMX",
  "FGR",
  "TFCyA",
  "JLCyA",
  "SAT",
  "APF",
  "APCDMX"
] as const;

export type ExecutionHolidayAuthorityShortName = typeof EXECUTION_HOLIDAY_AUTHORITIES[number];

export const MATTER_PROMOTION_COMMANDS = [
  "/promociongeneral",
  "/promocioncivil",
  "/promocionadministrativa",
  "/promocionamparo",
  "/promocionpenal"
] as const;

export type MatterPromotionCommand = typeof MATTER_PROMOTION_COMMANDS[number];

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
  title: string;
  quoteNumber: string;
  clientId: string;
  clientName: string;
  recipientName?: string;
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

function normalizeQuoteTitleText(value?: string | null, fallback = "") {
  return (value ?? "").trim().replace(/\s+/g, " ") || fallback;
}

export function buildQuoteTitle(input: {
  clientName?: string | null;
  quoteNumber?: string | null;
  subject?: string | null;
}) {
  const clientName = normalizeQuoteTitleText(input.clientName, "Cliente sin nombre");
  const quoteNumber = normalizeQuoteTitleText(input.quoteNumber, "Sin numero");
  const subject = normalizeQuoteTitleText(input.subject, "Sin asunto");

  return `${clientName} (${quoteNumber}) (${subject})`;
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
  expirationDate?: string;
  expirationRiOutput?: string;
  promotionCommand?: MatterPromotionCommand;
  holidayAuthorityShortName?: ExecutionHolidayAuthorityShortName;
  internalTelegramGroupId?: string;
  internalTelegramGroupName?: string;
  nextAction?: string;
  nextActionDueAt?: string;
  nextActionSource?: string;
  visibility: string;
  milestone?: string;
  concluded: boolean;
  stage: MatterStage;
  origin: "MANUAL" | "LEAD" | "QUOTE";
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  executionSubmatters?: ExecutionSubmatter[];
}

export interface ExecutionSubmatter {
  id: string;
  matterId: string;
  sortOrder: number;
  specificProcess?: string;
  matterIdentifier?: string;
  communicationChannel: Lead["communicationChannel"];
  executionPrompt?: string;
  expirationDate?: string;
  expirationRiOutput?: string;
  promotionCommand?: MatterPromotionCommand;
  holidayAuthorityShortName?: ExecutionHolidayAuthorityShortName;
  internalTelegramGroupId?: string;
  internalTelegramGroupName?: string;
  milestone?: string;
  concluded: boolean;
  notes?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
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
  "Ventas",
  "Comunicacion con cliente",
  "Finanzas",
  "Emilio Petith",
  "Joaquín Pani",
  "Edgar Ortuño"
] as const;

export type CommissionSection = typeof COMMISSION_SECTIONS[number];

export interface FinanceRecordStats {
  totalPaidMxn: number;
  totalExpensesMxn: number;
  netFeesMxn: number;
  remainingMxn: number;
  dueTodayMxn: number;
  futurePaymentsMxn: number;
  totalNetDueMxn: number;
  feeBreakdownDifferenceMxn: number;
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
  salesCommissionMxn: number;
  netProfitMxn: number;
}

export type FinancePaymentMethod = "blank" | "T" | "E";
export type FinanceDelinquencyStatus =
  | "CURRENT"
  | "DAYS_1_TO_10"
  | "MORE_THAN_10"
  | "MORE_THAN_20"
  | "MORE_THAN_30";

export interface FinanceRecord {
  id: string;
  year: number;
  month: number;
  clientNumber?: string;
  clientName: string;
  quoteNumber?: string;
  matterType: QuoteType;
  periodYear?: number;
  periodMonth?: number;
  subject: string;
  contractSignedStatus: ContractSignedStatus;
  responsibleTeam?: Team;
  totalMatterMxn: number;
  workingConcepts?: string;
  conceptFeesMxn: number;
  previousPaymentsMxn: number;
  nextPaymentDate?: string;
  nextPaymentNotes?: string;
  delinquencyStatus: FinanceDelinquencyStatus;
  paidThisMonthMxn: number;
  payment2Mxn: number;
  payment3Mxn: number;
  paymentDate1?: string;
  paymentDate2?: string;
  paymentDate3?: string;
  paymentMethod: FinancePaymentMethod;
  paymentMethod2: FinancePaymentMethod;
  paymentMethod3: FinancePaymentMethod;
  paymentReceived: boolean;
  paymentReceived2: boolean;
  paymentReceived3: boolean;
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
  highCollectionProbability: boolean;
  lowCollectionProbability: boolean;
  salesCommissionMxn: number;
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
  teamKey?: Team;
  teamLabel?: string;
  excluded?: boolean;
  highlighted?: boolean;
  highlightReason?: string;
}

export interface CommissionGroup1TeamBreakdown {
  teamKey: Team;
  teamLabel: string;
  grossMxn: number;
  deductionBaseMxn: number;
  deductionMxn: number;
  netMxn: number;
  payableMxn: number;
}

export interface CommissionExclusion {
  id: string;
  year: number;
  month: number;
  section: string;
  group: CommissionBreakdownEntry["group"];
  financeRecordId: string;
  createdByUserId?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
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
  group1TeamBreakdowns?: CommissionGroup1TeamBreakdown[];
  group1GrossMxn?: number;
  group1NetMxn?: number;
  group1PayableMxn?: number;
  group2TotalMxn?: number;
  group3TotalMxn?: number;
  totalCommissionsMxn?: number;
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
  sourceType: "tracking-record" | "term" | "matter";
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
  dailyBreakdown: KpiDailyMetric[];
}

export interface KpiDailyMetric {
  date: string;
  status: KpiMetricStatus;
  value: number;
  target: number;
  unit: string;
  actualLabel: string;
  targetLabel: string;
  helper: string;
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
  hasVat: boolean;
  recurring: boolean;
  approvedByEmrt: boolean;
  paidByEmrtAt?: string;
  emrtReimbursementPending: boolean;
  reviewedByJnls: boolean;
  paid: boolean;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeneralExpenseEmrtDailyAcknowledgement {
  id: string;
  year: number;
  month: number;
  paidByEmrtDate: string;
  totalMxn: number;
  summaryMessage: string;
  expenseIds: string[];
  snapshotHash: string;
  receivedByAle: boolean;
  receivedByAleAt?: string;
  paidByEmrt: boolean;
  paidByEmrtAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type GeneralExpensePayrollHalf = 1 | 2;

export interface GeneralExpensePayrollEntry {
  id: string;
  year: number;
  month: number;
  half: GeneralExpensePayrollHalf;
  laborFileId?: string;
  employeeName: string;
  isPartTime: boolean;
  dailySalaryMxn: number;
  laborFileDailySalaryMxn?: number;
  dailySalaryRiVerified?: boolean;
  dailySalaryRiVerificationDetail?: string;
  grossSalaryMxn: number;
  punctualityBonusMxn: number;
  attendanceBonusMxn: number;
  punctualityBonusExcluded: boolean;
  attendanceBonusExcluded: boolean;
  advanceVacationDays: number;
  advanceVacationPremiumPaymentDate?: string;
  advanceVacationDaysPaid: boolean;
  advanceVacationDaysPaymentEligible: boolean;
  vacationDaysPaidPreviousPeriods: number;
  vacationDaysPaidCurrentPeriod: number;
  vacationDays: number;
  vacationPremiumMxn: number;
  absenceDays: number;
  absenceDiscountMxn: number;
  netSalaryMxn: number;
  overtimeHourlyRateMxn: number;
  overtimeHours: number;
  overtimeTotalMxn: number;
  overtimeDetail: string;
  isrWithholdingMxn: number;
  imssWithholdingMxn: number;
  employmentSubsidyMxn: number;
  infonavitCreditMxn: number;
  netDepositMxn: number;
  payrollStampedByAraceli: boolean;
  finalPaymentApprovedByEmrt: boolean;
  reviewedByJnls: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GeneralExpensePayrollEmployeeOption {
  laborFileId: string;
  employeeName: string;
  dailySalaryMxn: number;
  dailySalaryRiVerified?: boolean;
  dailySalaryRiVerificationDetail?: string;
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

export interface BudgetPlanExpenseBreakdownItem {
  id: string;
  year: number;
  month: number;
  concept: string;
  amountMxn: number;
  sortOrder: number;
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

export type AccountingAccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "COST" | "EXPENSE";
export type AccountingAccountNature = "DEBIT" | "CREDIT";
export type AccountingPeriodStatus = "OPEN" | "REVIEWED" | "SAT_EXPORTED";
export type AccountingEntryType = "OPENING" | "MANUAL" | "FINANCE_INCOME" | "FINANCE_PAYMENT" | "GENERAL_EXPENSE" | "CFDI" | "ADJUSTMENT";
export type AccountingEntryStatus = "DRAFT" | "POSTED" | "ERROR";
export type AccountingCfdiStatus = "UPLOADED" | "LINKED" | "POSTED" | "DUPLICATE" | "ERROR";
export type AccountingRuleType =
  | "FINANCE_INCOME"
  | "FINANCE_PAYMENT"
  | "GENERAL_EXPENSE"
  | "GENERAL_EXPENSE_TEAM"
  | "BANK"
  | "IVA"
  | "DEFAULT";

export interface AccountingAccount {
  id: string;
  code: string;
  name: string;
  type: AccountingAccountType;
  subtype?: string;
  satGroupingCode?: string;
  parentId?: string;
  level: number;
  nature: AccountingAccountNature;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingPeriod {
  id: string;
  year: number;
  month: number;
  status: AccountingPeriodStatus;
  exportedAt?: string;
  requiresRegeneration: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingCfdiDocument {
  id: string;
  uuid: string;
  version?: string;
  type: string;
  issuerRfc: string;
  issuerName?: string;
  receiverRfc: string;
  receiverName?: string;
  issueDate?: string;
  certificationDate?: string;
  subtotalMxn: number;
  discountMxn: number;
  taxMxn: number;
  totalMxn: number;
  currency: string;
  paymentMethod?: string;
  paymentForm?: string;
  usage?: string;
  status: AccountingCfdiStatus;
  linkedSourceType?: string;
  linkedSourceId?: string;
  originalFileName: string;
  parsedData?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingJournalLine {
  id: string;
  entryId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string;
  debitMxn: number;
  creditMxn: number;
  sourceType?: string;
  sourceId?: string;
  createdAt: string;
}

export interface AccountingJournalEntry {
  id: string;
  year: number;
  month: number;
  entryDate: string;
  number: string;
  entryType: AccountingEntryType;
  status: AccountingEntryStatus;
  description: string;
  sourceType?: string;
  sourceId?: string;
  sourceFingerprint?: string;
  cfdiDocumentId?: string;
  createdByUserId?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  lines: AccountingJournalLine[];
  totalDebitMxn: number;
  totalCreditMxn: number;
  balanced: boolean;
}

export interface AccountingRule {
  id: string;
  ruleType: AccountingRuleType;
  sourceKey: string;
  accountId: string;
  taxAccountId?: string;
  cashAccountId?: string;
  counterAccountId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingSettings {
  companyRfc?: string;
  legalName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingSettingsInput {
  companyRfc?: string | null;
  legalName?: string | null;
}

export interface AccountingTrialBalanceLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountingAccountType;
  openingDebitMxn: number;
  openingCreditMxn: number;
  periodDebitMxn: number;
  periodCreditMxn: number;
  endingDebitMxn: number;
  endingCreditMxn: number;
}

export interface AccountingFinancialStatementLine {
  accountType: AccountingAccountType;
  accountId: string;
  accountCode: string;
  accountName: string;
  amountMxn: number;
}

export interface AccountingAuxiliaryLine {
  entryId: string;
  entryDate: string;
  number: string;
  description: string;
  debitMxn: number;
  creditMxn: number;
  balanceMxn: number;
}

export interface AccountingPendingItem {
  id: string;
  sourceType: string;
  sourceId?: string;
  label: string;
  detail: string;
  severity: "INFO" | "WARNING" | "ERROR";
}

export interface AccountingOverview {
  period: AccountingPeriod;
  settings: AccountingSettings;
  accounts: AccountingAccount[];
  entries: AccountingJournalEntry[];
  cfdiDocuments: AccountingCfdiDocument[];
  trialBalance: AccountingTrialBalanceLine[];
  balanceSheet: AccountingFinancialStatementLine[];
  incomeStatement: AccountingFinancialStatementLine[];
  pendingItems: AccountingPendingItem[];
  totals: {
    assetsMxn: number;
    liabilitiesMxn: number;
    equityMxn: number;
    incomeMxn: number;
    costsMxn: number;
    expensesMxn: number;
    netIncomeMxn: number;
    trialBalanceDebitMxn: number;
    trialBalanceCreditMxn: number;
  };
}

export interface AccountingCreateAccountInput {
  code: string;
  name: string;
  type: AccountingAccountType;
  subtype?: string | null;
  satGroupingCode?: string | null;
  parentId?: string | null;
  nature?: AccountingAccountNature;
}

export interface AccountingJournalLineInput {
  accountId: string;
  description?: string | null;
  debitMxn?: number | null;
  creditMxn?: number | null;
}

export interface AccountingJournalEntryInput {
  year: number;
  month: number;
  entryDate: string;
  entryType?: AccountingEntryType;
  description?: string | null;
  lines: AccountingJournalLineInput[];
}

export interface AccountingInitialBalanceInput {
  year: number;
  accountId: string;
  debitMxn?: number | null;
  creditMxn?: number | null;
  description?: string | null;
}

export interface AccountingCfdiUploadInput {
  originalFileName: string;
  xmlBase64: string;
}

export interface AccountingCfdiUploadResult {
  imported: AccountingCfdiDocument[];
  duplicates: AccountingCfdiDocument[];
  errors: Array<{ originalFileName: string; message: string }>;
}

export interface AccountingAutomationResult {
  created: AccountingJournalEntry[];
  skipped: AccountingPendingItem[];
}

export interface AccountingXmlExportResult {
  fileName: string;
  content: string;
  format: "CATALOGO" | "BALANZA" | "POLIZAS" | "AUXILIAR_CUENTAS" | "AUXILIAR_FOLIOS";
  generatedAt: string;
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

export interface TaskModuleMember {
  id: string;
  userId: string;
  name: string;
  aliases: string[];
  shortName?: string;
  specificRole?: string;
}

export interface TaskModuleDefinition {
  id: string;
  team: Team;
  label: string;
  summary: string;
  tracks: TaskTrackDefinition[];
  isActive?: boolean;
  members?: TaskModuleMember[];
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

export interface SystemModuleSetting {
  organizationId: string;
  moduleId: string;
  isEnabled: boolean;
  updatedByUserId?: string;
  updatedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SystemModuleSettingsResponse {
  settings: SystemModuleSetting[];
}
