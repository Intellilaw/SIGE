import { Prisma, type PrismaClient } from "@prisma/client";
import type { TaskItem, TaskModuleMember } from "@sige/contracts";

import {
  mapTaskAdditionalTask,
  mapTaskDistributionEvent,
  mapTaskDistributionHistory,
  mapTaskItem,
  mapTaskModule,
  mapTaskTerm,
  mapTaskTrackingRecord
} from "./mappers";
import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
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

type TaskModuleListRecord = {
  id: string;
  team: string;
  label: string;
  summary: string;
  isActive: boolean;
};

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

const LITIGATION_MODULE_ID = "litigation";
const TERM_ENABLED_DATA_KEY = "termEnabled";
const TERM_MARKED_AT_DATA_KEY = "termMarkedAt";
const VERIFICATION_DATES_DATA_KEY = "verificationDates";
const WRITING_PRESENTED_AT_DATA_KEY = "writingPresentedAt";
const WRITING_REGISTERED_AT_DATA_KEY = "writingRegisteredAt";
const BRIEF_PRESENTED_STAGE = 3;
const BRIEF_REGISTERED_STAGE = 4;
const BRIEF_TABLE_ALIASES = new Set(["escritos-fondo", "escritos_fondo"]);
const PREVENTION_TABLE_ALIASES = new Set(["desahogo-prevenciones", "desahogo_prevenciones"]);

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeComparable(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTableKey(value?: string | null) {
  return normalizeComparable(value).replace(/[-\s]+/g, "_");
}

function getDataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function getStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function getDateDataValue(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = normalizeComparable(value);
    if (["1", "true", "si", "yes"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function isYesValue(value: unknown) {
  return ["si", "yes"].includes(normalizeComparable(typeof value === "string" ? value : ""));
}

function isTableAlias(tableCode: string | null | undefined, sourceTable: string | null | undefined, aliases: Set<string>) {
  return aliases.has(normalizeTableKey(tableCode)) || aliases.has(normalizeTableKey(sourceTable));
}

function isTrackingTermMarked(input: {
  tableCode?: string | null;
  sourceTable?: string | null;
  termDate?: Date | null;
  data: Record<string, unknown>;
}) {
  if (isTableAlias(input.tableCode, input.sourceTable, PREVENTION_TABLE_ALIASES)) {
    return true;
  }

  return normalizeBoolean(input.data[TERM_ENABLED_DATA_KEY]) === true || Boolean(input.termDate);
}

function enrichTrackingDataForKpis(input: {
  existingData?: unknown;
  payloadData?: unknown;
  moduleId?: string | null;
  tableCode?: string | null;
  sourceTable?: string | null;
  termDate?: Date | null;
  workflowStage?: number | null;
  previousWorkflowStage?: number | null;
}) {
  const data = {
    ...getDataRecord(input.existingData),
    ...getDataRecord(input.payloadData)
  };
  const todayKey = todayDateKey();

  if (input.moduleId === LITIGATION_MODULE_ID && isTrackingTermMarked({
    tableCode: input.tableCode,
    sourceTable: input.sourceTable,
    termDate: input.termDate,
    data
  }) && !getDateDataValue(data, TERM_MARKED_AT_DATA_KEY)) {
    data[TERM_MARKED_AT_DATA_KEY] = todayKey;
  }

  if (
    input.moduleId === LITIGATION_MODULE_ID
    && isTableAlias(input.tableCode, input.sourceTable, BRIEF_TABLE_ALIASES)
  ) {
    const workflowStage = input.workflowStage ?? 1;
    const previousWorkflowStage = input.previousWorkflowStage;

    if (workflowStage < BRIEF_PRESENTED_STAGE) {
      delete data[WRITING_PRESENTED_AT_DATA_KEY];
      delete data[WRITING_REGISTERED_AT_DATA_KEY];
    } else {
      if (
        (previousWorkflowStage !== undefined && previousWorkflowStage !== null && previousWorkflowStage < BRIEF_PRESENTED_STAGE)
        || !getDateDataValue(data, WRITING_PRESENTED_AT_DATA_KEY)
      ) {
        data[WRITING_PRESENTED_AT_DATA_KEY] = todayKey;
      }

      if (workflowStage < BRIEF_REGISTERED_STAGE) {
        delete data[WRITING_REGISTERED_AT_DATA_KEY];
      } else if (
        (previousWorkflowStage !== undefined && previousWorkflowStage !== null && previousWorkflowStage < BRIEF_REGISTERED_STAGE)
        || !getDateDataValue(data, WRITING_REGISTERED_AT_DATA_KEY)
      ) {
        data[WRITING_REGISTERED_AT_DATA_KEY] = todayKey;
      }
    }
  }

  return data;
}

function enrichTermDataForKpis(input: {
  existingData?: unknown;
  payloadData?: unknown;
  existingVerification?: unknown;
  payloadVerification?: unknown;
}) {
  const data = {
    ...getDataRecord(input.existingData),
    ...getDataRecord(input.payloadData)
  };
  const todayKey = todayDateKey();

  if (!getDateDataValue(data, TERM_MARKED_AT_DATA_KEY)) {
    data[TERM_MARKED_AT_DATA_KEY] = todayKey;
  }

  const existingVerification = getStringRecord(input.existingVerification);
  const payloadVerification = input.payloadVerification === undefined
    ? undefined
    : getStringRecord(input.payloadVerification);
  const nextVerification = payloadVerification ?? existingVerification;
  const verificationDates = getStringRecord(data[VERIFICATION_DATES_DATA_KEY]);
  const keys = new Set([...Object.keys(existingVerification), ...Object.keys(nextVerification)]);

  keys.forEach((key) => {
    const wasVerified = isYesValue(existingVerification[key]);
    const isVerified = isYesValue(nextVerification[key]);
    if (isVerified && (!wasVerified || !verificationDates[key])) {
      verificationDates[key] = todayKey;
    }
    if (payloadVerification && !isVerified) {
      delete verificationDates[key];
    }
  });

  data[VERIFICATION_DATES_DATA_KEY] = verificationDates;
  return data;
}

function getSourceTable(target: TaskDistributionTargetRecord) {
  return normalizeRequiredText(target.sourceTable) || normalizeRequiredText(target.tableCode);
}

export class PrismaTasksRepository implements TasksRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listModules() {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const moduleRecords = await this.prisma.$queryRaw<TaskModuleListRecord[]>(Prisma.sql`
      SELECT
        tm."id",
        tm."team",
        ut."label",
        CASE
          WHEN tm."summary" LIKE 'Espacio de tareas de % pendiente de configuracion.'
            OR tm."summary" = 'Espacio de tareas pendiente de configuracion.'
          THEN 'Espacio de tareas de ' || ut."label" || ' pendiente de configuracion.'
          ELSE tm."summary"
        END AS "summary",
        tm."isActive"
      FROM "TaskModule" AS tm
      INNER JOIN "UserTeam" AS ut
        ON ut."key" = tm."team"
        AND ut."organizationId" = ${organizationId}
      WHERE tm."isActive" = true
        AND ut."isActive" = true
        AND ut."executionSpaceEnabled" = true
      ORDER BY ut."sortOrder" ASC, ut."label" ASC, tm."id" ASC
    `);
    const [tracks, activeUsers] = await this.prisma.$transaction([
      moduleRecords.length > 0
        ? this.prisma.taskTrack.findMany({
            where: {
              moduleId: {
                in: moduleRecords.map((record) => record.id)
              }
            },
            orderBy: { createdAt: "asc" }
          })
        : this.prisma.taskTrack.findMany({
            where: {
              moduleId: {
                in: []
              }
            }
          }),
      this.prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { team: { not: null } },
            { secondaryTeam: { not: null } }
          ]
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          shortName: true,
          team: true,
          secondaryTeam: true,
          specificRole: true,
          secondarySpecificRole: true
        }
      })
    ]);
    const tracksByModule = new Map<string, typeof tracks>();
    for (const track of tracks) {
      tracksByModule.set(track.moduleId, [...(tracksByModule.get(track.moduleId) ?? []), track]);
    }

    const membersByTeam = new Map<string, TaskModuleMember[]>();
    for (const user of activeUsers) {
      const aliases = Array.from(new Set([
        user.shortName ?? "",
        user.displayName,
        user.username,
        user.specificRole ?? "",
        user.secondarySpecificRole ?? ""
      ].map((alias) => alias.trim()).filter(Boolean)));
      const teamAssignments = [
        { team: user.team, specificRole: user.specificRole },
        { team: user.secondaryTeam, specificRole: user.secondarySpecificRole }
      ];
      const addedTeams = new Set<string>();
      for (const assignment of teamAssignments) {
        if (!assignment.team || addedTeams.has(assignment.team)) {
          continue;
        }

        addedTeams.add(assignment.team);
        const member: TaskModuleMember = {
          id: user.shortName?.trim() || user.username || user.id,
          userId: user.id,
          name: user.displayName,
          aliases,
          shortName: user.shortName ?? undefined,
          specificRole: assignment.specificRole ?? undefined
        };

        membersByTeam.set(assignment.team, [...(membersByTeam.get(assignment.team) ?? []), member]);
      }
    }

    for (const members of membersByTeam.values()) {
      members.sort((left, right) => left.name.localeCompare(right.name));
    }

    return moduleRecords.map((record) => mapTaskModule({
      ...record,
      tracks: tracksByModule.get(record.id) ?? []
    }, membersByTeam.get(record.team) ?? []));
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
    const moduleId = normalizeRequiredText(payload.moduleId);
    const termDate = parseOptionalDateValue(payload.termDate);
    const workflowStage = payload.workflowStage ?? 1;
    const data = enrichTrackingDataForKpis({
      payloadData: payload.data,
      moduleId,
      tableCode,
      sourceTable,
      termDate,
      workflowStage
    });

    const record = await this.prisma.taskTrackingRecord.create({
      data: {
        moduleId,
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
        termDate,
        completedAt: parseOptionalDateValue(payload.completedAt),
        status: payload.status ?? "pendiente",
        workflowStage,
        reportedMonth: normalizeOptionalText(payload.reportedMonth),
        termId: normalizeOptionalText(payload.termId),
        data: toJsonValue(data) ?? {},
        deletedAt: parseOptionalDateValue(payload.deletedAt)
      }
    });

    return mapTaskTrackingRecord(record);
  }

  public async updateTrackingRecord(recordId: string, payload: TaskTrackingRecordWriteRecord) {
    const existingRecord = await this.prisma.taskTrackingRecord.findUnique({
      where: { id: recordId }
    });

    if (!existingRecord) {
      return null;
    }

    const nextModuleId = payload.moduleId ?? existingRecord.moduleId;
    const nextTableCode = payload.tableCode ?? existingRecord.tableCode;
    const nextSourceTable = payload.sourceTable ?? existingRecord.sourceTable;
    const nextTermDate = payload.termDate !== undefined ? parseOptionalDateValue(payload.termDate) : existingRecord.termDate;
    const nextWorkflowStage = payload.workflowStage ?? existingRecord.workflowStage;
    const nextData = enrichTrackingDataForKpis({
      existingData: existingRecord.data,
      payloadData: payload.data,
      moduleId: nextModuleId,
      tableCode: nextTableCode,
      sourceTable: nextSourceTable,
      termDate: nextTermDate,
      workflowStage: nextWorkflowStage,
      previousWorkflowStage: existingRecord.workflowStage
    });

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
        data: toJsonValue(nextData),
        deletedAt: parseOptionalDateValue(payload.deletedAt)
      }
    }).catch(() => null);

    if (record) {
      const termData: Prisma.TaskTermUpdateManyMutationInput = {};

      if (payload.dueDate !== undefined) {
        termData.dueDate = parseOptionalDateValue(payload.dueDate);
      }
      if (payload.termDate !== undefined) {
        termData.termDate = parseOptionalDateValue(payload.termDate);
      }
      if (payload.responsible !== undefined) {
        termData.responsible = payload.responsible;
      }
      if (payload.status !== undefined) {
        termData.status = payload.status;
      }
      if (payload.reportedMonth !== undefined) {
        termData.reportedMonth = normalizeOptionalText(payload.reportedMonth);
      }
      if (payload.deletedAt !== undefined) {
        termData.deletedAt = parseOptionalDateValue(payload.deletedAt);
      }

      if (Object.keys(termData).length > 0) {
        await this.prisma.taskTerm.updateMany({
          where: {
            OR: [
              { sourceRecordId: record.id },
              ...(record.termId ? [{ id: record.termId }] : [])
            ]
          },
          data: termData
        });
      }
    }

    return record ? mapTaskTrackingRecord(record) : null;
  }

  public async deleteTrackingRecord(recordId: string) {
    const record = await this.prisma.taskTrackingRecord.update({
      where: { id: recordId },
      data: { deletedAt: new Date() }
    }).catch(() => null);

    if (!record) {
      return;
    }

    await this.prisma.taskTerm.updateMany({
      where: {
        OR: [
          { sourceRecordId: record.id },
          ...(record.termId ? [{ id: record.termId }] : [])
        ]
      },
      data: { deletedAt: new Date() }
    });
  }

  public async listTerms(moduleId: string) {
    const records = await this.prisma.taskTerm.findMany({
      where: { moduleId, deletedAt: null },
      orderBy: [{ termDate: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }]
    });

    return records.map(mapTaskTerm);
  }

  public async createTerm(payload: TaskTermWriteRecord) {
    const verification = payload.verification ?? {};
    const data = enrichTermDataForKpis({
      payloadData: payload.data,
      payloadVerification: verification
    });

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
        verification: toJsonValue(verification) ?? {},
        data: toJsonValue(data) ?? {},
        deletedAt: parseOptionalDateValue(payload.deletedAt)
      }
    });

    return mapTaskTerm(record);
  }

  public async updateTerm(termId: string, payload: TaskTermWriteRecord) {
    const existingTerm = await this.prisma.taskTerm.findUnique({
      where: { id: termId }
    });

    if (!existingTerm) {
      return null;
    }

    const data = enrichTermDataForKpis({
      existingData: existingTerm.data,
      payloadData: payload.data,
      existingVerification: existingTerm.verification,
      payloadVerification: payload.verification
    });

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
        data: toJsonValue(data),
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
      const targetTables: string[] = [];
      const eventNamesPerTable: string[] = [];

      for (const [index, target] of payload.targets.entries()) {
        const sourceTable = getSourceTable(target);
        const tableCode = normalizeRequiredText(target.tableCode) || sourceTable;
        const taskName = normalizeRequiredText(target.taskName) || payload.eventName;
        const targetResponsible = target.responsible === undefined ? payload.responsible : target.responsible;
        const moduleId = normalizeRequiredText(payload.moduleId);
        const targetTermDate = parseOptionalDateValue(target.termDate);
        const targetWorkflowStage = target.workflowStage ?? 1;
        const trackingData = enrichTrackingDataForKpis({
          payloadData: {
            ...(target.data ?? {}),
            tableLabel: target.tableLabel
          },
          moduleId,
          tableCode,
          sourceTable,
          termDate: targetTermDate,
          workflowStage: targetWorkflowStage
        });
        targetTables.push(tableCode);

        const trackingRecord = await tx.taskTrackingRecord.create({
          data: {
            moduleId,
            tableCode,
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
            responsible: normalizeRequiredText(targetResponsible),
            dueDate: parseOptionalDateValue(target.dueDate),
            termDate: targetTermDate,
            status: target.status ?? "pendiente",
            workflowStage: targetWorkflowStage,
            reportedMonth: normalizeOptionalText(target.reportedMonth),
            data: toJsonValue(trackingData) ?? {}
          }
        });

        createdIds[`${tableCode}_${index}`] = trackingRecord.id;
        createdIds[`${sourceTable}_${index}`] = trackingRecord.id;
        createdIds[tableCode] = createdIds[tableCode] ?? trackingRecord.id;
        createdIds[sourceTable] = createdIds[sourceTable] ?? trackingRecord.id;
        eventNamesPerTable.push(taskName);

        if (target.createTerm) {
          const termData = enrichTermDataForKpis({
            payloadData: target.data
          });

          const term = await tx.taskTerm.create({
            data: {
              moduleId,
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
              responsible: normalizeRequiredText(targetResponsible),
              dueDate: parseOptionalDateValue(target.dueDate),
              termDate: targetTermDate,
              status: target.status ?? "pendiente",
              reportedMonth: normalizeOptionalText(target.reportedMonth),
              data: toJsonValue(termData) ?? {}
            }
          });

          createdIds[`term-${tableCode}_${index}`] = term.id;
          createdIds[`term-${sourceTable}_${index}`] = term.id;

          await tx.taskTrackingRecord.update({
            where: { id: trackingRecord.id },
            data: { termId: term.id }
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
        recurring: payload.recurring ?? false,
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
        recurring: payload.recurring,
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
