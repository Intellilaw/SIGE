import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { deriveEffectivePermissions, TASK_MODULES } from "@sige/contracts";
import { z } from "zod";

import { getSessionUser, requireAuth } from "../../core/auth/guards";

const legacyStatusSchema = z.enum(["pendiente", "presentado", "concluida"]);
const jsonRecordSchema = z.record(z.unknown());

const taskSchema = z.object({
  moduleId: z.string().min(2),
  trackId: z.string().min(2),
  clientName: z.string().min(2),
  matterId: z.string().optional(),
  matterNumber: z.string().optional(),
  subject: z.string().min(2),
  responsible: z.string().min(1),
  dueDate: z.string().min(1),
  state: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "MONTHLY_VIEW"]),
  recurring: z.boolean()
});

const updateStateSchema = z.object({
  state: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "MONTHLY_VIEW"])
});

const trackingRecordSchema = z.object({
  moduleId: z.string().min(2),
  tableCode: z.string().min(1),
  sourceTable: z.string().min(1),
  matterId: z.string().nullable().optional(),
  matterNumber: z.string().nullable().optional(),
  clientNumber: z.string().nullable().optional(),
  clientName: z.string().optional(),
  subject: z.string().optional(),
  specificProcess: z.string().nullable().optional(),
  matterIdentifier: z.string().nullable().optional(),
  taskName: z.string().optional(),
  eventName: z.string().nullable().optional(),
  responsible: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  termDate: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  status: legacyStatusSchema.optional(),
  workflowStage: z.number().int().positive().optional(),
  reportedMonth: z.string().nullable().optional(),
  termId: z.string().nullable().optional(),
  data: jsonRecordSchema.optional(),
  deletedAt: z.string().nullable().optional()
});

const trackingRecordPatchSchema = trackingRecordSchema.partial();

const termSchema = z.object({
  moduleId: z.string().min(2),
  sourceTable: z.string().nullable().optional(),
  sourceRecordId: z.string().nullable().optional(),
  matterId: z.string().nullable().optional(),
  matterNumber: z.string().nullable().optional(),
  clientNumber: z.string().nullable().optional(),
  clientName: z.string().optional(),
  subject: z.string().optional(),
  specificProcess: z.string().nullable().optional(),
  matterIdentifier: z.string().nullable().optional(),
  eventName: z.string().optional(),
  pendingTaskLabel: z.string().nullable().optional(),
  responsible: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  termDate: z.string().nullable().optional(),
  status: legacyStatusSchema.optional(),
  recurring: z.boolean().optional(),
  reportedMonth: z.string().nullable().optional(),
  verification: z.record(z.string()).optional(),
  data: jsonRecordSchema.optional(),
  deletedAt: z.string().nullable().optional()
});

const termPatchSchema = termSchema.partial();

const distributionEventSchema = z.object({
  moduleId: z.string().min(2),
  name: z.string().min(1),
  targetTables: z.array(z.string()).default([]),
  defaultTaskName: z.string().nullable().optional()
});

const distributionEventPatchSchema = distributionEventSchema.partial();

const distributionSchema = z.object({
  moduleId: z.string().min(2),
  matterId: z.string().nullable().optional(),
  matterNumber: z.string().nullable().optional(),
  clientNumber: z.string().nullable().optional(),
  clientName: z.string().optional(),
  subject: z.string().optional(),
  specificProcess: z.string().nullable().optional(),
  matterIdentifier: z.string().nullable().optional(),
  eventName: z.string().min(1),
  responsible: z.string().min(1),
  targets: z.array(z.object({
    tableCode: z.string().min(1),
    sourceTable: z.string().min(1),
    tableLabel: z.string().min(1),
    taskName: z.string().min(1),
    dueDate: z.string().nullable().optional(),
    termDate: z.string().nullable().optional(),
    status: legacyStatusSchema.optional(),
    workflowStage: z.number().int().positive().optional(),
    reportedMonth: z.string().nullable().optional(),
    createTerm: z.boolean().optional(),
    data: jsonRecordSchema.optional()
  })).min(1),
  data: jsonRecordSchema.optional()
});

const additionalTaskSchema = z.object({
  moduleId: z.string().min(2),
  task: z.string().min(1),
  responsible: z.string().min(1),
  responsible2: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  recurring: z.boolean().optional(),
  status: legacyStatusSchema.optional(),
  deletedAt: z.string().nullable().optional()
});

const additionalTaskPatchSchema = additionalTaskSchema.partial();

export const tasksRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.TasksService(app.repositories.tasks);
  const taskModuleIds = TASK_MODULES.map((module) => module.id);

  function getEffectivePermissions(request: FastifyRequest) {
    const user = getSessionUser(request);
    return deriveEffectivePermissions({
      legacyRole: user.legacyRole,
      team: user.team,
      legacyTeam: user.legacyTeam,
      specificRole: user.specificRole
    });
  }

  function canAccessTaskModule(request: FastifyRequest, moduleId?: string) {
    if (!moduleId) {
      return false;
    }

    const permissions = getEffectivePermissions(request);
    return permissions.includes("*") || permissions.includes("tasks:write") || permissions.includes(`tasks:${moduleId}`);
  }

  function assertTaskModuleAccess(request: FastifyRequest, moduleId?: string) {
    if (!moduleId || !canAccessTaskModule(request, moduleId)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
    }
  }

  function getAllowedTaskModuleIds(request: FastifyRequest) {
    return taskModuleIds.filter((moduleId) => canAccessTaskModule(request, moduleId));
  }

  async function findTaskItem(taskId: string) {
    return (await service.listTasks()).find((task) => task.id === taskId);
  }

  async function findTrackingRecord(recordId: string) {
    return (await service.listTrackingRecords({ includeDeleted: true })).find((record) => record.id === recordId);
  }

  async function findTerm(termId: string) {
    for (const moduleId of taskModuleIds) {
      const term = (await service.listTerms(moduleId)).find((candidate) => candidate.id === termId);
      if (term) {
        return term;
      }
    }

    return undefined;
  }

  async function findDistributionEvent(eventId: string) {
    for (const moduleId of taskModuleIds) {
      const event = (await service.listDistributionEvents(moduleId)).find((candidate) => candidate.id === eventId);
      if (event) {
        return event;
      }
    }

    return undefined;
  }

  async function findAdditionalTask(taskId: string) {
    for (const moduleId of taskModuleIds) {
      const task = (await service.listAdditionalTasks(moduleId)).find((candidate) => candidate.id === taskId);
      if (task) {
        return task;
      }
    }

    return undefined;
  }

  app.get("/tasks/modules", { preHandler: [requireAuth] }, async (request) => {
    const allowedModuleIds = new Set(getAllowedTaskModuleIds(request));
    const modules = await service.listModules();
    return modules.filter((module) => allowedModuleIds.has(module.id));
  });
  app.get("/tasks/items", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ moduleId: z.string().optional() }).parse(request.query);
    if (query.moduleId) {
      assertTaskModuleAccess(request, query.moduleId);
      return service.listTasks(query.moduleId);
    }

    const allowedModuleIds = new Set(getAllowedTaskModuleIds(request));
    return (await service.listTasks()).filter((task) => allowedModuleIds.has(task.moduleId));
  });
  app.post("/tasks/items", { preHandler: [requireAuth] }, async (request) => {
    const payload = taskSchema.parse(request.body);
    assertTaskModuleAccess(request, payload.moduleId);
    return service.create(payload);
  });
  app.patch("/tasks/items/:taskId/state", { preHandler: [requireAuth] }, async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const body = updateStateSchema.parse(request.body);
    const task = await findTaskItem(params.taskId);
    assertTaskModuleAccess(request, task?.moduleId);
    return service.updateState(params.taskId, body.state);
  });

  app.get("/tasks/tracking-records", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({
      moduleId: z.string().optional(),
      tableCode: z.string().optional(),
      includeDeleted: z.enum(["true", "false"]).optional()
    }).parse(request.query);
    if (query.moduleId) {
      assertTaskModuleAccess(request, query.moduleId);
      return service.listTrackingRecords({
        moduleId: query.moduleId,
        tableCode: query.tableCode,
        includeDeleted: query.includeDeleted === "true"
      });
    }

    const allowedModuleIds = new Set(getAllowedTaskModuleIds(request));
    const records = await service.listTrackingRecords({
      moduleId: query.moduleId,
      tableCode: query.tableCode,
      includeDeleted: query.includeDeleted === "true"
    });
    return records.filter((record) => allowedModuleIds.has(record.moduleId));
  });

  app.post("/tasks/tracking-records", { preHandler: [requireAuth] }, async (request) => {
    const payload = trackingRecordSchema.parse(request.body);
    assertTaskModuleAccess(request, payload.moduleId);
    return service.createTrackingRecord(payload);
  });

  app.patch("/tasks/tracking-records/:recordId", { preHandler: [requireAuth] }, async (request) => {
    const params = z.object({ recordId: z.string() }).parse(request.params);
    const payload = trackingRecordPatchSchema.parse(request.body);
    const record = await findTrackingRecord(params.recordId);
    assertTaskModuleAccess(request, payload.moduleId ?? record?.moduleId);
    return service.updateTrackingRecord(params.recordId, payload);
  });

  app.delete("/tasks/tracking-records/:recordId", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = z.object({ recordId: z.string() }).parse(request.params);
    const record = await findTrackingRecord(params.recordId);
    assertTaskModuleAccess(request, record?.moduleId);
    await service.deleteTrackingRecord(params.recordId);
    return reply.code(204).send();
  });

  app.get("/tasks/terms", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ moduleId: z.string().min(2) }).parse(request.query);
    assertTaskModuleAccess(request, query.moduleId);
    return service.listTerms(query.moduleId);
  });

  app.post("/tasks/terms", { preHandler: [requireAuth] }, async (request) => {
    const payload = termSchema.parse(request.body);
    assertTaskModuleAccess(request, payload.moduleId);
    return service.createTerm(payload);
  });

  app.patch("/tasks/terms/:termId", { preHandler: [requireAuth] }, async (request) => {
    const params = z.object({ termId: z.string() }).parse(request.params);
    const payload = termPatchSchema.parse(request.body);
    const term = await findTerm(params.termId);
    assertTaskModuleAccess(request, payload.moduleId ?? term?.moduleId);
    return service.updateTerm(params.termId, payload);
  });

  app.delete("/tasks/terms/:termId", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = z.object({ termId: z.string() }).parse(request.params);
    const term = await findTerm(params.termId);
    assertTaskModuleAccess(request, term?.moduleId);
    await service.deleteTerm(params.termId);
    return reply.code(204).send();
  });

  app.get("/tasks/distribution-events", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ moduleId: z.string().min(2) }).parse(request.query);
    assertTaskModuleAccess(request, query.moduleId);
    return service.listDistributionEvents(query.moduleId);
  });

  app.post("/tasks/distribution-events", { preHandler: [requireAuth] }, async (request) => {
    const payload = distributionEventSchema.parse(request.body);
    assertTaskModuleAccess(request, payload.moduleId);
    return service.createDistributionEvent(payload);
  });

  app.patch("/tasks/distribution-events/:eventId", { preHandler: [requireAuth] }, async (request) => {
    const params = z.object({ eventId: z.string() }).parse(request.params);
    const payload = distributionEventPatchSchema.parse(request.body);
    const event = await findDistributionEvent(params.eventId);
    assertTaskModuleAccess(request, payload.moduleId ?? event?.moduleId);
    return service.updateDistributionEvent(params.eventId, payload);
  });

  app.delete("/tasks/distribution-events/:eventId", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = z.object({ eventId: z.string() }).parse(request.params);
    const event = await findDistributionEvent(params.eventId);
    assertTaskModuleAccess(request, event?.moduleId);
    await service.deleteDistributionEvent(params.eventId);
    return reply.code(204).send();
  });

  app.get("/tasks/distributions", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ moduleId: z.string().min(2) }).parse(request.query);
    assertTaskModuleAccess(request, query.moduleId);
    return service.listDistributionHistory(query.moduleId);
  });

  app.post("/tasks/distributions", { preHandler: [requireAuth] }, async (request) => {
    const payload = distributionSchema.parse(request.body);
    assertTaskModuleAccess(request, payload.moduleId);
    return service.createDistribution(payload);
  });

  app.get("/tasks/additional", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ moduleId: z.string().min(2) }).parse(request.query);
    assertTaskModuleAccess(request, query.moduleId);
    return service.listAdditionalTasks(query.moduleId);
  });

  app.post("/tasks/additional", { preHandler: [requireAuth] }, async (request) => {
    const payload = additionalTaskSchema.parse(request.body);
    assertTaskModuleAccess(request, payload.moduleId);
    return service.createAdditionalTask(payload);
  });

  app.patch("/tasks/additional/:taskId", { preHandler: [requireAuth] }, async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const payload = additionalTaskPatchSchema.parse(request.body);
    const task = await findAdditionalTask(params.taskId);
    assertTaskModuleAccess(request, payload.moduleId ?? task?.moduleId);
    return service.updateAdditionalTask(params.taskId, payload);
  });

  app.delete("/tasks/additional/:taskId", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = await findAdditionalTask(params.taskId);
    assertTaskModuleAccess(request, task?.moduleId);
    await service.deleteAdditionalTask(params.taskId);
    return reply.code(204).send();
  });
};
