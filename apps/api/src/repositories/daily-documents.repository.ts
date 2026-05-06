import type { PrismaClient } from "@prisma/client";
import type { DailyDocumentTemplateId } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { mapDailyDocumentAssignment } from "./mappers";
import type { DailyDocumentAssignmentWriteRecord, DailyDocumentsRepository } from "./types";

const DAILY_DOCUMENT_TEMPLATE_IDS = new Set<DailyDocumentTemplateId>([
  "general-power-letter",
  "labor-power-letter",
  "money-receipt",
  "rc-received-document-receipt",
  "rc-delivered-document-receipt",
  "property-delivery-receipt"
]);

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeValues(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, entry]) => [key, normalizeText(entry)])
      .filter(([key]) => Boolean(key))
  );
}

function validateTemplateId(templateId: DailyDocumentTemplateId) {
  if (!DAILY_DOCUMENT_TEMPLATE_IDS.has(templateId)) {
    throw new AppError(400, "DAILY_DOCUMENT_TEMPLATE_INVALID", "La plantilla seleccionada no es valida.");
  }
}

export class PrismaDailyDocumentsRepository implements DailyDocumentsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    const records = await this.prisma.dailyDocumentAssignment.findMany({
      orderBy: [{ createdAt: "desc" }, { title: "asc" }]
    });

    return records.map(mapDailyDocumentAssignment);
  }

  public async create(payload: DailyDocumentAssignmentWriteRecord) {
    validateTemplateId(payload.templateId);
    const client = await this.findClientOrThrow(payload.clientId);

    const record = await this.prisma.dailyDocumentAssignment.create({
      data: {
        templateId: payload.templateId,
        templateTitle: normalizeText(payload.templateTitle) || "Documento",
        title: normalizeText(payload.title) || normalizeText(payload.templateTitle) || "Documento",
        clientId: client.id,
        clientNumber: client.clientNumber,
        clientName: client.name,
        values: normalizeValues(payload.values)
      }
    });

    return mapDailyDocumentAssignment(record);
  }

  public async update(documentId: string, payload: DailyDocumentAssignmentWriteRecord) {
    await this.findAssignmentOrThrow(documentId);
    validateTemplateId(payload.templateId);
    const client = await this.findClientOrThrow(payload.clientId);

    const record = await this.prisma.dailyDocumentAssignment.update({
      where: { id: documentId },
      data: {
        templateId: payload.templateId,
        templateTitle: normalizeText(payload.templateTitle) || "Documento",
        title: normalizeText(payload.title) || normalizeText(payload.templateTitle) || "Documento",
        clientId: client.id,
        clientNumber: client.clientNumber,
        clientName: client.name,
        values: normalizeValues(payload.values)
      }
    });

    return mapDailyDocumentAssignment(record);
  }

  public async delete(documentId: string) {
    await this.findAssignmentOrThrow(documentId);
    await this.prisma.dailyDocumentAssignment.delete({ where: { id: documentId } });
  }

  private async findClientOrThrow(clientId: string) {
    const normalizedClientId = normalizeText(clientId);
    if (!normalizedClientId) {
      throw new AppError(400, "DAILY_DOCUMENT_CLIENT_REQUIRED", "Selecciona un cliente del catalogo.");
    }

    const record = await this.prisma.client.findFirst({
      where: { id: normalizedClientId, deletedAt: null },
      select: {
        id: true,
        clientNumber: true,
        name: true
      }
    });

    if (!record) {
      throw new AppError(404, "DAILY_DOCUMENT_CLIENT_NOT_FOUND", "El cliente seleccionado no existe.");
    }

    return record;
  }

  private async findAssignmentOrThrow(documentId: string) {
    const record = await this.prisma.dailyDocumentAssignment.findUnique({
      where: { id: documentId },
      select: { id: true }
    });

    if (!record) {
      throw new AppError(404, "DAILY_DOCUMENT_NOT_FOUND", "El documento asignado no existe.");
    }

    return record;
  }
}
