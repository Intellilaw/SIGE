import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { deriveEffectivePermissions } from "@sige/contracts";
import { z } from "zod";

import { getSessionUser, requireAuth } from "../../core/auth/guards";
import { AppError } from "../../core/errors/app-error";
import { prisma } from "../../lib/prisma";
import { getGoogleWorkspaceConfigurationStatus } from "./google-workspace.client";

const emailList = z.array(z.string().trim().email()).max(500).default([]);
const attachmentSchema = z.object({ name: z.string().min(1).max(180), size: z.number().int().nonnegative(), type: z.string().max(120) });
const messageSchema = z.object({
  teamKey: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  senderEmail: z.string().trim().email().refine((value) => value.toLowerCase().endsWith("@rusconi.law"), "El remitente debe pertenecer a @rusconi.law."),
  toRecipients: emailList,
  ccRecipients: emailList,
  bccRecipients: emailList,
  subject: z.string().trim().min(1).max(998),
  bodyHtml: z.string().max(250_000),
  signatureText: z.string().max(10_000).nullable().optional(),
  attachments: z.array(attachmentSchema).max(20).default([]),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]),
  interval: z.number().int().min(1).max(365).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable().optional(),
  timezone: z.string().min(1).max(80).default("America/Mexico_City"),
  nonBusinessDayPolicy: z.enum(["PREVIOUS_BUSINESS_DAY", "NEXT_BUSINESS_DAY", "SEND_ANYWAY"]),
  nonBusinessOverrideAck: z.boolean().default(false),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED")
}).superRefine((value, context) => {
  if (value.toRecipients.length + value.ccRecipients.length + value.bccRecipients.length === 0) {
    context.addIssue({ code: "custom", path: ["toRecipients"], message: "Agrega al menos un destinatario." });
  }
  if (value.nonBusinessDayPolicy === "SEND_ANYWAY" && !value.nonBusinessOverrideAck) {
    context.addIssue({ code: "custom", path: ["nonBusinessOverrideAck"], message: "Debes confirmar el envío en día inhábil." });
  }
  if (value.endAt && new Date(value.endAt) < new Date(value.startAt)) {
    context.addIssue({ code: "custom", path: ["endAt"], message: "La fecha final debe ser posterior al inicio." });
  }
});

function permissionsFor(request: FastifyRequest) {
  const user = getSessionUser(request);
  return deriveEffectivePermissions(user);
}

function canAccessModule(request: FastifyRequest, moduleId: string) {
  const permissions = permissionsFor(request);
  return permissions.includes("*") || permissions.includes("tasks:write") || permissions.includes(`tasks:${moduleId}`)
    || permissions.includes("execution:all") || permissions.includes(`execution:${moduleId}`);
}

async function assertModuleAccess(request: FastifyRequest, moduleId: string) {
  if (!canAccessModule(request, moduleId)) {
    throw new AppError(403, "PERIODIC_MESSAGES_FORBIDDEN", "No tienes acceso a los mensajes programados de este equipo.");
  }
}

async function assertSenderBelongsToModule(request: FastifyRequest, moduleId: string, senderEmail: string) {
  const user = getSessionUser(request);
  const records = await prisma.$queryRaw<Array<{ email: string }>>`
    SELECT u."email"
    FROM "User" u
    INNER JOIN "TaskModule" tm ON tm."id" = ${moduleId}
    WHERE u."organizationId" = ${user.organizationId}
      AND u."isActive" = true
      AND lower(u."email") LIKE '%@rusconi.law'
      AND (u."legacyTeam" = tm."team" OR u."secondaryLegacyTeam" = tm."team" OR u."team" = tm."team" OR u."secondaryTeam" = tm."team")
  `;
  if (!records.some((record) => record.email.toLowerCase() === senderEmail.toLowerCase())) {
    throw new AppError(403, "PERIODIC_MESSAGE_SENDER_FORBIDDEN", "El remitente no está activo o no pertenece a este equipo.");
  }
}

async function assertSenderConnected(request: FastifyRequest, senderEmail: string) {
  const user = getSessionUser(request);
  const connection = await prisma.googleWorkspaceConnection.findFirst({ where: {
    organizationId: user.organizationId, email: senderEmail.toLowerCase(), status: "ACTIVE", refreshTokenCiphertext: { not: null }
  } });
  if (!connection) throw new AppError(409, "PERIODIC_MESSAGE_SENDER_NOT_CONNECTED", "El remitente debe conectar su cuenta de Google Workspace antes de activar la programación.");
}

export const periodicMessagesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/periodic-messages/config", { preHandler: [requireAuth] }, async (request) => {
    const user = getSessionUser(request);
    const [configuration, connectedSenders] = await Promise.all([
      getGoogleWorkspaceConfigurationStatus(),
      prisma.googleWorkspaceConnection.count({ where: { organizationId: user.organizationId, status: "ACTIVE", refreshTokenCiphertext: { not: null } } })
    ]);
    return { deliveryEnabled: configuration.configured && connectedSenders > 0, oauthConfigured: configuration.configured, connectedSenders,
      provider: "GOOGLE_WORKSPACE", notice: configuration.configured ? "Google Workspace listo para conectar y utilizar remitentes." : configuration.error };
  });

  app.get("/periodic-messages/teams", { preHandler: [requireAuth] }, async (request) => {
    const service = new app.services.TasksService(app.repositories.tasks);
    return (await service.listModules()).filter((module) => canAccessModule(request, module.id));
  });

  app.get("/periodic-messages/senders", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ teamKey: z.string().min(1) }).parse(request.query);
    await assertModuleAccess(request, query.teamKey);
    const user = getSessionUser(request);
    return prisma.$queryRaw<Array<{ id: string; email: string; displayName: string; connectionStatus: string; connectedAt: Date | null }>>`
      SELECT u."id", u."email", u."displayName", COALESCE(gwc."status", 'NOT_CONNECTED') AS "connectionStatus", gwc."connectedAt"
      FROM "User" u
      INNER JOIN "TaskModule" tm ON tm."id" = ${query.teamKey}
      LEFT JOIN "GoogleWorkspaceConnection" gwc ON gwc."organizationId" = u."organizationId" AND lower(gwc."email") = lower(u."email")
      WHERE u."organizationId" = ${user.organizationId}
        AND u."isActive" = true
        AND lower(u."email") LIKE '%@rusconi.law'
        AND (u."legacyTeam" = tm."team" OR u."secondaryLegacyTeam" = tm."team" OR u."team" = tm."team" OR u."secondaryTeam" = tm."team")
      ORDER BY u."displayName" ASC
    `;
  });

  app.get("/periodic-messages", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ teamKey: z.string().min(1) }).parse(request.query);
    await assertModuleAccess(request, query.teamKey);
    const user = getSessionUser(request);
    return prisma.periodicMessage.findMany({
      where: { organizationId: user.organizationId, teamKey: query.teamKey, deletedAt: null },
      orderBy: [{ status: "asc" }, { nextRunAt: "asc" }, { createdAt: "desc" }]
    });
  });

  app.get("/periodic-messages/:messageId/deliveries", { preHandler: [requireAuth] }, async (request) => {
    const { messageId } = z.object({ messageId: z.string().uuid() }).parse(request.params);
    const user = getSessionUser(request);
    const message = await prisma.periodicMessage.findFirstOrThrow({ where: { id: messageId, organizationId: user.organizationId, deletedAt: null } });
    await assertModuleAccess(request, message.teamKey);
    return prisma.periodicMessageDelivery.findMany({ where: { periodicMessageId: messageId }, orderBy: { scheduledFor: "desc" }, take: 200 });
  });

  app.post("/periodic-messages", { preHandler: [requireAuth] }, async (request, reply) => {
    const payload = messageSchema.parse(request.body);
    await assertModuleAccess(request, payload.teamKey);
    await assertSenderBelongsToModule(request, payload.teamKey, payload.senderEmail);
    if (payload.status === "ACTIVE") await assertSenderConnected(request, payload.senderEmail);
    const user = getSessionUser(request);
    const record = await prisma.periodicMessage.create({ data: {
      ...payload,
      startAt: new Date(payload.startAt), endAt: payload.endAt ? new Date(payload.endAt) : null,
      nextRunAt: new Date(payload.startAt), organizationId: user.organizationId,
      createdByUserId: user.id, createdByName: user.displayName, updatedByUserId: user.id, updatedByName: user.displayName
    } });
    reply.code(201);
    return record;
  });

  app.patch("/periodic-messages/:messageId", { preHandler: [requireAuth] }, async (request) => {
    const { messageId } = z.object({ messageId: z.string().uuid() }).parse(request.params);
    const payload = messageSchema.parse(request.body);
    const user = getSessionUser(request);
    const current = await prisma.periodicMessage.findFirstOrThrow({ where: { id: messageId, organizationId: user.organizationId, deletedAt: null } });
    await assertModuleAccess(request, current.teamKey);
    await assertModuleAccess(request, payload.teamKey);
    await assertSenderBelongsToModule(request, payload.teamKey, payload.senderEmail);
    if (payload.status === "ACTIVE") await assertSenderConnected(request, payload.senderEmail);
    return prisma.periodicMessage.update({ where: { id: messageId }, data: {
      ...payload, startAt: new Date(payload.startAt), endAt: payload.endAt ? new Date(payload.endAt) : null,
      nextRunAt: new Date(payload.startAt), updatedByUserId: user.id, updatedByName: user.displayName
    } });
  });

  app.delete("/periodic-messages/:messageId", { preHandler: [requireAuth] }, async (request, reply) => {
    const { messageId } = z.object({ messageId: z.string().uuid() }).parse(request.params);
    const user = getSessionUser(request);
    const current = await prisma.periodicMessage.findFirstOrThrow({ where: { id: messageId, organizationId: user.organizationId, deletedAt: null } });
    await assertModuleAccess(request, current.teamKey);
    await prisma.periodicMessage.update({ where: { id: messageId }, data: { status: "DELETED", deletedAt: new Date(), updatedByUserId: user.id, updatedByName: user.displayName } });
    reply.code(204);
  });
};
