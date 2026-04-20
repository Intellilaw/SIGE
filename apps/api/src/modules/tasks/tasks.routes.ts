import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth } from "../../core/auth/guards";

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
  status: legacyStatusSchema.optional(),
  deletedAt: z.string().nullable().optional()
});

const additionalTaskPatchSchema = additionalTaskSchema.partial();

export const tasksRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.TasksService(app.repositories.tasks);

  app.get("/tasks/modules", { preHandler: [requireAuth] }, async () => service.listModules());
  app.get("/tasks/items", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ moduleId: z.string().optional() }).parse(request.query);
    return service.listTasks(query.moduleId);
  });
  app.post("/tasks/items", { preHandler: [requireAuth] }, async (request) => {
    const payload = taskSchema.parse(request.body);
    return service.create(payload);
  });
  app.patch("/tasks/items/:taskId/state", { preHandler: [requireAuth] }, async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const body = updateStateSchema.parse(request.body);
    return service.updateState(params.taskId, body.state);
  });

  app.get("/tasks/tracking-records", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({
      moduleId: z.string().optional(),
      tableCode: z.string().optional(),
      includeDeleted: z.enum(["true", "false"]).optional()
    }).parse(request.query);
    return service.listTrackingRecords({
      moduleId: query.moduleId,
      tableCode: query.tableCode,
      includeDeleted: query.includeDeleted === "true"
    });
  });

  app.post("/tasks/tracking-records", { preHandler: [requireAuth] }, async (request) => {
    return service.createTrackingRecord(trackingRecordSchema.parse(request.body));
  });

  app.patch("/tasks/tracking-records/:recordId", { preHandler: [requireAuth] }, async (request) => {
    const params = z.object({ recordId: z.string() }).parse(request.params);
    return service.updateTrackingRecord(params.recordId, trackingRecordPatchSchema.parse(request.body));
  });

  app.delete("/tasks/tracking-records/:recordId", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = z.object({ recordId: z.string() }).parse(request.params);
    await service.deleteTrackingRecord(params.recordId);
    return reply.code(204).send();
  });

  app.get("/tasks/terms", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ moduleId: z.string().min(2) }).parse(request.query);
    return service.listTerms(query.moduleId);
  });

  app.post("/tasks/terms", { preHandler: [requireAuth] }, async (request) => {
    return service.createTerm(termSchema.parse(request.body));
  });

  app.patch("/tasks/terms/:termId", { preHandler: [requireAuth] }, async (request) => {
    const params = z.object({ termId: z.string() }).parse(request.params);
    return service.updateTerm(params.termId, termPatchSchema.parse(request.body));
  });

  app.delete("/tasks/terms/:termId", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = z.object({ termId: z.string() }).parse(request.params);
    await service.deleteTerm(params.termId);
    return reply.code(204).send();
  });

  app.get("/tasks/distribution-events", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ moduleId: z.string().min(2) }).parse(request.query);
    return service.listDistributionEvents(query.moduleId);
  });

  app.post("/tasks/distribution-events", { preHandler: [requireAuth] }, async (request) => {
    return service.createDistributionEvent(distributionEventSchema.parse(request.body));
  });

  app.patch("/tasks/distribution-events/:eventId", { preHandler: [requireAuth] }, async (request) => {
    const params = z.object({ eventId: z.string() }).parse(request.params);
    return service.updateDistributionEvent(params.eventId, distributionEventPatchSchema.parse(request.body));
  });

  app.delete("/tasks/distribution-events/:eventId", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = z.object({ eventId: z.string() }).parse(request.params);
    await service.deleteDistributionEvent(params.eventId);
    return reply.code(204).send();
  });

  app.get("/tasks/distributions", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ moduleId: z.string().min(2) }).parse(request.query);
    return service.listDistributionHistory(query.moduleId);
  });

  app.post("/tasks/distributions", { preHandler: [requireAuth] }, async (request) => {
    return service.createDistribution(distributionSchema.parse(request.body));
  });

  app.get("/tasks/additional", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ moduleId: z.string().min(2) }).parse(request.query);
    return service.listAdditionalTasks(query.moduleId);
  });

  app.post("/tasks/additional", { preHandler: [requireAuth] }, async (request) => {
    return service.createAdditionalTask(additionalTaskSchema.parse(request.body));
  });

  app.patch("/tasks/additional/:taskId", { preHandler: [requireAuth] }, async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    return service.updateAdditionalTask(params.taskId, additionalTaskPatchSchema.parse(request.body));
  });

  app.delete("/tasks/additional/:taskId", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    await service.deleteAdditionalTask(params.taskId);
    return reply.code(204).send();
  });
};
