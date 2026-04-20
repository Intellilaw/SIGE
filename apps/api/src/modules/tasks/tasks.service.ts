import type { TaskItem } from "@sige/contracts";

import type {
  TaskAdditionalTaskWriteRecord,
  TaskDistributionEventWriteRecord,
  TaskDistributionWriteRecord,
  TaskTermWriteRecord,
  TaskTrackingRecordFilter,
  TaskTrackingRecordWriteRecord,
  TasksRepository
} from "../../repositories/types";

export class TasksService {
  public constructor(private readonly repository: TasksRepository) {}

  public listModules() {
    return this.repository.listModules();
  }

  public listTasks(moduleId?: string) {
    return this.repository.listTasks(moduleId);
  }

  public create(payload: Omit<TaskItem, "id">) {
    return this.repository.create(payload);
  }

  public updateState(taskId: string, state: TaskItem["state"]) {
    return this.repository.updateState(taskId, state);
  }

  public listTrackingRecords(filter: TaskTrackingRecordFilter) {
    return this.repository.listTrackingRecords(filter);
  }

  public createTrackingRecord(payload: TaskTrackingRecordWriteRecord) {
    return this.repository.createTrackingRecord(payload);
  }

  public updateTrackingRecord(recordId: string, payload: TaskTrackingRecordWriteRecord) {
    return this.repository.updateTrackingRecord(recordId, payload);
  }

  public deleteTrackingRecord(recordId: string) {
    return this.repository.deleteTrackingRecord(recordId);
  }

  public listTerms(moduleId: string) {
    return this.repository.listTerms(moduleId);
  }

  public createTerm(payload: TaskTermWriteRecord) {
    return this.repository.createTerm(payload);
  }

  public updateTerm(termId: string, payload: TaskTermWriteRecord) {
    return this.repository.updateTerm(termId, payload);
  }

  public deleteTerm(termId: string) {
    return this.repository.deleteTerm(termId);
  }

  public listDistributionEvents(moduleId: string) {
    return this.repository.listDistributionEvents(moduleId);
  }

  public createDistributionEvent(payload: TaskDistributionEventWriteRecord) {
    return this.repository.createDistributionEvent(payload);
  }

  public updateDistributionEvent(eventId: string, payload: TaskDistributionEventWriteRecord) {
    return this.repository.updateDistributionEvent(eventId, payload);
  }

  public deleteDistributionEvent(eventId: string) {
    return this.repository.deleteDistributionEvent(eventId);
  }

  public listDistributionHistory(moduleId: string) {
    return this.repository.listDistributionHistory(moduleId);
  }

  public createDistribution(payload: TaskDistributionWriteRecord) {
    return this.repository.createDistribution(payload);
  }

  public listAdditionalTasks(moduleId: string) {
    return this.repository.listAdditionalTasks(moduleId);
  }

  public createAdditionalTask(payload: TaskAdditionalTaskWriteRecord) {
    return this.repository.createAdditionalTask(payload);
  }

  public updateAdditionalTask(taskId: string, payload: TaskAdditionalTaskWriteRecord) {
    return this.repository.updateAdditionalTask(taskId, payload);
  }

  public deleteAdditionalTask(taskId: string) {
    return this.repository.deleteAdditionalTask(taskId);
  }
}
