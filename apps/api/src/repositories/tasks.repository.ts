import { Prisma, type PrismaClient } from "@prisma/client";
import type { TaskItem } from "@sige/contracts";

import {
  mapTaskAdditionalTask,
  mapTaskDistributionEvent,
  mapTaskDistributionHistory,
  mapTaskItem,
  mapTaskModule,
  mapTaskTerm,
  mapTaskTrackingRecord
} from "./mappers";
import type {
  TaskAdditionalTaskWriteRecord,
  TaskDistributionEventWriteRecord,
  TaskDistributionTargetRecord,
  TaskDistributionWriteRecord,
  TaskTermWriteRecord,
  TaskTrackingRecordFilter,
  TaskTrackingRecordWriteRecord,
  TasksRepository
} from "./types";

function normalizeRequiredText(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalDateValue(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }
  if (!value) {
    return null;
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toJsonValue(value?: Record<string, unknown> | Record<string, string> | string[]) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getSourceTable(target: TaskDistributionTargetRecord) {
  return normalizeRequiredText(target.sourceTable) || normalizeRequiredText(target.tableCode);
}

export class PrismaTasksRepository implements TasksRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listModules() {
    const records = await this.prisma.taskModule.findMany({
      include: {
        tracks: {
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { label: "asc" }
    });

    return records.map(mapTaskModule);
  }

  public async listTasks(moduleId?: string) {
    const records = await this.prisma.taskItem.findMany({
      where: moduleId ? { moduleId } : undefined,
      orderBy: { dueDate: "asc" }
    });

    return records.map(mapTaskItem);
  }

  public async create(payload: Omit<TaskItem, "id">) {
    const record = await this.prisma.taskItem.create({
      data: {
        moduleId: payload.moduleId,
        trackId: payload.trackId,
        clientName: payload.clientName,
        matterId: payload.matterId,
        matterNumber: payload.matterNumber,
        subject: payload.subject,
        responsible: payload.responsible,
        dueDate: new Date(payload.dueDate),
        state: payload.state,
        recurring: payload.recurring
      }
    });

    return mapTaskItem(record);
  }

  public async updateState(taskId: string, state: TaskItem["state"]) {
    const record = await this.prisma.taskItem.update({
      where: { id: taskId },
      data: { state }
    }).catch(() => null);

    return record ? mapTaskItem(record) : null;
  }

  public async listTrackingRecords(filter: TaskTrackingRecordFilter) {
    const records = await this.prisma.taskTrackingRecord.findMany({
      where: {
        moduleId: filter.moduleId,
        tableCode: filter.tableCode,
        deletedAt: filter.includeDeleted ? undefined : null
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }]
    });

    return records.map(mapTaskTrackingRecord);
  }

  public async createTrackingRecord(payload: TaskTrackingRecordWriteRecord) {
    const tableCode = normalizeRequiredText(payload.tableCode) || normalizeRequiredText(payload.sourceTable);
    const sourceTable = normalizeRequiredText(payload.sourceTable) || tableCode;

    const record = await this.prisma.taskTrackingRecord.create({
      data: {
        moduleId: normalizeRequiredText(payload.moduleId),
        tableCode,
        sourceTable,
        matterId: normalizeOptionalText(payload.matterId),
        matterNumber: normalizeOptionalText(payload.matterNumber),
        clientNumber: normalizeOptionalText(payload.clientNumber),
        clientName: normalizeRequiredText(payload.clientName),
        subject: normalizeRequiredText(payload.subject),
        specificProcess: normalizeOptionalText(payload.specificProcess),
        matterIdentifier: normalizeOptionalText(payload.matterIdentifier),
        taskName: normalizeRequiredText(payload.taskName),
        eventName: normalizeOptionalText(payload.eventName),
        responsible: normalizeRequiredText(payload.responsible),
        dueDate: parseOptionalDateValue(payload.dueDate),
        termDate: parseOptionalDateValue(payload.termDate),
        completedAt: parseOptionalDateValue(payload.completedAt),
        status: payload.status ?? "pendiente",
        workflowStage: payload.workflowStage ?? 1,
        reportedMonth: normalizeOptionalText(payload.reportedMonth),
        termId: normalizeOptionalText(payload.termId),
        data: toJsonValue(payload.data) ?? {},
        deletedAt: parseOptionalDateValue(payload.deletedAt)
      }
    });

    return mapTaskTrackingRecord(record);
  }

  public async updateTrackingRecord(recordId: string, payload: TaskTrackingRecordWriteRecord) {
    const record = await this.prisma.taskTrackingRecord.update({
      where: { id: recordId },
      data: {
        moduleId: payload.moduleId,
        tableCode: payload.tableCode,
        sourceTable: payload.sourceTable,
        matterId: normalizeOptionalText(payload.matterId),
        matterNumber: normalizeOptionalText(payload.matterNumber),
        clientNumber: normalizeOptionalText(payload.clientNumber),
        clientName: payload.clientName,
        subject: payload.subject,
        specificProcess: normalizeOptionalText(payload.specificProcess),
        matterIdentifier: normalizeOptionalText(payload.matterIdentifier),
        taskName: payload.taskName,
        eventName: normalizeOptionalText(payload.eventName),
        responsible: payload.responsible,
        dueDate: parseOptionalDateValue(payload.dueDate),
        termDate: parseOptionalDateValue(payload.termDate),
        completedAt: parseOptionalDateValue(payload.completedAt),
        status: payload.status,
        workflowStage: payload.workflowStage,
        reportedMonth: normalizeOptionalText(payload.reportedMonth),
        termId: normalizeOptionalText(payload.termId),
        data: toJsonValue(payload.data),
        deletedAt: parseOptionalDateValue(payload.deletedAt)
      }
    }).catch(() => null);

    return record ? mapTaskTrackingRecord(record) : null;
  }

  public async deleteTrackingRecord(recordId: string) {
    await this.prisma.taskTrackingRecord.update({
      where: { id: recordId },
      data: { deletedAt: new Date() }
    }).catch(() => null);
  }

  public async listTerms(moduleId: string) {
    const records = await this.prisma.taskTerm.findMany({
      where: { moduleId, deletedAt: null },
      orderBy: [{ termDate: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }]
    });

    return records.map(mapTaskTerm);
  }

  public async createTerm(payload: TaskTermWriteRecord) {
    const record = await this.prisma.taskTerm.create({
      data: {
        moduleId: normalizeRequiredText(payload.moduleId),
        sourceTable: normalizeOptionalText(payload.sourceTable),
        sourceRecordId: normalizeOptionalText(payload.sourceRecordId),
        matterId: normalizeOptionalText(payload.matterId),
        matterNumber: normalizeOptionalText(payload.matterNumber),
        clientNumber: normalizeOptionalText(payload.clientNumber),
        clientName: normalizeRequiredText(payload.clientName),
        subject: normalizeRequiredText(payload.subject),
        specificProcess: normalizeOptionalText(payload.specificProcess),
        matterIdentifier: normalizeOptionalText(payload.matterIdentifier),
        eventName: normalizeRequiredText(payload.eventName),
        pendingTaskLabel: normalizeOptionalText(payload.pendingTaskLabel),
        responsible: normalizeRequiredText(payload.responsible),
        dueDate: parseOptionalDateValue(payload.dueDate),
        termDate: parseOptionalDateValue(payload.termDate),
        status: payload.status ?? "pendiente",
        recurring: payload.recurring ?? false,
        reportedMonth: normalizeOptionalText(payload.reportedMonth),
        verification: toJsonValue(payload.verification) ?? {},
        data: toJsonValue(payload.data) ?? {},
        deletedAt: parseOptionalDateValue(payload.deletedAt)
      }
    });

    return mapTaskTerm(record);
  }

  public async updateTerm(termId: string, payload: TaskTermWriteRecord) {
    const record = await this.prisma.taskTerm.update({
      where: { id: termId },
      data: {
        moduleId: payload.moduleId,
        sourceTable: normalizeOptionalText(payload.sourceTable),
        sourceRecordId: normalizeOptionalText(payload.sourceRecordId),
        matterId: normalizeOptionalText(payload.matterId),
        matterNumber: normalizeOptionalText(payload.matterNumber),
        clientNumber: normalizeOptionalText(payload.clientNumber),
        clientName: payload.clientName,
        subject: payload.subject,
        specificProcess: normalizeOptionalText(payload.specificProcess),
        matterIdentifier: normalizeOptionalText(payload.matterIdentifier),
        eventName: payload.eventName,
        pendingTaskLabel: normalizeOptionalText(payload.pendingTaskLabel),
        responsible: payload.responsible,
        dueDate: parseOptionalDateValue(payload.dueDate),
        termDate: parseOptionalDateValue(payload.termDate),
        status: payload.status,
        recurring: payload.recurring,
        reportedMonth: normalizeOptionalText(payload.reportedMonth),
        verification: toJsonValue(payload.verification),
        data: toJsonValue(payload.data),
        deletedAt: parseOptionalDateValue(payload.deletedAt)
      }
    }).catch(() => null);

    return record ? mapTaskTerm(record) : null;
  }

  public async deleteTerm(termId: string) {
    await this.prisma.taskTerm.update({
      where: { id: termId },
      data: { deletedAt: new Date() }
    }).catch(() => null);
  }

  public async listDistributionEvents(moduleId: string) {
    const records = await this.prisma.taskDistributionEvent.findMany({
      where: { moduleId },
      orderBy: { name: "asc" }
    });

    return records.map(mapTaskDistributionEvent);
  }

  public async createDistributionEvent(payload: TaskDistributionEventWriteRecord) {
    const record = await this.prisma.taskDistributionEvent.create({
      data: {
        moduleId: normalizeRequiredText(payload.moduleId),
        name: normalizeRequiredText(payload.name),
        targetTables: toJsonValue(payload.targetTables ?? []) ?? [],
        defaultTaskName: normalizeOptionalText(payload.defaultTaskName)
      }
    });

    return mapTaskDistributionEvent(record);
  }

  public async updateDistributionEvent(eventId: string, payload: TaskDistributionEventWriteRecord) {
    const record = await this.prisma.taskDistributionEvent.update({
      where: { id: eventId },
      data: {
        moduleId: payload.moduleId,
        name: payload.name,
        targetTables: toJsonValue(payload.targetTables),
        defaultTaskName: normalizeOptionalText(payload.defaultTaskName)
      }
    }).catch(() => null);

    return record ? mapTaskDistributionEvent(record) : null;
  }

  public async deleteDistributionEvent(eventId: string) {
    await this.prisma.taskDistributionEvent.delete({
      where: { id: eventId }
    }).catch(() => null);
  }

  public async listDistributionHistory(moduleId: string) {
    const records = await this.prisma.taskDistributionHistory.findMany({
      where: { moduleId },
      orderBy: { createdAt: "desc" }
    });

    return records.map(mapTaskDistributionHistory);
  }

  public async createDistribution(payload: TaskDistributionWriteRecord) {
    const record = await this.prisma.$transaction(async (tx) => {
      const createdIds: Record<string, string> = {};
      const targetTables = payload.targets.map((target) => getSourceTable(target));
      const eventNamesPerTable: string[] = [];

      for (const target of payload.targets) {
        const sourceTable = getSourceTable(target);
        const taskName = normalizeRequiredText(target.taskName) || payload.eventName;

        const trackingRecord = await tx.taskTrackingRecord.create({
          data: {
            moduleId: payload.moduleId,
            tableCode: normalizeRequiredText(target.tableCode) || sourceTable,
            sourceTable,
            matterId: normalizeOptionalText(payload.matterId),
            matterNumber: normalizeOptionalText(payload.matterNumber),
            clientNumber: normalizeOptionalText(payload.clientNumber),
            clientName: normalizeRequiredText(payload.clientName),
            subject: normalizeRequiredText(payload.subject),
            specificProcess: normalizeOptionalText(payload.specificProcess),
            matterIdentifier: normalizeOptionalText(payload.matterIdentifier),
            taskName,
            eventName: payload.eventName,
            responsible: payload.responsible,
            dueDate: parseOptionalDateValue(target.dueDate),
            termDate: parseOptionalDateValue(target.termDate),
            status: target.status ?? "pendiente",
            workflowStage: target.workflowStage ?? 1,
            reportedMonth: normalizeOptionalText(target.reportedMonth),
            data: toJsonValue({
              ...(target.data ?? {}),
              tableLabel: target.tableLabel
            }) ?? {}
          }
        });

        createdIds[sourceTable] = trackingRecord.id;
        eventNamesPerTable.push(taskName);

        if (target.createTerm) {
          await tx.taskTerm.create({
            data: {
              moduleId: payload.moduleId,
              sourceTable,
              sourceRecordId: trackingRecord.id,
              matterId: normalizeOptionalText(payload.matterId),
              matterNumber: normalizeOptionalText(payload.matterNumber),
              clientNumber: normalizeOptionalText(payload.clientNumber),
              clientName: normalizeRequiredText(payload.clientName),
              subject: normalizeRequiredText(payload.subject),
              specificProcess: normalizeOptionalText(payload.specificProcess),
              matterIdentifier: normalizeOptionalText(payload.matterIdentifier),
              eventName: payload.eventName,
              pendingTaskLabel: taskName,
              responsible: payload.responsible,
              dueDate: parseOptionalDateValue(target.dueDate),
              termDate: parseOptionalDateValue(target.termDate),
              status: target.status ?? "pendiente",
              reportedMonth: normalizeOptionalText(target.reportedMonth),
              data: toJsonValue(target.data) ?? {}
            }
          });
        }
      }

      return tx.taskDistributionHistory.create({
        data: {
          moduleId: payload.moduleId,
          matterId: normalizeOptionalText(payload.matterId),
          matterNumber: normalizeOptionalText(payload.matterNumber),
          clientNumber: normalizeOptionalText(payload.clientNumber),
          clientName: normalizeRequiredText(payload.clientName),
          subject: normalizeRequiredText(payload.subject),
          specificProcess: normalizeOptionalText(payload.specificProcess),
          matterIdentifier: normalizeOptionalText(payload.matterIdentifier),
          eventName: payload.eventName,
          targetTables: toJsonValue(targetTables) ?? [],
          eventNamesPerTable: toJsonValue(eventNamesPerTable) ?? [],
          createdIds: toJsonValue(createdIds) ?? {},
          data: toJsonValue(payload.data) ?? {}
        }
      });
    });

    return mapTaskDistributionHistory(record);
  }

  public async listAdditionalTasks(moduleId: string) {
    const records = await this.prisma.taskAdditionalTask.findMany({
      where: { moduleId, deletedAt: null },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }]
    });

    return records.map(mapTaskAdditionalTask);
  }

  public async createAdditionalTask(payload: TaskAdditionalTaskWriteRecord) {
    const record = await this.prisma.taskAdditionalTask.create({
      data: {
        moduleId: normalizeRequiredText(payload.moduleId),
        task: normalizeRequiredText(payload.task),
        responsible: normalizeRequiredText(payload.responsible),
        responsible2: normalizeOptionalText(payload.responsible2),
        dueDate: parseOptionalDateValue(payload.dueDate),
        status: payload.status ?? "pendiente",
        deletedAt: parseOptionalDateValue(payload.deletedAt)
      }
    });

    return mapTaskAdditionalTask(record);
  }

  public async updateAdditionalTask(taskId: string, payload: TaskAdditionalTaskWriteRecord) {
    const record = await this.prisma.taskAdditionalTask.update({
      where: { id: taskId },
      data: {
        moduleId: payload.moduleId,
        task: payload.task,
        responsible: payload.responsible,
        responsible2: normalizeOptionalText(payload.responsible2),
        dueDate: parseOptionalDateValue(payload.dueDate),
        status: payload.status,
        deletedAt: parseOptionalDateValue(payload.deletedAt)
      }
    }).catch(() => null);

    return record ? mapTaskAdditionalTask(record) : null;
  }

  public async deleteAdditionalTask(taskId: string) {
    await this.prisma.taskAdditionalTask.update({
      where: { id: taskId },
      data: { deletedAt: new Date() }
    }).catch(() => null);
  }
}
