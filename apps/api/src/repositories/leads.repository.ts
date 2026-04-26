import { Prisma, type PrismaClient } from "@prisma/client";
import type { Lead } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { getNextClientNumber } from "./clients.shared";
import { mapLead } from "./mappers";
import type { LeadUpdateRecord, LeadsRepository } from "./types";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

const ACTIVE_STATUS: Lead["status"] = "ACTIVE";
const MOVED_TO_MATTERS_STATUS: Lead["status"] = "MOVED_TO_MATTERS";
const DEFAULT_CHANNEL: Lead["communicationChannel"] = "WHATSAPP";

function normalizeOptionalText(value?: string | null) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredText(value?: string | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeIdentifier(value?: string | null) {
  return normalizeOptionalText(value);
}

function hasOwn<T extends object>(payload: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function parseDateValue(value?: string | null) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00.000Z`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, "INVALID_DATE", `Invalid date value: ${value}`);
  }

  return date;
}

function startOfMonthlyWindow(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

function endOfMonthlyWindow(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
}

export class PrismaLeadsRepository implements LeadsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    await this.cleanupHistory();

    const records = await this.prisma.lead.findMany({
      where: { status: ACTIVE_STATUS },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    return records.map(mapLead);
  }

  public async listHistory() {
    await this.cleanupHistory();

    const records = await this.prisma.lead.findMany({
      where: {
        status: MOVED_TO_MATTERS_STATUS,
        hiddenFromTracking: false
      },
      orderBy: [{ sentToMattersAt: "desc" }, { updatedAt: "desc" }]
    });

    return records.map(mapLead);
  }

  public async listMonthly(year: number, month: number) {
    await this.cleanupHistory();

    const records = await this.prisma.lead.findMany({
      where: {
        sentToClientAt: {
          gte: startOfMonthlyWindow(year, month),
          lt: endOfMonthlyWindow(year, month)
        }
      },
      orderBy: [{ sentToClientAt: "desc" }, { updatedAt: "desc" }]
    });

    return records.map(mapLead);
  }

  public async listCommissionShortNames() {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        shortName: { not: null }
      },
      select: {
        shortName: true
      }
    });

    return [...new Set(
      users
        .map((entry) => (entry.shortName ?? "").trim().toUpperCase())
        .filter(Boolean)
    )].sort();
  }

  public async create(payload: LeadUpdateRecord = {}) {
    const linkedQuote = await this.findQuoteByReference(this.prisma, {
      quoteId: payload.quoteId,
      quoteNumber: payload.quoteNumber
    });

    const record = await this.prisma.lead.create({
      data: {
        clientId: linkedQuote?.clientId ?? normalizeIdentifier(payload.clientId),
        clientName: linkedQuote?.clientName ?? normalizeRequiredText(payload.clientName),
        prospectName: linkedQuote ? null : normalizeOptionalText(payload.prospectName),
        commissionAssignee: normalizeOptionalText(payload.commissionAssignee),
        quoteId: linkedQuote?.id ?? normalizeIdentifier(payload.quoteId),
        quoteNumber: linkedQuote?.quoteNumber ?? normalizeOptionalText(payload.quoteNumber),
        subject: linkedQuote?.subject ?? normalizeRequiredText(payload.subject),
        amountMxn: new Prisma.Decimal(linkedQuote?.totalMxn ?? payload.amountMxn ?? 0),
        communicationChannel: payload.communicationChannel ?? DEFAULT_CHANNEL,
        lastInteractionLabel: normalizeOptionalText(payload.lastInteractionLabel),
        lastInteraction: parseDateValue(payload.lastInteraction),
        nextInteractionLabel: normalizeOptionalText(payload.nextInteractionLabel),
        nextInteraction: parseDateValue(payload.nextInteraction),
        notes: normalizeOptionalText(payload.notes),
        sentToClientAt: parseDateValue(payload.sentToClientAt),
        sentToMattersAt: parseDateValue(payload.sentToMattersAt),
        hiddenFromTracking: payload.hiddenFromTracking ?? false,
        status: payload.status ?? ACTIVE_STATUS
      }
    });

    return mapLead(record);
  }

  public async update(leadId: string, payload: LeadUpdateRecord) {
    const current = await this.findLeadOrThrow(this.prisma, leadId);
    const data = await this.buildUpdatePayload(this.prisma, current, payload);

    const record = await this.prisma.lead.update({
      where: { id: leadId },
      data
    });

    return mapLead(record);
  }

  public async delete(leadId: string) {
    await this.findLeadOrThrow(this.prisma, leadId);
    await this.prisma.lead.delete({ where: { id: leadId } });
  }

  public async bulkDelete(leadIds: string[]) {
    if (leadIds.length === 0) {
      return;
    }

    await this.prisma.lead.deleteMany({
      where: { id: { in: leadIds } }
    });
  }

  public async markSentToClient(leadId: string) {
    const current = await this.findLeadOrThrow(this.prisma, leadId);
    if (!current.quoteNumber || current.quoteNumber.trim().length === 0) {
      throw new AppError(400, "LEAD_QUOTE_REQUIRED", "The lead must be linked to a quote before marking it as sent.");
    }

    const record = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        sentToClientAt: new Date()
      }
    });

    return mapLead(record);
  }

  public async sendToMatters(leadId: string) {
    const record = await this.prisma.$transaction(async (tx) => {
      const lead = await this.findLeadOrThrow(tx, leadId);

      if (!lead.quoteNumber || lead.quoteNumber.trim().length === 0) {
        throw new AppError(400, "LEAD_QUOTE_REQUIRED", "The lead must be linked to a quote before moving it to active matters.");
      }

      const linkedQuote = await this.findQuoteByReference(tx, {
        quoteId: lead.quoteId,
        quoteNumber: lead.quoteNumber
      });

      const matterClientName = normalizeRequiredText(lead.clientName) || normalizeRequiredText(lead.prospectName) || "Prospecto sin nombre";
      const matterClient = await this.resolveMatterClient(tx, linkedQuote?.clientId ?? lead.clientId, matterClientName);
      const quoteNumber = normalizeRequiredText(lead.quoteNumber);
      const now = new Date();
      const matterSyncPatch = {
        clientId: matterClient.id,
        clientNumber: matterClient.clientNumber,
        clientName: matterClientName,
        quoteId: linkedQuote?.id ?? normalizeIdentifier(lead.quoteId),
        quoteNumber,
        commissionAssignee: normalizeOptionalText(lead.commissionAssignee),
        matterType: linkedQuote?.quoteType ?? "ONE_TIME",
        subject: normalizeRequiredText(lead.subject),
        totalFeesMxn: new Prisma.Decimal(lead.amountMxn),
        communicationChannel: (lead.communicationChannel || DEFAULT_CHANNEL) as Lead["communicationChannel"],
        nextAction: normalizeOptionalText(lead.nextInteractionLabel),
        nextActionDueAt: lead.nextInteraction,
        milestone: normalizeOptionalText(linkedQuote?.milestone ?? null)
      };

      const existingMatterCount = await tx.matter.count({
        where: { quoteNumber }
      });

      if (existingMatterCount > 0) {
        await tx.matter.updateMany({
          where: { quoteNumber },
          data: matterSyncPatch
        });
      } else {
        const matterCount = await tx.matter.count();
        await tx.matter.create({
          data: {
            matterNumber: `A-${new Date().getFullYear()}-${String(matterCount + 1).padStart(3, "0")}`,
            ...matterSyncPatch,
            specificProcess: null,
            responsibleTeam: null,
            r1InternalCreated: false,
            telegramBotLinked: false,
            rdCreated: false,
            rfCreated: "NO",
            r1ExternalCreated: false,
            billingChatCreated: false,
            matterIdentifier: null,
            executionLinkedModule: null,
            executionLinkedAt: null,
            nextActionSource: null,
            concluded: false,
            stage: "INTAKE",
            origin: "LEAD",
            notes: normalizeOptionalText(lead.notes)
          }
        });
      }

      return tx.lead.update({
        where: { id: leadId },
        data: {
          status: MOVED_TO_MATTERS_STATUS,
          sentToMattersAt: now,
          sentToClientAt: lead.sentToClientAt ?? now,
          hiddenFromTracking: false
        }
      });
    });

    return mapLead(record);
  }

  public async returnToActive(leadId: string) {
    await this.findLeadOrThrow(this.prisma, leadId);

    const record = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        status: ACTIVE_STATUS,
        sentToMattersAt: null,
        hiddenFromTracking: false
      }
    });

    return mapLead(record);
  }

  private async cleanupHistory() {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);

    await this.prisma.lead.updateMany({
      where: {
        status: MOVED_TO_MATTERS_STATUS,
        hiddenFromTracking: false,
        sentToMattersAt: {
          lt: threshold
        }
      },
      data: {
        hiddenFromTracking: true
      }
    });
  }

  private async findLeadOrThrow(prisma: PrismaExecutor, leadId: string) {
    const record = await prisma.lead.findUnique({
      where: { id: leadId }
    });

    if (!record) {
      throw new AppError(404, "LEAD_NOT_FOUND", "The requested lead does not exist.");
    }

    return record;
  }

  private async findQuoteByReference(prisma: PrismaExecutor, reference: {
    quoteId?: string | null;
    quoteNumber?: string | null;
  }) {
    const normalizedQuoteId = normalizeIdentifier(reference.quoteId);
    const normalizedQuoteNumber = normalizeOptionalText(reference.quoteNumber);

    if (normalizedQuoteId) {
      return prisma.quote.findUnique({
        where: { id: normalizedQuoteId }
      });
    }

    if (normalizedQuoteNumber) {
      return prisma.quote.findFirst({
        where: {
          quoteNumber: {
            equals: normalizedQuoteNumber,
            mode: "insensitive"
          }
        }
      });
    }

    return null;
  }

  private async resolveMatterClient(prisma: PrismaExecutor, clientId: string | null | undefined, clientName: string) {
    const normalizedClientId = normalizeIdentifier(clientId);
    if (normalizedClientId) {
      const existing = await prisma.client.findUnique({ where: { id: normalizedClientId } });
      if (existing) {
        return existing;
      }
    }

    const existingByName = await prisma.client.findFirst({
      where: {
        deletedAt: null,
        name: {
          equals: clientName,
          mode: "insensitive"
        }
      }
    });

    if (existingByName) {
      return existingByName;
    }

    return prisma.client.create({
      data: {
        clientNumber: await getNextClientNumber(prisma),
        name: clientName
      }
    });
  }

  private async buildUpdatePayload(
    prisma: PrismaExecutor,
    current: Awaited<ReturnType<typeof this.findLeadOrThrow>>,
    payload: LeadUpdateRecord
  ): Promise<Prisma.LeadUncheckedUpdateInput> {
    const data: Prisma.LeadUncheckedUpdateInput = {};
    const linkedQuote = hasOwn(payload, "quoteId") || hasOwn(payload, "quoteNumber")
      ? await this.findQuoteByReference(prisma, {
          quoteId: hasOwn(payload, "quoteId") ? payload.quoteId : current.quoteId,
          quoteNumber: hasOwn(payload, "quoteNumber") ? payload.quoteNumber : current.quoteNumber
        })
      : null;

    if (hasOwn(payload, "clientId")) {
      data.clientId = normalizeIdentifier(payload.clientId);
    }

    if (hasOwn(payload, "clientName")) {
      data.clientName = normalizeRequiredText(payload.clientName);
    }

    if (hasOwn(payload, "prospectName")) {
      data.prospectName = normalizeOptionalText(payload.prospectName);
    }

    if (hasOwn(payload, "commissionAssignee")) {
      data.commissionAssignee = normalizeOptionalText(payload.commissionAssignee);
    }

    if (hasOwn(payload, "quoteId")) {
      data.quoteId = normalizeIdentifier(payload.quoteId);
    }

    if (hasOwn(payload, "quoteNumber")) {
      data.quoteNumber = normalizeOptionalText(payload.quoteNumber);
    }

    if (linkedQuote) {
      data.clientId = linkedQuote.clientId;
      data.clientName = linkedQuote.clientName;
      data.prospectName = null;
      data.quoteId = linkedQuote.id;
      data.quoteNumber = linkedQuote.quoteNumber;
      data.subject = linkedQuote.subject;
      data.amountMxn = new Prisma.Decimal(linkedQuote.totalMxn);
    } else if (
      (hasOwn(payload, "quoteId") && !normalizeIdentifier(payload.quoteId)) ||
      (hasOwn(payload, "quoteNumber") && !normalizeOptionalText(payload.quoteNumber))
    ) {
      data.quoteId = null;
      data.quoteNumber = null;
      if (!hasOwn(payload, "subject")) {
        data.subject = "";
      }
      if (!hasOwn(payload, "amountMxn")) {
        data.amountMxn = new Prisma.Decimal(0);
      }
    }

    if (hasOwn(payload, "subject")) {
      data.subject = normalizeRequiredText(payload.subject);
    }

    if (hasOwn(payload, "amountMxn")) {
      data.amountMxn = new Prisma.Decimal(payload.amountMxn ?? 0);
    }

    if (hasOwn(payload, "communicationChannel")) {
      data.communicationChannel = payload.communicationChannel ?? DEFAULT_CHANNEL;
    }

    if (hasOwn(payload, "lastInteractionLabel")) {
      data.lastInteractionLabel = normalizeOptionalText(payload.lastInteractionLabel);
    }

    if (hasOwn(payload, "lastInteraction")) {
      data.lastInteraction = parseDateValue(payload.lastInteraction);
    }

    if (hasOwn(payload, "nextInteractionLabel")) {
      data.nextInteractionLabel = normalizeOptionalText(payload.nextInteractionLabel);
    }

    if (hasOwn(payload, "nextInteraction")) {
      data.nextInteraction = parseDateValue(payload.nextInteraction);
    }

    if (hasOwn(payload, "notes")) {
      data.notes = normalizeOptionalText(payload.notes);
    }

    if (hasOwn(payload, "sentToClientAt")) {
      data.sentToClientAt = parseDateValue(payload.sentToClientAt);
    }

    if (hasOwn(payload, "sentToMattersAt")) {
      data.sentToMattersAt = parseDateValue(payload.sentToMattersAt);
    }

    if (hasOwn(payload, "hiddenFromTracking")) {
      data.hiddenFromTracking = payload.hiddenFromTracking ?? false;
    }

    if (hasOwn(payload, "status")) {
      data.status = payload.status ?? ACTIVE_STATUS;
    }

    return data;
  }
}
