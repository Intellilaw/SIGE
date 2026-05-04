import type {
  AuthUser,
  BudgetPlan,
  BudgetPlanSnapshot,
  Client,
  CommissionReceiver,
  CommissionSnapshot,
  CreateManagedUserInput,
  DailyDocumentAssignment,
  DailyDocumentTemplateId,
  DashboardSummary,
  FinanceRecord,
  FinanceSnapshot,
  GeneralExpense,
  InternalContract,
  InternalContractCollaborator,
  Lead,
  ManagedUser,
  Matter,
  Quote,
  QuoteTemplate,
  TaskAdditionalTask,
  TaskDistributionEvent,
  TaskDistributionHistory,
  TaskItem,
  TaskTerm,
  TaskTrackingRecord,
  TaskModuleDefinition,
  UpdateManagedUserInput
} from "@sige/contracts";

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  purpose: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface StoredUser extends AuthUser {
  passwordHash: string;
}

export interface CreateManagedUserRecord {
  email: string;
  username: string;
  displayName?: string;
  shortName?: string;
  role: AuthUser["role"];
  legacyRole: AuthUser["legacyRole"];
  team?: AuthUser["team"] | null;
  legacyTeam?: string;
  specificRole?: string;
  permissions: string[];
  passwordHash: string;
}

export interface UpdateManagedUserRecord {
  displayName?: string;
  passwordHash?: string;
  shortName?: string | null;
  role?: AuthUser["role"];
  legacyRole?: AuthUser["legacyRole"];
  team?: AuthUser["team"] | null;
  legacyTeam?: string | null;
  specificRole?: string | null;
  permissions?: string[];
  isActive?: boolean;
  passwordResetRequired?: boolean;
  emailConfirmedAt?: string | null;
}

export interface AuthRepository {
  findStoredUserByIdentifier(identifier: string): Promise<StoredUser | null>;
  findUserById(userId: string): Promise<AuthUser | null>;
  updateLastLoginAt(userId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string, options?: {
    emailConfirmedAt?: string;
    passwordResetRequired?: boolean;
  }): Promise<void>;
  saveRefreshToken(record: RefreshTokenRecord): Promise<void>;
  revokeRefreshToken(tokenHash: string): Promise<void>;
  revokeRefreshTokensForUser(userId: string): Promise<void>;
  findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>;
  savePasswordResetToken(record: PasswordResetTokenRecord): Promise<void>;
  revokeActivePasswordResetTokensForUser(userId: string): Promise<void>;
  findPasswordResetToken(tokenHash: string): Promise<PasswordResetTokenRecord | null>;
  consumePasswordResetToken(tokenHash: string): Promise<void>;
}

export interface ClientsRepository {
  list(): Promise<Client[]>;
  create(name: string): Promise<Client>;
  update(clientId: string, name: string): Promise<Client>;
  delete(clientId: string): Promise<void>;
}

export interface InternalContractWriteRecord {
  contractNumber: string;
  contractType: InternalContract["contractType"];
  documentKind: InternalContract["documentKind"];
  clientId?: string | null;
  collaboratorName?: string | null;
  paymentMilestones: InternalContract["paymentMilestones"];
  notes?: string | null;
  originalFileName?: string | null;
  fileMimeType?: string | null;
  fileSizeBytes?: number | null;
  fileContent?: Buffer | null;
}

export interface InternalContractDocumentRecord {
  contractNumber: string;
  originalFileName: string;
  fileMimeType?: string | null;
  fileContent: Buffer;
}

export interface InternalContractsRepository {
  list(): Promise<InternalContract[]>;
  create(payload: InternalContractWriteRecord): Promise<InternalContract>;
  delete(contractId: string): Promise<void>;
  findDocument(contractId: string): Promise<InternalContractDocumentRecord | null>;
  listCollaborators(): Promise<InternalContractCollaborator[]>;
}

export interface DailyDocumentAssignmentWriteRecord {
  templateId: DailyDocumentTemplateId;
  templateTitle: string;
  title: string;
  clientId: string;
  values: Record<string, string>;
}

export interface DailyDocumentsRepository {
  list(): Promise<DailyDocumentAssignment[]>;
  create(payload: DailyDocumentAssignmentWriteRecord): Promise<DailyDocumentAssignment>;
  update(documentId: string, payload: DailyDocumentAssignmentWriteRecord): Promise<DailyDocumentAssignment>;
  delete(documentId: string): Promise<void>;
}

export interface QuotesRepository {
  list(): Promise<Quote[]>;
  findById(quoteId: string): Promise<Quote | null>;
  listTemplates(): Promise<QuoteTemplate[]>;
  create(payload: QuoteWriteRecord): Promise<Quote>;
  update(quoteId: string, payload: QuoteWriteRecord): Promise<Quote>;
  delete(quoteId: string): Promise<void>;
  createTemplate(payload: QuoteTemplateWriteRecord): Promise<QuoteTemplate>;
  updateTemplate(templateId: string, payload: QuoteTemplateWriteRecord): Promise<QuoteTemplate>;
  deleteTemplate(templateId: string): Promise<void>;
}

export interface QuoteWriteRecord {
  clientId: string;
  clientName: string;
  responsibleTeam?: Quote["responsibleTeam"] | null;
  subject: string;
  status: Quote["status"];
  quoteType: Quote["quoteType"];
  language?: Quote["language"];
  quoteDate?: string;
  amountColumns?: Quote["amountColumns"];
  tableRows?: Quote["tableRows"];
  lineItems: Quote["lineItems"];
  milestone?: string;
  notes?: string;
}

export interface QuoteTemplateWriteRecord {
  team: QuoteTemplate["team"];
  services: QuoteTemplate["services"];
  quoteType: QuoteTemplate["quoteType"];
  amountColumns: QuoteTemplate["amountColumns"];
  tableRows: QuoteTemplate["tableRows"];
  milestone?: string;
  notes?: string;
}

export interface LeadUpdateRecord {
  clientId?: string | null;
  clientName?: string;
  prospectName?: string | null;
  commissionAssignee?: string | null;
  quoteId?: string | null;
  quoteNumber?: string | null;
  subject?: string;
  amountMxn?: number;
  communicationChannel?: Lead["communicationChannel"];
  lastInteractionLabel?: string | null;
  lastInteraction?: string | null;
  nextInteractionLabel?: string | null;
  nextInteraction?: string | null;
  notes?: string | null;
  sentToClientAt?: string | null;
  sentToMattersAt?: string | null;
  hiddenFromTracking?: boolean;
  status?: Lead["status"];
}

export interface LeadsRepository {
  list(): Promise<Lead[]>;
  listHistory(): Promise<Lead[]>;
  listMonthly(year: number, month: number): Promise<Lead[]>;
  listCommissionShortNames(): Promise<string[]>;
  create(payload?: LeadUpdateRecord): Promise<Lead>;
  update(leadId: string, payload: LeadUpdateRecord): Promise<Lead | null>;
  delete(leadId: string): Promise<void>;
  bulkDelete(leadIds: string[]): Promise<void>;
  markSentToClient(leadId: string): Promise<Lead | null>;
  sendToMatters(leadId: string): Promise<Lead | null>;
  returnToActive(leadId: string): Promise<Lead | null>;
}

export interface MatterWriteRecord {
  clientId?: string | null;
  clientNumber?: string | null;
  clientName?: string;
  quoteId?: string | null;
  quoteNumber?: string | null;
  commissionAssignee?: string | null;
  matterType?: Matter["matterType"];
  subject?: string;
  specificProcess?: string | null;
  totalFeesMxn?: number;
  responsibleTeam?: Matter["responsibleTeam"] | null;
  nextPaymentDate?: string | null;
  communicationChannel?: Matter["communicationChannel"];
  r1InternalCreated?: boolean;
  telegramBotLinked?: boolean;
  rdCreated?: boolean;
  rfCreated?: Matter["rfCreated"];
  r1ExternalCreated?: boolean;
  billingChatCreated?: boolean;
  matterIdentifier?: string | null;
  executionLinkedModule?: string | null;
  executionLinkedAt?: string | null;
  executionPrompt?: string | null;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  nextActionSource?: string | null;
  milestone?: string | null;
  concluded?: boolean;
  stage?: Matter["stage"];
  origin?: Matter["origin"];
  notes?: string | null;
  deletedAt?: string | null;
}

export interface MattersRepository {
  list(): Promise<Matter[]>;
  listDeleted(): Promise<Matter[]>;
  listCommissionShortNames(): Promise<string[]>;
  create(payload?: MatterWriteRecord): Promise<Matter>;
  update(matterId: string, payload: MatterWriteRecord): Promise<Matter | null>;
  trash(matterId: string): Promise<Matter | null>;
  bulkTrash(matterIds: string[]): Promise<void>;
  bulkDelete(matterIds: string[]): Promise<void>;
  restore(matterId: string): Promise<Matter | null>;
  generateIdentifier(matterId: string): Promise<Matter | null>;
  sendToExecution(matterId: string): Promise<Matter | null>;
}

export interface GeneralExpenseCreateRecord {
  year?: number;
  month?: number;
}

export interface GeneralExpenseUpdateRecord {
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
}

export interface GeneralExpenseActor extends Pick<
  AuthUser,
  "email" | "username" | "displayName" | "shortName" | "role" | "legacyRole" | "team" | "legacyTeam" | "specificRole" | "permissions"
> {}

export interface GeneralExpensesRepository {
  list(year: number, month: number): Promise<GeneralExpense[]>;
  create(payload?: GeneralExpenseCreateRecord): Promise<GeneralExpense>;
  update(expenseId: string, payload: GeneralExpenseUpdateRecord, actor: GeneralExpenseActor): Promise<GeneralExpense | null>;
  delete(expenseId: string): Promise<void>;
  copyRecurringToNextMonth(year: number, month: number): Promise<{
    year: number;
    month: number;
    copied: number;
  }>;
}

export interface BudgetPlanUpdateRecord {
  expectedIncomeMxn?: number;
  expectedExpenseMxn?: number;
  notes?: string | null;
}

export interface BudgetPlanningOverviewRecord {
  plan: BudgetPlan;
  financeRecords: FinanceRecord[];
  generalExpenses: GeneralExpense[];
}

export interface BudgetPlanningRepository {
  getOverview(year: number, month: number): Promise<BudgetPlanningOverviewRecord>;
  updatePlan(year: number, month: number, payload: BudgetPlanUpdateRecord): Promise<BudgetPlan>;
  listSnapshotsBefore(year: number, month: number): Promise<BudgetPlanSnapshot[]>;
}

export interface FinanceRecordWriteRecord {
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
}

export interface FinanceRepository {
  listRecords(year: number, month: number): Promise<FinanceRecord[]>;
  createRecord(year: number, month: number, payload?: FinanceRecordWriteRecord): Promise<FinanceRecord>;
  updateRecord(recordId: string, payload: FinanceRecordWriteRecord): Promise<FinanceRecord | null>;
  deleteRecord(recordId: string): Promise<void>;
  bulkDelete(recordIds: string[]): Promise<void>;
  listSnapshots(): Promise<FinanceSnapshot[]>;
  createSnapshot(year: number, month: number): Promise<FinanceSnapshot>;
  copyToNextMonth(year: number, month: number): Promise<{ year: number; month: number; copied: number }>;
  sendMatterToFinance(matterId: string, year: number, month: number): Promise<FinanceRecord>;
  listCommissionReceivers(): Promise<CommissionReceiver[]>;
}

export interface CommissionsOverviewRecord {
  financeRecords: FinanceRecord[];
  generalExpenses: GeneralExpense[];
  receivers: CommissionReceiver[];
}

export interface CreateCommissionSnapshotRecord {
  year: number;
  month: number;
  section: string;
  title: string;
  totalNetMxn: number;
  snapshotData?: CommissionSnapshot["snapshotData"];
}

export interface CommissionsRepository {
  getOverview(year: number, month: number): Promise<CommissionsOverviewRecord>;
  listReceivers(): Promise<CommissionReceiver[]>;
  createReceiver(name: string): Promise<CommissionReceiver>;
  updateReceiver(receiverId: string, name: string): Promise<CommissionReceiver | null>;
  deleteReceiver(receiverId: string): Promise<void>;
  listSnapshots(): Promise<CommissionSnapshot[]>;
  createSnapshot(payload: CreateCommissionSnapshotRecord): Promise<CommissionSnapshot>;
}

export interface TasksRepository {
  listModules(): Promise<TaskModuleDefinition[]>;
  listTasks(moduleId?: string): Promise<TaskItem[]>;
  create(payload: Omit<TaskItem, "id">): Promise<TaskItem>;
  updateState(taskId: string, state: TaskItem["state"]): Promise<TaskItem | null>;
  listTrackingRecords(filter: TaskTrackingRecordFilter): Promise<TaskTrackingRecord[]>;
  createTrackingRecord(payload: TaskTrackingRecordWriteRecord): Promise<TaskTrackingRecord>;
  updateTrackingRecord(recordId: string, payload: TaskTrackingRecordWriteRecord): Promise<TaskTrackingRecord | null>;
  deleteTrackingRecord(recordId: string): Promise<void>;
  listTerms(moduleId: string): Promise<TaskTerm[]>;
  createTerm(payload: TaskTermWriteRecord): Promise<TaskTerm>;
  updateTerm(termId: string, payload: TaskTermWriteRecord): Promise<TaskTerm | null>;
  deleteTerm(termId: string): Promise<void>;
  listDistributionEvents(moduleId: string): Promise<TaskDistributionEvent[]>;
  createDistributionEvent(payload: TaskDistributionEventWriteRecord): Promise<TaskDistributionEvent>;
  updateDistributionEvent(eventId: string, payload: TaskDistributionEventWriteRecord): Promise<TaskDistributionEvent | null>;
  deleteDistributionEvent(eventId: string): Promise<void>;
  listDistributionHistory(moduleId: string): Promise<TaskDistributionHistory[]>;
  createDistribution(payload: TaskDistributionWriteRecord): Promise<TaskDistributionHistory>;
  listAdditionalTasks(moduleId: string): Promise<TaskAdditionalTask[]>;
  createAdditionalTask(payload: TaskAdditionalTaskWriteRecord): Promise<TaskAdditionalTask>;
  updateAdditionalTask(taskId: string, payload: TaskAdditionalTaskWriteRecord): Promise<TaskAdditionalTask | null>;
  deleteAdditionalTask(taskId: string): Promise<void>;
}

export interface TaskTrackingRecordFilter {
  moduleId?: string;
  tableCode?: string;
  includeDeleted?: boolean;
}

export interface TaskTrackingRecordWriteRecord {
  moduleId?: string;
  tableCode?: string;
  sourceTable?: string;
  matterId?: string | null;
  matterNumber?: string | null;
  clientNumber?: string | null;
  clientName?: string;
  subject?: string;
  specificProcess?: string | null;
  matterIdentifier?: string | null;
  taskName?: string;
  eventName?: string | null;
  responsible?: string;
  dueDate?: string | null;
  termDate?: string | null;
  completedAt?: string | null;
  status?: TaskTrackingRecord["status"];
  workflowStage?: number;
  reportedMonth?: string | null;
  termId?: string | null;
  data?: TaskTrackingRecord["data"];
  deletedAt?: string | null;
}

export interface TaskTermWriteRecord {
  moduleId?: string;
  sourceTable?: string | null;
  sourceRecordId?: string | null;
  matterId?: string | null;
  matterNumber?: string | null;
  clientNumber?: string | null;
  clientName?: string;
  subject?: string;
  specificProcess?: string | null;
  matterIdentifier?: string | null;
  eventName?: string;
  pendingTaskLabel?: string | null;
  responsible?: string;
  dueDate?: string | null;
  termDate?: string | null;
  status?: TaskTerm["status"];
  recurring?: boolean;
  reportedMonth?: string | null;
  verification?: TaskTerm["verification"];
  data?: TaskTerm["data"];
  deletedAt?: string | null;
}

export interface TaskDistributionEventWriteRecord {
  moduleId?: string;
  name?: string;
  targetTables?: string[];
  defaultTaskName?: string | null;
}

export interface TaskDistributionTargetRecord {
  tableCode: string;
  sourceTable: string;
  tableLabel: string;
  taskName: string;
  dueDate?: string | null;
  termDate?: string | null;
  status?: TaskTrackingRecord["status"];
  workflowStage?: number;
  reportedMonth?: string | null;
  createTerm?: boolean;
  data?: TaskTrackingRecord["data"];
}

export interface TaskDistributionWriteRecord {
  moduleId: string;
  matterId?: string | null;
  matterNumber?: string | null;
  clientNumber?: string | null;
  clientName?: string;
  subject?: string;
  specificProcess?: string | null;
  matterIdentifier?: string | null;
  eventName: string;
  responsible: string;
  targets: TaskDistributionTargetRecord[];
  data?: TaskDistributionHistory["data"];
}

export interface TaskAdditionalTaskWriteRecord {
  moduleId?: string;
  task?: string;
  responsible?: string;
  responsible2?: string | null;
  dueDate?: string | null;
  recurring?: boolean;
  status?: TaskAdditionalTask["status"];
  deletedAt?: string | null;
}

export interface UsersRepository {
  list(): Promise<ManagedUser[]>;
  findById(userId: string): Promise<ManagedUser | null>;
  create(payload: CreateManagedUserRecord): Promise<ManagedUser>;
  update(userId: string, payload: UpdateManagedUserRecord): Promise<ManagedUser | null>;
  delete(userId: string): Promise<void>;
}

export interface DashboardRepository {
  getSummary(): Promise<DashboardSummary>;
}
