import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  EXECUTION_HOLIDAY_AUTHORITIES,
  MATTER_PROMOTION_COMMANDS,
  deriveEffectivePermissions,
  type Matter,
  type TaskItem,
  type TaskTerm,
  type TaskTrackingRecord
} from "@sige/contracts";

import { getSessionUser, requireAnyPermissions, requireAuth, requireRoles } from "../../core/auth/guards";
import { filterExternalVisibleMatters, isExternalScopedUser } from "../../core/auth/external-matter-access";
import { generateMatterRiExpiration, generateMatterRiInput, type RiMatterTaskContext } from "./matter-ri-input-generator";
import { enrichMatterTelegramGroupName, resolveTelegramGroupName } from "./telegram-group-name-resolver";
import { sendPromotionCommandToTelegram } from "./telegram-promotion-command-sender";

const teamSchema = z.enum([
  "CLIENT_RELATIONS",
  "FINANCE",
  "LITIGATION",
  "CORPORATE_LABOR",
  "SETTLEMENTS",
  "FINANCIAL_LAW",
  "TAX_COMPLIANCE",
  "ADMIN",
  "ADMIN_OPERATIONS"
]);

const executionHolidayAuthoritySchema = z.preprocess(
  (value) => (value === "PJCDMX" ? "TSJCDMX" : value),
  z.enum(EXECUTION_HOLIDAY_AUTHORITIES)
);

const matterSchema = z.object({
  clientId: z.string().nullable().optional(),
  clientNumber: z.string().nullable().optional(),
  clientName: z.string().optional(),
  quoteId: z.string().nullable().optional(),
  quoteNumber: z.string().nullable().optional(),
  commissionAssignee: z.string().nullable().optional(),
  matterType: z.enum(["ONE_TIME", "RETAINER"]).optional(),
  subject: z.string().optional(),
  specificProcess: z.string().nullable().optional(),
  totalFeesMxn: z.number().nonnegative().optional(),
  responsibleTeam: teamSchema.nullable().optional(),
  nextPaymentDate: z.string().nullable().optional(),
  communicationChannel: z.enum(["WHATSAPP", "TELEGRAM", "WECHAT", "EMAIL", "PHONE"]).optional(),
  r1InternalCreated: z.boolean().optional(),
  telegramBotLinked: z.boolean().optional(),
  rdCreated: z.boolean().optional(),
  rfCreated: z.enum(["YES", "NO", "NOT_REQUIRED"]).optional(),
  r1ExternalCreated: z.boolean().optional(),
  billingChatCreated: z.boolean().optional(),
  matterIdentifier: z.string().nullable().optional(),
  executionLinkedModule: z.string().nullable().optional(),
  executionLinkedAt: z.string().nullable().optional(),
  executionPrompt: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  expirationRiOutput: z.string().nullable().optional(),
  promotionCommand: z.enum(MATTER_PROMOTION_COMMANDS).nullable().optional(),
  holidayAuthorityShortName: executionHolidayAuthoritySchema.nullable().optional(),
  internalTelegramGroupId: z.string().nullable().optional(),
  internalTelegramGroupName: z.string().nullable().optional(),
  nextAction: z.string().nullable().optional(),
  nextActionDueAt: z.string().nullable().optional(),
  nextActionSource: z.string().nullable().optional(),
  visibility: z.string().nullable().optional(),
  milestone: z.string().nullable().optional(),
  concluded: z.boolean().optional(),
  stage: z.enum(["INTAKE", "EXECUTION", "CLOSED"]).optional(),
  origin: z.enum(["MANUAL", "LEAD", "QUOTE"]).optional(),
  notes: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional()
});

const executionSubmatterSchema = z.object({
  sortOrder: z.number().int().nonnegative().optional(),
  specificProcess: z.string().nullable().optional(),
  matterIdentifier: z.string().nullable().optional(),
  communicationChannel: z.enum(["WHATSAPP", "TELEGRAM", "WECHAT", "EMAIL", "PHONE"]).optional(),
  executionPrompt: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  expirationRiOutput: z.string().nullable().optional(),
  promotionCommand: z.enum(MATTER_PROMOTION_COMMANDS).nullable().optional(),
  holidayAuthorityShortName: executionHolidayAuthoritySchema.nullable().optional(),
  internalTelegramGroupId: z.string().nullable().optional(),
  internalTelegramGroupName: z.string().nullable().optional(),
  concluded: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional()
});

const matterIdParamsSchema = z.object({
  matterId: z.string().min(1)
});

const executionSubmatterParamsSchema = matterIdParamsSchema.extend({
  submatterId: z.string().min(1)
});

const bulkTrashSchema = z.object({
  ids: z.array(z.string().min(1)).min(1)
});

const promotionCommandPayloadSchema = z.object({
  taskName: z.string().trim().min(1)
});

const executionPermissionByTeam = {
  LITIGATION: "execution:litigation",
  CORPORATE_LABOR: "execution:corporate-labor",
  SETTLEMENTS: "execution:settlements",
  FINANCIAL_LAW: "execution:financial-law",
  TAX_COMPLIANCE: "execution:tax-compliance"
} as const;

type ExecutionTeam = keyof typeof executionPermissionByTeam;
const EXECUTION_ALL_PERMISSION = "execution:all";
const executionModuleByTeam: Partial<Record<ExecutionTeam, string>> = {
  LITIGATION: "litigation",
  CORPORATE_LABOR: "corporate-labor",
  SETTLEMENTS: "settlements",
  FINANCIAL_LAW: "financial-law",
  TAX_COMPLIANCE: "tax-compliance"
};

function isFinanceNextPaymentDatePatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "nextPaymentDate";
}

function isExecutionMatterPatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const allowedKeys = new Set([
    "executionPrompt",
    "expirationDate",
    "expirationRiOutput",
    "promotionCommand",
    "concluded",
    "notes",
    "holidayAuthorityShortName",
    "internalTelegramGroupId"
  ]);
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => allowedKeys.has(key));
}

function isExecutionSubmatterPatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const allowedKeys = new Set(Object.keys(executionSubmatterSchema.shape));
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => allowedKeys.has(key));
}

function isExecutionTeam(value?: string | null): value is ExecutionTeam {
  return Boolean(value && value in executionPermissionByTeam);
}

function hasAllExecutionAccess(permissions: string[]) {
  return permissions.includes("*") || permissions.includes(EXECUTION_ALL_PERMISSION);
}

function canAccessExecutionMatter(params: { permissions: string[]; responsibleTeam?: string | null }) {
  if (!isExecutionTeam(params.responsibleTeam)) {
    return false;
  }

  if (hasAllExecutionAccess(params.permissions)) {
    return true;
  }

  const permission = executionPermissionByTeam[params.responsibleTeam];
  return Boolean(permission && (params.permissions.includes("*") || params.permissions.includes(permission)));
}

function getEffectivePermissionsForRequest(request: FastifyRequest) {
  const user = getSessionUser(request);
  return deriveEffectivePermissions({
    legacyRole: user.legacyRole,
    team: user.team,
    legacyTeam: user.legacyTeam,
    secondaryTeam: user.secondaryTeam,
    secondaryLegacyTeam: user.secondaryLegacyTeam,
    specificRole: user.specificRole,
    secondarySpecificRole: user.secondarySpecificRole,
    permissions: user.permissions,
    isExternal: user.isExternal
  });
}

function getExecutionReadableTeams(request: FastifyRequest, permissions: string[]) {
  if (permissions.includes(EXECUTION_ALL_PERMISSION)) {
    return Object.keys(executionPermissionByTeam) as ExecutionTeam[];
  }

  const user = getSessionUser(request);
  const teams = [user.team, user.secondaryTeam]
    .filter((team): team is ExecutionTeam => isExecutionTeam(team));
  const readableTeams = teams.filter((team) => {
    const permission = executionPermissionByTeam[team];
    return Boolean(permission && permissions.includes(permission));
  });

  return Array.from(new Set(readableTeams));
}

function canReadAllMatters(permissions: string[]) {
  return permissions.includes("*") || permissions.includes("matters:read") || permissions.includes("matters:write");
}

function buildMatterMatchKeys(matter: Matter) {
  return new Set([
    matter.id,
    matter.matterNumber,
    matter.matterIdentifier
  ].map((value) => (value ?? "").trim()).filter(Boolean));
}

function matchesMatter(keys: Set<string>, ...values: Array<string | null | undefined>) {
  return values.some((value) => {
    const normalized = (value ?? "").trim();
    return normalized.length > 0 && keys.has(normalized);
  });
}

function taskItemToRiTask(task: TaskItem): RiMatterTaskContext {
  return {
    source: `Tareas activas / ${task.moduleId}`,
    subject: task.subject,
    responsible: task.responsible,
    dueDate: task.dueDate,
    status: task.state
  };
}

function trackingRecordToRiTask(task: TaskTrackingRecord): RiMatterTaskContext {
  return {
    source: `Seguimiento / ${task.sourceTable || task.tableCode}`,
    subject: task.subject || task.taskName,
    responsible: task.responsible,
    dueDate: task.dueDate ?? task.termDate,
    status: task.status
  };
}

function termToRiTask(task: TaskTerm): RiMatterTaskContext {
  return {
    source: `Terminos / ${task.sourceTable || task.moduleId}`,
    subject: task.pendingTaskLabel || task.eventName || task.subject,
    responsible: task.responsible,
    dueDate: task.dueDate ?? task.termDate,
    status: task.status
  };
}

async function listRiTaskContext(app: FastifyInstance, matter: Matter) {
  const moduleId = matter.executionLinkedModule ??
    (isExecutionTeam(matter.responsibleTeam) ? executionModuleByTeam[matter.responsibleTeam] : undefined);
  if (!moduleId) {
    return [];
  }

  const keys = buildMatterMatchKeys(matter);
  const [taskItems, trackingRecords, terms] = await Promise.all([
    app.repositories.tasks.listTasks(moduleId),
    app.repositories.tasks.listTrackingRecords({ moduleId }),
    app.repositories.tasks.listTerms(moduleId)
  ]);

  return [
    ...taskItems
      .filter((task) => task.state !== "COMPLETED")
      .filter((task) => matchesMatter(keys, task.matterId, task.matterNumber))
      .map(taskItemToRiTask),
    ...trackingRecords
      .filter((task) => task.status === "pendiente" && !task.deletedAt)
      .filter((task) => matchesMatter(keys, task.matterId, task.matterNumber, task.matterIdentifier))
      .map(trackingRecordToRiTask),
    ...terms
      .filter((task) => task.status === "pendiente" && !task.deletedAt)
      .filter((task) => matchesMatter(keys, task.matterId, task.matterNumber, task.matterIdentifier))
      .map(termToRiTask)
  ].slice(0, 20);
}

async function assertCanWriteExecutionMatter(app: FastifyInstance, request: FastifyRequest, matterId: string) {
  const permissions = getEffectivePermissionsForRequest(request);
  const records = await new app.services.MattersService(app.repositories.matters).list();
  const currentMatter = records.find((matter) => matter.id === matterId);

  if (!currentMatter) {
    throw new app.errors.AppError(404, "MATTER_NOT_FOUND", "The requested matter does not exist.");
  }

  const canWriteMatters = permissions.includes("*") || permissions.includes("matters:write");
  const canUpdateExecutionMatter = canAccessExecutionMatter({
    permissions,
    responsibleTeam: currentMatter.responsibleTeam
  });

  if (!canWriteMatters && !canUpdateExecutionMatter) {
    throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
  }

  return currentMatter;
}

async function enrichExecutionSubmatterTelegramGroupName<T extends {
  internalTelegramGroupId?: string | null;
  internalTelegramGroupName?: string | null;
}>(
  payload: T,
  currentInternalTelegramGroupId?: string | null,
  logger?: { warn: (message: string) => void }
): Promise<T> {
  if (!Object.prototype.hasOwnProperty.call(payload, "internalTelegramGroupId")) {
    return payload;
  }

  const nextGroupId = (payload.internalTelegramGroupId ?? "").trim();
  if (!nextGroupId) {
    return {
      ...payload,
      internalTelegramGroupId: null,
      internalTelegramGroupName: null
    };
  }

  const groupName = await resolveTelegramGroupName(nextGroupId, logger);
  if (groupName) {
    return {
      ...payload,
      internalTelegramGroupId: nextGroupId,
      internalTelegramGroupName: groupName
    };
  }

  if (nextGroupId !== (currentInternalTelegramGroupId ?? "").trim()) {
    return {
      ...payload,
      internalTelegramGroupId: nextGroupId,
      internalTelegramGroupName: null
    };
  }

  return {
    ...payload,
    internalTelegramGroupId: nextGroupId
  };
}

export const mattersRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.MattersService(app.repositories.matters);
  const writeGuards = [requireAuth, requireAnyPermissions(["matters:write"])];
  const superadminGuards = [requireAuth, requireRoles(["SUPERADMIN"])];

  app.get("/matters", { preHandler: [requireAuth] }, async (request) => {
    const user = getSessionUser(request);
    const permissions = getEffectivePermissionsForRequest(request);
    const records = await service.list();

    if (isExternalScopedUser(user) && permissions.includes("external-matters:read")) {
      return filterExternalVisibleMatters(user, records);
    }

    if (canReadAllMatters(permissions)) {
      return records;
    }

    const executionTeams = getExecutionReadableTeams(request, permissions);
    if (executionTeams.length > 0) {
      const readableTeams = new Set(executionTeams);
      return records.filter((matter) => isExecutionTeam(matter.responsibleTeam) && readableTeams.has(matter.responsibleTeam));
    }

    throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
  });

  app.get("/matters/recycle-bin", { preHandler: [requireAuth] }, async (request) => {
    const user = getSessionUser(request);
    const permissions = getEffectivePermissionsForRequest(request);
    const records = await service.listDeleted();

    if (isExternalScopedUser(user)) {
      return [];
    }

    if (canReadAllMatters(permissions)) {
      return records;
    }

    const executionTeams = getExecutionReadableTeams(request, permissions);
    if (executionTeams.length > 0) {
      const readableTeams = new Set(executionTeams);
      return records.filter((matter) => isExecutionTeam(matter.responsibleTeam) && readableTeams.has(matter.responsibleTeam));
    }

    throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
  });

  app.get("/matters/short-names", { preHandler: [requireAuth] }, async (request) => {
    const user = getSessionUser(request);
    const permissions = getEffectivePermissionsForRequest(request);
    if (isExternalScopedUser(user) && permissions.includes("external-matters:read")) {
      return [];
    }

    if (canReadAllMatters(permissions)) {
      return service.listCommissionShortNames();
    }

    throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
  });
  app.get("/matters/visibility-options", { preHandler: [requireAuth] }, async (request) => {
    const user = getSessionUser(request);
    const permissions = getEffectivePermissionsForRequest(request);
    if (isExternalScopedUser(user) && permissions.includes("external-matters:read")) {
      return user.shortName ? [user.shortName] : [];
    }

    if (canReadAllMatters(permissions)) {
      return service.listVisibilityOptions();
    }

    throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
  });

  app.post("/matters", { preHandler: writeGuards }, async (request) => {
    const payload = matterSchema.partial().parse(request.body ?? {});
    return service.create(payload);
  });

  app.patch("/matters/:matterId", { preHandler: [requireAuth] }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    const permissions = getEffectivePermissionsForRequest(request);
    const matterRecords = await service.list();
    const currentMatter = matterRecords.find((matter) => matter.id === params.matterId);
    const canWriteMatters = permissions.includes("*") || permissions.includes("matters:write");
    const canUpdateFinanceDate = permissions.includes("*") || (
      permissions.includes("finances:write") && isFinanceNextPaymentDatePatch(request.body)
    );
    const canUpdateExecutionMatter = isExecutionMatterPatch(request.body) && canAccessExecutionMatter({
      permissions,
      responsibleTeam: currentMatter?.responsibleTeam
    });

    if (!canWriteMatters && !canUpdateFinanceDate && !canUpdateExecutionMatter) {
      throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
    }

    const payload = await enrichMatterTelegramGroupName(matterSchema.parse(request.body), {
      currentInternalTelegramGroupId: currentMatter?.internalTelegramGroupId,
      logger: app.log
    });
    return service.update(params.matterId, payload);
  });

  app.post("/matters/:matterId/generate-ri-input", { preHandler: [requireAuth] }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    const permissions = getEffectivePermissionsForRequest(request);
    const matterRecords = await service.list();
    const currentMatter = matterRecords.find((matter) => matter.id === params.matterId);

    if (!currentMatter) {
      throw new app.errors.AppError(404, "MATTER_NOT_FOUND", "The requested matter does not exist.");
    }

    const canWriteMatters = permissions.includes("*") || permissions.includes("matters:write");
    const canUpdateExecutionMatter = canAccessExecutionMatter({
      permissions,
      responsibleTeam: currentMatter.responsibleTeam
    });

    if (!canWriteMatters && !canUpdateExecutionMatter) {
      throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
    }

    const tasks = await listRiTaskContext(app, currentMatter);
    const executionPrompt = await generateMatterRiInput({
      matter: currentMatter,
      tasks
    });

    return service.update(params.matterId, { executionPrompt });
  });

  app.post("/matters/:matterId/generate-ri-expiration", { preHandler: [requireAuth] }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    const permissions = getEffectivePermissionsForRequest(request);
    const matterRecords = await service.list();
    const currentMatter = matterRecords.find((matter) => matter.id === params.matterId);

    if (!currentMatter) {
      throw new app.errors.AppError(404, "MATTER_NOT_FOUND", "The requested matter does not exist.");
    }

    const canWriteMatters = permissions.includes("*") || permissions.includes("matters:write");
    const canUpdateExecutionMatter = canAccessExecutionMatter({
      permissions,
      responsibleTeam: currentMatter.responsibleTeam
    });

    if (!canWriteMatters && !canUpdateExecutionMatter) {
      throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
    }

    if (currentMatter.responsibleTeam !== "LITIGATION") {
      throw new app.errors.AppError(
        400,
        "RI_EXPIRATION_ONLY_FOR_LITIGATION",
        "La Caducidad RI-004 solo esta disponible para asuntos de Litigio."
      );
    }

    const tasks = await listRiTaskContext(app, currentMatter);
    const expirationResult = await generateMatterRiExpiration({
      matter: currentMatter,
      tasks
    });

    return service.update(params.matterId, expirationResult);
  });

  app.post("/matters/:matterId/send-promotion-command", { preHandler: [requireAuth] }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    const payload = promotionCommandPayloadSchema.parse(request.body ?? {});
    const permissions = getEffectivePermissionsForRequest(request);
    const matterRecords = await service.list();
    const currentMatter = matterRecords.find((matter) => matter.id === params.matterId);

    if (!currentMatter) {
      throw new app.errors.AppError(404, "MATTER_NOT_FOUND", "The requested matter does not exist.");
    }

    const canWriteMatters = permissions.includes("*") || permissions.includes("matters:write");
    const canUpdateExecutionMatter = canAccessExecutionMatter({
      permissions,
      responsibleTeam: currentMatter.responsibleTeam
    });

    if (!canWriteMatters && !canUpdateExecutionMatter) {
      throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
    }

    return sendPromotionCommandToTelegram({
      matter: currentMatter,
      taskName: payload.taskName,
      logger: app.log
    });
  });

  app.post("/matters/:matterId/execution-submatters", { preHandler: [requireAuth] }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    const currentMatter = await assertCanWriteExecutionMatter(app, request, params.matterId);
    const payload = await enrichExecutionSubmatterTelegramGroupName(
      executionSubmatterSchema.partial().parse(request.body ?? {}),
      currentMatter.internalTelegramGroupId,
      app.log
    );

    return service.createExecutionSubmatter(params.matterId, payload);
  });

  app.patch("/matters/:matterId/execution-submatters/:submatterId", { preHandler: [requireAuth] }, async (request) => {
    const params = executionSubmatterParamsSchema.parse(request.params);

    if (!isExecutionSubmatterPatch(request.body)) {
      throw new app.errors.AppError(400, "INVALID_SUBMATTER_PATCH", "Invalid execution submatter payload.");
    }

    const currentMatter = await assertCanWriteExecutionMatter(app, request, params.matterId);
    const currentSubmatter = currentMatter.executionSubmatters?.find((submatter) => submatter.id === params.submatterId);
    const payload = await enrichExecutionSubmatterTelegramGroupName(
      executionSubmatterSchema.parse(request.body),
      currentSubmatter?.internalTelegramGroupId,
      app.log
    );

    return service.updateExecutionSubmatter(params.matterId, params.submatterId, payload);
  });

  app.delete("/matters/:matterId/execution-submatters/:submatterId", { preHandler: [requireAuth] }, async (request) => {
    const params = executionSubmatterParamsSchema.parse(request.params);
    await assertCanWriteExecutionMatter(app, request, params.matterId);
    return service.deleteExecutionSubmatter(params.matterId, params.submatterId);
  });

  app.post("/matters/bulk-trash", { preHandler: writeGuards }, async (request, reply) => {
    const payload = bulkTrashSchema.parse(request.body);
    await service.bulkTrash(payload.ids);
    reply.code(204);
    return null;
  });

  app.post("/matters/bulk-delete", { preHandler: superadminGuards }, async (request, reply) => {
    const payload = bulkTrashSchema.parse(request.body);
    await service.bulkDelete(payload.ids);
    reply.code(204);
    return null;
  });

  app.post("/matters/:matterId/trash", { preHandler: writeGuards }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    return service.trash(params.matterId);
  });

  app.post("/matters/:matterId/restore", { preHandler: [requireAuth] }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    const permissions = getEffectivePermissionsForRequest(request);

    if (!permissions.includes("*") && !permissions.includes("matters:write")) {
      const deletedMatter = (await service.listDeleted()).find((matter) => matter.id === params.matterId);
      if (!canAccessExecutionMatter({
        permissions,
        responsibleTeam: deletedMatter?.responsibleTeam
      })) {
        throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
      }
    }

    return service.restore(params.matterId);
  });

  app.post("/matters/:matterId/generate-identifier", { preHandler: writeGuards }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    return service.generateIdentifier(params.matterId);
  });

  app.post("/matters/:matterId/send-to-execution", { preHandler: writeGuards }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    return service.sendToExecution(params.matterId);
  });
};
