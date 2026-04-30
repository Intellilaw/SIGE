import { Prisma } from "@prisma/client";

import type {
  ClientsRepository,
  MattersRepository,
  MatterWriteRecord,
  TaskAdditionalTaskWriteRecord,
  TaskDistributionEventWriteRecord,
  TaskDistributionWriteRecord,
  TaskTermWriteRecord,
  TaskTrackingRecordFilter,
  TaskTrackingRecordWriteRecord,
  TasksRepository
} from "./types";

function isDatabaseUnavailableError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = `${error.name} ${error.message}`;
  return [
    "ECONNREFUSED",
    "Can't reach database server",
    "database server",
    "Connection refused"
  ].some((fragment) => message.includes(fragment));
}

class ResilientRepositoryBase {
  private warned = false;
  private readonly fallbackAvailable: boolean;

  protected constructor(
    fallback: object | null,
    private readonly logger?: { warn: (message: string) => void },
    private readonly label = "business"
  ) {
    this.fallbackAvailable = Boolean(fallback);
  }

  protected async withFallback<T>(primaryAction: () => Promise<T>, fallbackAction: () => Promise<T>) {
    try {
      return await primaryAction();
    } catch (error) {
      if (!this.fallbackAvailable || !isDatabaseUnavailableError(error)) {
        throw error;
      }

      if (!this.warned) {
        this.warned = true;
        this.logger?.warn(`Database unavailable. Using local development ${this.label} fallback.`);
      }

      return fallbackAction();
    }
  }
}

export class ResilientClientsRepository extends ResilientRepositoryBase implements ClientsRepository {
  public constructor(
    private readonly primary: ClientsRepository,
    private readonly fallback: ClientsRepository | null,
    logger?: { warn: (message: string) => void }
  ) {
    super(fallback, logger, "clients");
  }

  public list() {
    return this.withFallback(() => this.primary.list(), () => this.fallback?.list() ?? Promise.resolve([]));
  }

  public create(name: string) {
    return this.withFallback(() => this.primary.create(name), () => this.fallback!.create(name));
  }

  public update(clientId: string, name: string) {
    return this.withFallback(() => this.primary.update(clientId, name), () => this.fallback!.update(clientId, name));
  }

  public delete(clientId: string) {
    return this.withFallback(() => this.primary.delete(clientId), () => this.fallback!.delete(clientId));
  }
}

export class ResilientMattersRepository extends ResilientRepositoryBase implements MattersRepository {
  public constructor(
    private readonly primary: MattersRepository,
    private readonly fallback: MattersRepository | null,
    logger?: { warn: (message: string) => void }
  ) {
    super(fallback, logger, "matters");
  }

  public list() {
    return this.withFallback(() => this.primary.list(), () => this.fallback?.list() ?? Promise.resolve([]));
  }

  public listDeleted() {
    return this.withFallback(() => this.primary.listDeleted(), () => this.fallback?.listDeleted() ?? Promise.resolve([]));
  }

  public listCommissionShortNames() {
    return this.withFallback(
      () => this.primary.listCommissionShortNames(),
      () => this.fallback?.listCommissionShortNames() ?? Promise.resolve([])
    );
  }

  public create(payload?: MatterWriteRecord) {
    return this.withFallback(() => this.primary.create(payload), () => this.fallback!.create(payload));
  }

  public update(matterId: string, payload: MatterWriteRecord) {
    return this.withFallback(() => this.primary.update(matterId, payload), () => this.fallback!.update(matterId, payload));
  }

  public trash(matterId: string) {
    return this.withFallback(() => this.primary.trash(matterId), () => this.fallback!.trash(matterId));
  }

  public bulkTrash(matterIds: string[]) {
    return this.withFallback(() => this.primary.bulkTrash(matterIds), () => this.fallback!.bulkTrash(matterIds));
  }

  public bulkDelete(matterIds: string[]) {
    return this.withFallback(() => this.primary.bulkDelete(matterIds), () => this.fallback!.bulkDelete(matterIds));
  }

  public restore(matterId: string) {
    return this.withFallback(() => this.primary.restore(matterId), () => this.fallback!.restore(matterId));
  }

  public generateIdentifier(matterId: string) {
    return this.withFallback(() => this.primary.generateIdentifier(matterId), () => this.fallback!.generateIdentifier(matterId));
  }

  public sendToExecution(matterId: string) {
    return this.withFallback(() => this.primary.sendToExecution(matterId), () => this.fallback!.sendToExecution(matterId));
  }
}

export class ResilientTasksRepository extends ResilientRepositoryBase implements TasksRepository {
  public constructor(
    private readonly primary: TasksRepository,
    private readonly fallback: TasksRepository | null,
    logger?: { warn: (message: string) => void }
  ) {
    super(fallback, logger, "tasks");
  }

  public listModules() {
    return this.withFallback(() => this.primary.listModules(), () => this.fallback?.listModules() ?? Promise.resolve([]));
  }

  public listTasks(moduleId?: string) {
    return this.withFallback(() => this.primary.listTasks(moduleId), () => this.fallback?.listTasks(moduleId) ?? Promise.resolve([]));
  }

  public create(payload: Parameters<TasksRepository["create"]>[0]) {
    return this.withFallback(() => this.primary.create(payload), () => this.fallback!.create(payload));
  }

  public updateState(taskId: string, state: Parameters<TasksRepository["updateState"]>[1]) {
    return this.withFallback(() => this.primary.updateState(taskId, state), () => this.fallback!.updateState(taskId, state));
  }

  public listTrackingRecords(filter: TaskTrackingRecordFilter) {
    return this.withFallback(
      () => this.primary.listTrackingRecords(filter),
      () => this.fallback?.listTrackingRecords(filter) ?? Promise.resolve([])
    );
  }

  public createTrackingRecord(payload: TaskTrackingRecordWriteRecord) {
    return this.withFallback(() => this.primary.createTrackingRecord(payload), () => this.fallback!.createTrackingRecord(payload));
  }

  public updateTrackingRecord(recordId: string, payload: TaskTrackingRecordWriteRecord) {
    return this.withFallback(
      () => this.primary.updateTrackingRecord(recordId, payload),
      () => this.fallback!.updateTrackingRecord(recordId, payload)
    );
  }

  public deleteTrackingRecord(recordId: string) {
    return this.withFallback(() => this.primary.deleteTrackingRecord(recordId), () => this.fallback!.deleteTrackingRecord(recordId));
  }

  public listTerms(moduleId: string) {
    return this.withFallback(() => this.primary.listTerms(moduleId), () => this.fallback?.listTerms(moduleId) ?? Promise.resolve([]));
  }

  public createTerm(payload: TaskTermWriteRecord) {
    return this.withFallback(() => this.primary.createTerm(payload), () => this.fallback!.createTerm(payload));
  }

  public updateTerm(termId: string, payload: TaskTermWriteRecord) {
    return this.withFallback(() => this.primary.updateTerm(termId, payload), () => this.fallback!.updateTerm(termId, payload));
  }

  public deleteTerm(termId: string) {
    return this.withFallback(() => this.primary.deleteTerm(termId), () => this.fallback!.deleteTerm(termId));
  }

  public listDistributionEvents(moduleId: string) {
    return this.withFallback(
      () => this.primary.listDistributionEvents(moduleId),
      () => this.fallback?.listDistributionEvents(moduleId) ?? Promise.resolve([])
    );
  }

  public createDistributionEvent(payload: TaskDistributionEventWriteRecord) {
    return this.withFallback(() => this.primary.createDistributionEvent(payload), () => this.fallback!.createDistributionEvent(payload));
  }

  public updateDistributionEvent(eventId: string, payload: TaskDistributionEventWriteRecord) {
    return this.withFallback(
      () => this.primary.updateDistributionEvent(eventId, payload),
      () => this.fallback!.updateDistributionEvent(eventId, payload)
    );
  }

  public deleteDistributionEvent(eventId: string) {
    return this.withFallback(() => this.primary.deleteDistributionEvent(eventId), () => this.fallback!.deleteDistributionEvent(eventId));
  }

  public listDistributionHistory(moduleId: string) {
    return this.withFallback(
      () => this.primary.listDistributionHistory(moduleId),
      () => this.fallback?.listDistributionHistory(moduleId) ?? Promise.resolve([])
    );
  }

  public createDistribution(payload: TaskDistributionWriteRecord) {
    return this.withFallback(() => this.primary.createDistribution(payload), () => this.fallback!.createDistribution(payload));
  }

  public listAdditionalTasks(moduleId: string) {
    return this.withFallback(
      () => this.primary.listAdditionalTasks(moduleId),
      () => this.fallback?.listAdditionalTasks(moduleId) ?? Promise.resolve([])
    );
  }

  public createAdditionalTask(payload: TaskAdditionalTaskWriteRecord) {
    return this.withFallback(() => this.primary.createAdditionalTask(payload), () => this.fallback!.createAdditionalTask(payload));
  }

  public updateAdditionalTask(taskId: string, payload: TaskAdditionalTaskWriteRecord) {
    return this.withFallback(
      () => this.primary.updateAdditionalTask(taskId, payload),
      () => this.fallback!.updateAdditionalTask(taskId, payload)
    );
  }

  public deleteAdditionalTask(taskId: string) {
    return this.withFallback(() => this.primary.deleteAdditionalTask(taskId), () => this.fallback!.deleteAdditionalTask(taskId));
  }
}
