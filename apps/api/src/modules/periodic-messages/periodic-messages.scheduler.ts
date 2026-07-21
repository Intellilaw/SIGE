import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";

import {
  buildPeriodicMessageRaw,
  decryptGoogleRefreshToken,
  getGoogleWorkspaceConfigurationStatus,
  refreshGoogleAccessToken,
  sendGoogleGmailRawMessage
} from "./google-workspace.client";

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numbers(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is number => Number.isInteger(item)) : [];
}

function nextOccurrence(message: { frequency: string; interval: number; weekdays: unknown; dayOfMonth: number | null }, from: Date) {
  const next = new Date(from);
  if (message.frequency === "MONTHLY") {
    const targetDay = message.dayOfMonth ?? from.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + Math.max(1, message.interval));
    next.setUTCDate(Math.min(targetDay, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
    return next;
  }
  if (message.frequency === "WEEKLY") {
    const allowed = new Set(numbers(message.weekdays));
    for (let days = 1; days <= 7 * Math.max(1, message.interval); days += 1) {
      const candidate = new Date(from.getTime() + days * 86_400_000);
      if (allowed.size === 0 ? candidate.getUTCDay() === from.getUTCDay() : allowed.has(candidate.getUTCDay())) return candidate;
    }
  }
  next.setUTCDate(next.getUTCDate() + Math.max(1, message.interval));
  return next;
}

async function isNonBusinessDay(prisma: PrismaClient, organizationId: string, date: Date) {
  if (date.getUTCDay() === 0 || date.getUTCDay() === 6) return true;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start.getTime() + 86_400_000);
  return Boolean(await prisma.holiday.findFirst({ where: { organizationId, authorityShortName: "EMPRESA", date: { gte: start, lt: end } } }));
}

async function adjustedDate(prisma: PrismaClient, message: { organizationId: string; nonBusinessDayPolicy: string }, value: Date) {
  if (message.nonBusinessDayPolicy === "SEND_ANYWAY" || !(await isNonBusinessDay(prisma, message.organizationId, value))) return value;
  const direction = message.nonBusinessDayPolicy === "PREVIOUS_BUSINESS_DAY" ? -1 : 1;
  let candidate = new Date(value);
  for (let index = 0; index < 14; index += 1) {
    candidate = new Date(candidate.getTime() + direction * 86_400_000);
    if (!(await isNonBusinessDay(prisma, message.organizationId, candidate))) return candidate;
  }
  return value;
}

async function executeMessage(prisma: PrismaClient, message: Awaited<ReturnType<PrismaClient["periodicMessage"]["findFirst"]>>, logger: FastifyBaseLogger) {
  if (!message?.nextRunAt) return;
  const effectiveRunAt = await adjustedDate(prisma, message, message.nextRunAt);
  if (effectiveRunAt.getTime() > Date.now()) {
    await prisma.periodicMessage.update({ where: { id: message.id }, data: { nextRunAt: effectiveRunAt } });
    return;
  }
  const idempotencyKey = `${message.id}:${message.nextRunAt.toISOString()}`;
  let delivery = await prisma.periodicMessageDelivery.findUnique({ where: { organizationId_idempotencyKey: { organizationId: message.organizationId, idempotencyKey } } });
  if (delivery?.status === "SENT" || (delivery && delivery.attemptCount >= 3)) return;
  if (delivery && Date.now() - delivery.updatedAt.getTime() < RETRY_DELAYS_MS[Math.max(0, delivery.attemptCount - 1)]) return;
  const snapshot = { senderEmail: message.senderEmail, toRecipients: message.toRecipients, ccRecipients: message.ccRecipients, bccRecipients: message.bccRecipients, subject: message.subject, bodyHtml: message.bodyHtml, signatureText: message.signatureText };
  delivery ??= await prisma.periodicMessageDelivery.create({ data: { organizationId: message.organizationId, periodicMessageId: message.id, scheduledFor: effectiveRunAt, idempotencyKey, messageSnapshot: snapshot, createdByUserId: message.createdByUserId } });
  try {
    const connection = await prisma.googleWorkspaceConnection.findFirst({ where: { organizationId: message.organizationId, email: { equals: message.senderEmail, mode: "insensitive" }, status: "ACTIVE", refreshTokenCiphertext: { not: null } } });
    if (!connection?.refreshTokenCiphertext) throw new Error("El remitente no tiene una conexión activa con Google Workspace.");
    const refreshToken = decryptGoogleRefreshToken(connection.refreshTokenCiphertext, connection.email);
    const token = await refreshGoogleAccessToken(refreshToken);
    await sendGoogleGmailRawMessage(token.accessToken, buildPeriodicMessageRaw({ senderEmail: message.senderEmail, to: strings(message.toRecipients), cc: strings(message.ccRecipients), bcc: strings(message.bccRecipients), subject: message.subject, bodyHtml: message.bodyHtml, signatureText: message.signatureText }));
    const now = new Date();
    await prisma.$transaction([
      prisma.periodicMessageDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", attemptCount: delivery.attemptCount + 1, lastAttemptAt: now, sentAt: now, failureMessage: null } }),
      prisma.periodicMessage.update({ where: { id: message.id }, data: { lastRunAt: now, nextRunAt: nextOccurrence(message, message.nextRunAt) } }),
      prisma.googleWorkspaceConnection.update({ where: { userId: connection.userId }, data: { lastUsedAt: now, lastError: null } })
    ]);
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message.slice(0, 1000) : "Error desconocido de envío.";
    await prisma.periodicMessageDelivery.update({ where: { id: delivery.id }, data: { status: delivery.attemptCount + 1 >= 3 ? "FAILED" : "RETRYING", attemptCount: delivery.attemptCount + 1, lastAttemptAt: new Date(), failureMessage } });
    logger.error({ periodicMessageId: message.id, error: failureMessage }, "Periodic Gmail delivery failed");
  }
}

export function startPeriodicMessagesScheduler(prisma: PrismaClient, logger: FastifyBaseLogger) {
  let running = false;
  const run = async () => {
    if (running || !(await getGoogleWorkspaceConfigurationStatus()).configured) return;
    running = true;
    try {
      const messages = await prisma.periodicMessage.findMany({ where: { status: "ACTIVE", deletedAt: null, nextRunAt: { lte: new Date() } }, take: 50, orderBy: { nextRunAt: "asc" } });
      for (const message of messages) await executeMessage(prisma, message, logger);
    } finally { running = false; }
  };
  const timer = setInterval(() => void run(), 60_000);
  void run();
  return () => clearInterval(timer);
}
