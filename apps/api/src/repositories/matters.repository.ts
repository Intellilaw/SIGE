import { Prisma, type PrismaClient } from "@prisma/client";
import { findTaskModule, type Matter } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { mapMatter } from "./mappers";
import type { MattersRepository, MatterWriteRecord } from "./types";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

const DEFAULT_CHANNEL: Matter["communicationChannel"] = "WHATSAPP";
const DEFAULT_RF_STATUS: Matter["rfCreated"] = "NO";
const DEFAULT_MATTER_TYPE: Matter["matterType"] = "ONE_TIME";

const EXECUTION_MODULE_BY_TEAM: Partial<Record<NonNullable<Matter["responsibleTeam"]>, string>> = {
  LITIGATION: "litigation",
  CORPORATE_LABOR: "corporate-labor",
  SETTLEMENTS: "settlements",
  FINANCIAL_LAW: "financial-law",
  TAX_COMPLIANCE: "tax-compliance"
};

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

function buildMatterNumber(sequence: number) {
  return `A-${new Date().getFullYear()}-${String(sequence).padStart(3, "0")}`;
}

export class PrismaMattersRepository implements MattersRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    await this.cleanupDeleted();

    const records = await this.prisma.matter.findMany({
      where: { deletedAt: null },
      orderBy: [{ clientNumber: "asc" }, { createdAt: "asc" }]
    });

    return records.map(mapMatter);
  }

  public async listDeleted() {
    await this.cleanupDeleted();

    const records = await this.prisma.matter.findMany({
      where: { deletedAt: { not: null } },
      orderBy: [{ deletedAt: "desc" }, { updatedAt: "desc" }]
    });

    return records.map(mapMatter);
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

  public async create(payload: MatterWriteRecord = {}) {
    const linkedQuote = await this.findQuoteByReference(this.prisma, {
      quoteId: payload.quoteId,
      quoteNumber: payload.quoteNumber
    });
    const clientFields = await this.resolveClientFields(this.prisma, {
      clientId: linkedQuote?.clientId ?? payload.clientId,
      clientName: linkedQuote?.clientName ?? payload.clientName,
      clientNumber: payload.clientNumber
    });
    const count = await this.prisma.matter.count();

    const record = await this.prisma.matter.create({
      data: {
        matterNumber: buildMatterNumber(count + 1),
        clientId: clientFields.clientId,
        clientNumber: clientFields.clientNumber,
        clientName: clientFields.clientName,
        quoteId: linkedQuote?.id ?? normalizeIdentifier(payload.quoteId),
        quoteNumber: linkedQuote?.quoteNumber ?? normalizeOptionalText(payload.quoteNumber),
        commissionAssignee: normalizeOptionalText(payload.commissionAssignee),
        matterType: payload.matterType ?? linkedQuote?.quoteType ?? DEFAULT_MATTER_TYPE,
        subject: linkedQuote?.subject ?? normalizeRequiredText(payload.subject),
        specificProcess: normalizeOptionalText(payload.specificProcess),
        totalFeesMxn: new Prisma.Decimal(linkedQuote?.totalMxn ?? payload.totalFeesMxn ?? 0),
        responsibleTeam: payload.responsibleTeam ?? null,
        nextPaymentDate: parseDateValue(payload.nextPaymentDate),
        communicationChannel: payload.communicationChannel ?? DEFAULT_CHANNEL,
        r1InternalCreated: payload.r1InternalCreated ?? false,
        telegramBotLinked: payload.telegramBotLinked ?? false,
        rdCreated: payload.rdCreated ?? false,
        rfCreated: payload.rfCreated ?? DEFAULT_RF_STATUS,
        r1ExternalCreated: payload.r1ExternalCreated ?? false,
        billingChatCreated: payload.billingChatCreated ?? false,
        matterIdentifier: normalizeOptionalText(payload.matterIdentifier),
        executionLinkedModule: normalizeOptionalText(payload.executionLinkedModule),
        executionLinkedAt: parseDateValue(payload.executionLinkedAt),
        executionPrompt: normalizeOptionalText(payload.executionPrompt),
        nextAction: normalizeOptionalText(payload.nextAction),
        nextActionDueAt: parseDateValue(payload.nextActionDueAt),
        nextActionSource: normalizeOptionalText(payload.nextActionSource),
        milestone: normalizeOptionalText(linkedQuote?.milestone ?? payload.milestone),
        concluded: payload.concluded ?? false,
        stage: payload.stage ?? "INTAKE",
        origin: payload.origin ?? "MANUAL",
        notes: normalizeOptionalText(payload.notes),
        deletedAt: parseDateValue(payload.deletedAt)
      }
    });

    return mapMatter(record);
  }

  public async update(matterId: string, payload: MatterWriteRecord) {
    await this.findMatterOrThrow(this.prisma, matterId);
    const data = await this.buildUpdatePayload(this.prisma, matterId, payload);

    const record = await this.prisma.matter.update({
      where: { id: matterId },
      data
    });

    return mapMatter(record);
  }

  public async trash(matterId: string) {
    await this.findMatterOrThrow(this.prisma, matterId);
    const record = await this.prisma.matter.update({
      where: { id: matterId },
      data: {
        deletedAt: new Date()
      }
    });

    return mapMatter(record);
  }

  public async bulkTrash(matterIds: string[]) {
    if (matterIds.length === 0) {
      return;
    }

    await this.prisma.matter.updateMany({
      where: {
        id: {
          in: matterIds
        }
      },
      data: {
        deletedAt: new Date()
      }
    });
  }

  public async bulkDelete(matterIds: string[]) {
    if (matterIds.length === 0) {
      return;
    }

    await this.prisma.matter.deleteMany({
      where: {
        id: {
          in: matterIds
        }
      }
    });
  }

  public async restore(matterId: string) {
    await this.findMatterOrThrow(this.prisma, matterId);
    const record = await this.prisma.matter.update({
      where: { id: matterId },
      data: {
        deletedAt: null
      }
    });

    return mapMatter(record);
  }

  public async generateIdentifier(matterId: string) {
    const current = await this.findMatterOrThrow(this.prisma, matterId);

    let clientNumber = normalizeRequiredText(current.clientNumber);
    if (!clientNumber && current.clientId) {
      const linkedClient = await this.prisma.client.findUnique({
        where: { id: current.clientId }
      });
      clientNumber = normalizeRequiredText(linkedClient?.clientNumber);
    }
    if (!clientNumber && current.clientName) {
      const linkedClient = await this.prisma.client.findFirst({
        where: {
          name: {
            equals: current.clientName,
            mode: "insensitive"
          }
        }
      });
      clientNumber = normalizeRequiredText(linkedClient?.clientNumber);
    }

    if (!clientNumber) {
      throw new AppError(400, "MATTER_CLIENT_NUMBER_REQUIRED", "The matter needs a client number before generating the identifier.");
    }

    const quoteNumber = normalizeRequiredText(current.quoteNumber);
    if (!quoteNumber) {
      throw new AppError(400, "MATTER_QUOTE_REQUIRED", "The matter needs a quote number before generating the identifier.");
    }

    const existingCount = await this.prisma.matter.count({
      where: {
        clientNumber,
        matterIdentifier: {
          not: null
        }
      }
    });

    const record = await this.prisma.matter.update({
      where: { id: matterId },
      data: {
        clientNumber,
        matterIdentifier: `${clientNumber}-${quoteNumber}-${existingCount + 1}`
      }
    });

    return mapMatter(record);
  }

  public async sendToExecution(matterId: string) {
    const current = await this.findMatterOrThrow(this.prisma, matterId);

    if (!current.responsibleTeam) {
      throw new AppError(400, "MATTER_TEAM_REQUIRED", "The matter needs a responsible team before sending it to execution.");
    }

    if (!current.matterIdentifier) {
      throw new AppError(400, "MATTER_IDENTIFIER_REQUIRED", "The matter needs an identifier before sending it to execution.");
    }

    const executionModule = EXECUTION_MODULE_BY_TEAM[current.responsibleTeam as NonNullable<Matter["responsibleTeam"]>];
    if (!executionModule) {
      throw new AppError(400, "MATTER_EXECUTION_TEAM_UNSUPPORTED", "The selected team does not have an execution module yet.");
    }

    const linkedAt = new Date();
    await this.ensureExecutionTask(current, executionModule, linkedAt);

    const record = await this.prisma.matter.update({
      where: { id: matterId },
      data: {
        executionLinkedModule: executionModule,
        executionLinkedAt: linkedAt,
        nextActionSource: current.nextActionSource ?? `Execution / ${executionModule}`,
        stage: "EXECUTION"
      }
    });

    return mapMatter(record);
  }

  private async ensureExecutionTask(
    matter: {
      id: string;
      clientName: string;
      matterNumber: string | null;
      subject: string;
      commissionAssignee: string | null;
    },
    executionModule: string,
    dueDate: Date
  ) {
    const existing = await this.prisma.taskItem.findFirst({
      where: {
        matterId: matter.id,
        moduleId: executionModule,
        state: {
          not: "COMPLETED"
        }
      }
    });
    if (existing) {
      return existing;
    }

    const defaultTrackCode = findTaskModule(executionModule)?.tracks[0]?.id;
    let track = defaultTrackCode
      ? await this.prisma.taskTrack.findUnique({
        where: {
          moduleId_trackCode: {
            moduleId: executionModule,
            trackCode: defaultTrackCode
          }
        }
      })
      : null;

    track ??= await this.prisma.taskTrack.findFirst({
      where: { moduleId: executionModule },
      orderBy: { createdAt: "asc" }
    });
    if (!track) {
      return null;
    }

    return this.prisma.taskItem.create({
      data: {
        moduleId: executionModule,
        trackId: track.trackCode,
        clientName: normalizeRequiredText(matter.clientName) || "Cliente sin nombre",
        matterId: matter.id,
        matterNumber: normalizeOptionalText(matter.matterNumber),
        subject: normalizeRequiredText(matter.subject) || "Asunto sin descripcion",
        responsible: normalizeOptionalText(matter.commissionAssignee) ?? "",
        dueDate,
        state: "PENDING",
        recurring: false
      }
    });
  }

  private async cleanupDeleted() {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);

    await this.prisma.matter.deleteMany({
      where: {
        deletedAt: {
          lt: threshold
        }
      }
    });
  }

  private async findMatterOrThrow(prisma: PrismaExecutor, matterId: string) {
    const record = await prisma.matter.findUnique({
      where: { id: matterId }
    });

    if (!record) {
      throw new AppError(404, "MATTER_NOT_FOUND", "The requested matter does not exist.");
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

  private async resolveClientFields(prisma: PrismaExecutor, input: {
    clientId?: string | null;
    clientName?: string | null;
    clientNumber?: string | null;
  }) {
    const normalizedClientId = normalizeIdentifier(input.clientId);
    if (normalizedClientId) {
      const existingById = await prisma.client.findUnique({
        where: { id: normalizedClientId }
      });

      if (existingById) {
        return {
          clientId: existingById.id,
          clientNumber: existingById.clientNumber,
          clientName: existingById.name
        };
      }
    }

    const normalizedClientName = normalizeRequiredText(input.clientName);
    if (normalizedClientName) {
      const existingByName = await prisma.client.findFirst({
        where: {
          name: {
            equals: normalizedClientName,
            mode: "insensitive"
          }
        }
      });

      if (existingByName) {
        return {
          clientId: existingByName.id,
          clientNumber: existingByName.clientNumber,
          clientName: existingByName.name
        };
      }

      return {
        clientId: null,
        clientNumber: normalizeOptionalText(input.clientNumber),
        clientName: normalizedClientName
      };
    }

    return {
      clientId: null,
      clientNumber: normalizeOptionalText(input.clientNumber),
      clientName: ""
    };
  }

  private async buildUpdatePayload(
    prisma: PrismaExecutor,
    matterId: string,
    payload: MatterWriteRecord
  ): Promise<Prisma.MatterUncheckedUpdateInput> {
    const current = await this.findMatterOrThrow(prisma, matterId);
    const nextQuoteId = hasOwn(payload, "quoteId") ? payload.quoteId : current.quoteId;
    const nextQuoteNumber = hasOwn(payload, "quoteNumber") ? payload.quoteNumber : current.quoteNumber;
    const linkedQuote = await this.findQuoteByReference(prisma, {
      quoteId: nextQuoteId,
      quoteNumber: nextQuoteNumber
    });
    const clientFields = await this.resolveClientFields(prisma, {
      clientId: linkedQuote?.clientId ?? (hasOwn(payload, "clientId") ? payload.clientId : current.clientId),
      clientName: linkedQuote?.clientName ?? (hasOwn(payload, "clientName") ? payload.clientName : current.clientName),
      clientNumber: hasOwn(payload, "clientNumber") ? payload.clientNumber : current.clientNumber
    });
    const data: Prisma.MatterUncheckedUpdateInput = {};

    if (linkedQuote) {
      data.quoteId = linkedQuote.id;
      data.quoteNumber = linkedQuote.quoteNumber;
      data.clientId = clientFields.clientId;
      data.clientNumber = clientFields.clientNumber;
      data.clientName = clientFields.clientName;
      data.subject = linkedQuote.subject;
      data.totalFeesMxn = new Prisma.Decimal(linkedQuote.totalMxn);
      data.milestone = normalizeOptionalText(linkedQuote.milestone);
    } else {
      if (hasOwn(payload, "quoteId")) {
        data.quoteId = normalizeIdentifier(payload.quoteId);
      }
      if (hasOwn(payload, "quoteNumber")) {
        data.quoteNumber = normalizeOptionalText(payload.quoteNumber);
      }
      if (hasOwn(payload, "clientId") || hasOwn(payload, "clientName") || hasOwn(payload, "clientNumber") || hasOwn(payload, "quoteId") || hasOwn(payload, "quoteNumber")) {
        data.clientId = clientFields.clientId;
        data.clientNumber = clientFields.clientNumber;
        data.clientName = clientFields.clientName;
      }
      if (hasOwn(payload, "subject")) {
        data.subject = normalizeRequiredText(payload.subject);
      }
      if (hasOwn(payload, "totalFeesMxn")) {
        data.totalFeesMxn = new Prisma.Decimal(payload.totalFeesMxn ?? 0);
      }
      if (hasOwn(payload, "milestone")) {
        data.milestone = normalizeOptionalText(payload.milestone);
      }
    }

    if (hasOwn(payload, "commissionAssignee")) {
      data.commissionAssignee = normalizeOptionalText(payload.commissionAssignee);
    }
    if (hasOwn(payload, "matterType")) {
      data.matterType = payload.matterType ?? DEFAULT_MATTER_TYPE;
    }
    if (hasOwn(payload, "specificProcess")) {
      data.specificProcess = normalizeOptionalText(payload.specificProcess);
    }
    if (hasOwn(payload, "responsibleTeam")) {
      data.responsibleTeam = payload.responsibleTeam ?? null;
    }
    if (hasOwn(payload, "nextPaymentDate")) {
      data.nextPaymentDate = parseDateValue(payload.nextPaymentDate);
    }
    if (hasOwn(payload, "communicationChannel")) {
      data.communicationChannel = payload.communicationChannel ?? DEFAULT_CHANNEL;
    }
    if (hasOwn(payload, "r1InternalCreated")) {
      data.r1InternalCreated = payload.r1InternalCreated ?? false;
    }
    if (hasOwn(payload, "telegramBotLinked")) {
      data.telegramBotLinked = payload.telegramBotLinked ?? false;
    }
    if (hasOwn(payload, "rdCreated")) {
      data.rdCreated = payload.rdCreated ?? false;
    }
    if (hasOwn(payload, "rfCreated")) {
      data.rfCreated = payload.rfCreated ?? DEFAULT_RF_STATUS;
    }
    if (hasOwn(payload, "r1ExternalCreated")) {
      data.r1ExternalCreated = payload.r1ExternalCreated ?? false;
    }
    if (hasOwn(payload, "billingChatCreated")) {
      data.billingChatCreated = payload.billingChatCreated ?? false;
    }
    if (hasOwn(payload, "matterIdentifier")) {
      data.matterIdentifier = normalizeOptionalText(payload.matterIdentifier);
    }
    if (hasOwn(payload, "executionLinkedModule")) {
      data.executionLinkedModule = normalizeOptionalText(payload.executionLinkedModule);
    }
    if (hasOwn(payload, "executionLinkedAt")) {
      data.executionLinkedAt = parseDateValue(payload.executionLinkedAt);
    }
    if (hasOwn(payload, "executionPrompt")) {
      data.executionPrompt = normalizeOptionalText(payload.executionPrompt);
    }
    if (hasOwn(payload, "nextAction")) {
      data.nextAction = normalizeOptionalText(payload.nextAction);
    }
    if (hasOwn(payload, "nextActionDueAt")) {
      data.nextActionDueAt = parseDateValue(payload.nextActionDueAt);
    }
    if (hasOwn(payload, "nextActionSource")) {
      data.nextActionSource = normalizeOptionalText(payload.nextActionSource);
    }
    if (hasOwn(payload, "concluded")) {
      data.concluded = payload.concluded ?? false;
    }
    if (hasOwn(payload, "stage")) {
      data.stage = payload.stage ?? "INTAKE";
    }
    if (hasOwn(payload, "origin")) {
      data.origin = payload.origin ?? "MANUAL";
    }
    if (hasOwn(payload, "notes")) {
      data.notes = normalizeOptionalText(payload.notes);
    }
    if (hasOwn(payload, "deletedAt")) {
      data.deletedAt = parseDateValue(payload.deletedAt);
    }

    return data;
  }
}
