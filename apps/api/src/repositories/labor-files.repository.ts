import { Buffer } from "node:buffer";

import { Prisma, type PrismaClient } from "@prisma/client";
import {
  LABOR_FILE_DOCUMENT_DEFINITIONS,
  type LaborFileDocumentType,
  type LaborFileUpdateInput,
  type LaborGlobalVacationDayInput,
  type LaborVacationEventInput
} from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { mapLaborFile, mapLaborFileDocument, mapLaborGlobalVacationDay, mapLaborVacationEvent } from "./mappers";
import type { LaborFileDocumentUploadRecord, LaborFilesRepository } from "./types";

type LaborFileUserSnapshot = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  shortName: string | null;
  role: string;
  legacyRole: string;
  team: string | null;
  legacyTeam: string | null;
  specificRole: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const LABOR_FILE_RELATIONS = {
  documents: {
    orderBy: [{ documentType: "asc" as const }, { uploadedAt: "desc" as const }],
    select: {
      id: true,
      laborFileId: true,
      documentType: true,
      originalFileName: true,
      fileMimeType: true,
      fileSizeBytes: true,
      uploadedAt: true,
      createdAt: true,
      updatedAt: true
    }
  },
  vacationEvents: {
    orderBy: [{ startDate: "asc" as const }, { createdAt: "asc" as const }]
  }
};

const GLOBAL_VACATION_DAY_SELECT = {
  id: true,
  date: true,
  days: true,
  description: true,
  createdAt: true,
  updatedAt: true
};

const KNOWN_DOCUMENT_TYPES = new Set(LABOR_FILE_DOCUMENT_DEFINITIONS.map((definition) => definition.type));
const PDF_ONLY_TYPES = new Set(
  LABOR_FILE_DOCUMENT_DEFINITIONS.filter((definition) => definition.pdfOnly).map((definition) => definition.type)
);
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png"
]);

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeRoleText(value?: string | null) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toPrismaBytes(content: Buffer) {
  const bytes = new Uint8Array(content.byteLength);
  bytes.set(content);
  return bytes;
}

function toDate(value?: string | null) {
  const key = normalizeText(value);
  if (!key) {
    return null;
  }

  const parsed = new Date(`${key.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, "INVALID_DATE", "La fecha no es válida.");
  }

  return parsed;
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, offset: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
}

function enumerateDateKeys(startDate: Date, endDate: Date) {
  const startKey = toDateKey(startDate);
  const endKey = toDateKey(endDate);
  if (startKey > endKey) {
    throw new AppError(400, "INVALID_LABOR_VACATION_RANGE", "La fecha final no puede ser anterior a la inicial.");
  }

  const keys: string[] = [];
  let cursor = startDate;
  while (toDateKey(cursor) <= endKey) {
    keys.push(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }

  return keys;
}

function decodeBase64File(value?: string | null) {
  const base64Payload = normalizeText(value);
  if (!base64Payload) {
    return null;
  }

  return Buffer.from(base64Payload.includes(",") ? base64Payload.slice(base64Payload.indexOf(",") + 1) : base64Payload, "base64");
}

function getVacationDateKeys(payload: LaborVacationEventInput) {
  const explicitDateKeys = (payload.vacationDates ?? [])
    .map((date) => toDate(date))
    .filter((date): date is Date => Boolean(date))
    .map(toDateKey);

  if (explicitDateKeys.length > 0) {
    return Array.from(new Set(explicitDateKeys)).sort();
  }

  const startDate = toDate(payload.startDate);
  const endDate = toDate(payload.endDate) ?? startDate;
  if (!startDate || !endDate) {
    return [];
  }

  return Array.from(new Set(enumerateDateKeys(startDate, endDate))).sort();
}

function isPdfFile(payload: Pick<LaborFileDocumentUploadRecord, "fileMimeType" | "originalFileName">) {
  const mimeType = normalizeText(payload.fileMimeType).toLowerCase();
  const filename = normalizeText(payload.originalFileName).toLowerCase();
  return mimeType === "application/pdf" || filename.endsWith(".pdf");
}

function validateDocumentType(documentType: LaborFileDocumentType) {
  if (!KNOWN_DOCUMENT_TYPES.has(documentType)) {
    throw new AppError(400, "INVALID_LABOR_FILE_DOCUMENT_TYPE", "Tipo de documento laboral inválido.");
  }
}

function requiresProfessionalCredentials(specificRole?: string | null) {
  const normalized = normalizeRoleText(specificRole);
  const compact = normalized.replace(/[^a-z]/g, "");
  if (!compact.includes("lider") && !compact.includes("lader")) {
    return false;
  }

  return [
    "litigio",
    "corporativo",
    "convenios",
    "der financiero",
    "derecho financiero",
    "compliance fiscal"
  ].some((role) => normalized.includes(role));
}

function getRequiredDocumentTypes(specificRole?: string | null) {
  const professionalCredentialsRequired = requiresProfessionalCredentials(specificRole);
  return LABOR_FILE_DOCUMENT_DEFINITIONS
    .filter((definition) =>
      definition.requirement === "ALWAYS" ||
      (definition.requirement === "PROFESSIONAL_CREDENTIAL" && professionalCredentialsRequired)
    )
    .map((definition) => definition.type);
}

function computeLaborFileStatus(input: {
  specificRole?: string | null;
  documentTypes: string[];
}) {
  const documentTypes = new Set(input.documentTypes);
  const complete = getRequiredDocumentTypes(input.specificRole).every((documentType) =>
    documentTypes.has(documentType)
  );

  return complete ? "COMPLETE" : "INCOMPLETE";
}

export function shouldHaveLaborFile(user: Pick<LaborFileUserSnapshot, "role" | "legacyRole">) {
  return user.role !== "SUPERADMIN" && user.legacyRole !== "SUPERADMIN";
}

export function buildLaborFileSnapshot(user: LaborFileUserSnapshot) {
  return {
    employeeName: normalizeText(user.displayName) || user.username,
    employeeEmail: normalizeText(user.email) || null,
    employeeUsername: user.username,
    employeeShortName: normalizeText(user.shortName) || null,
    team: normalizeText(user.team) || null,
    legacyTeam: normalizeText(user.legacyTeam) || null,
    specificRole: normalizeText(user.specificRole) || null,
    employmentStatus: user.isActive ? "ACTIVE" : "FORMER",
    employmentEndedAt: user.isActive ? null : user.updatedAt,
    hireDate: user.createdAt
  };
}

export class PrismaLaborFilesRepository implements LaborFilesRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    await this.syncMissingForUsers();
    await this.refreshStatuses();
    const [records, globalVacationDays] = await Promise.all([
      this.prisma.laborFile.findMany({
        include: LABOR_FILE_RELATIONS,
        orderBy: [{ employmentStatus: "asc" }, { employeeName: "asc" }]
      }),
      this.findGlobalVacationDayRecords()
    ]);

    return records.map((record) => mapLaborFile(record, globalVacationDays));
  }

  public async listForUser(userId: string) {
    await this.ensureForUser(userId);
    await this.refreshStatuses({ userId });
    const [records, globalVacationDays] = await Promise.all([
      this.prisma.laborFile.findMany({
        where: { userId },
        include: LABOR_FILE_RELATIONS,
        orderBy: [{ employeeName: "asc" }]
      }),
      this.findGlobalVacationDayRecords()
    ]);

    return records.map((record) => mapLaborFile(record, globalVacationDays));
  }

  public async findById(laborFileId: string) {
    const [record, globalVacationDays] = await Promise.all([
      this.prisma.laborFile.findUnique({
        where: { id: laborFileId },
        include: LABOR_FILE_RELATIONS
      }),
      this.findGlobalVacationDayRecords()
    ]);

    return record ? mapLaborFile(record, globalVacationDays) : null;
  }

  public async findDocument(documentId: string) {
    const record = await this.prisma.laborFileDocument.findUnique({
      where: { id: documentId },
      select: {
        laborFileId: true,
        documentType: true,
        originalFileName: true,
        fileMimeType: true,
        fileContent: true,
        laborFile: {
          select: {
            userId: true,
            employeeName: true
          }
        }
      }
    });

    if (!record) {
      return null;
    }

    return {
      laborFileId: record.laborFileId,
      userId: record.laborFile.userId,
      employeeName: record.laborFile.employeeName,
      documentType: record.documentType as LaborFileDocumentType,
      originalFileName: record.originalFileName,
      fileMimeType: record.fileMimeType,
      fileContent: Buffer.from(record.fileContent)
    };
  }

  public async findVacationAcceptanceDocument(eventId: string) {
    const record = await this.prisma.laborVacationEvent.findUnique({
      where: { id: eventId },
      select: {
        laborFileId: true,
        acceptanceOriginalFileName: true,
        acceptanceFileMimeType: true,
        acceptanceFileContent: true,
        laborFile: {
          select: {
            userId: true,
            employeeName: true
          }
        }
      }
    });

    if (!record?.acceptanceOriginalFileName || !record.acceptanceFileContent) {
      return null;
    }

    return {
      laborFileId: record.laborFileId,
      userId: record.laborFile.userId,
      employeeName: record.laborFile.employeeName,
      originalFileName: record.acceptanceOriginalFileName,
      fileMimeType: record.acceptanceFileMimeType,
      fileContent: Buffer.from(record.acceptanceFileContent)
    };
  }

  public async update(laborFileId: string, payload: LaborFileUpdateInput) {
    await this.findOrThrow(laborFileId);
    const record = await this.prisma.laborFile.update({
      where: { id: laborFileId },
      data: {
        hireDate: payload.hireDate ? toDate(payload.hireDate) ?? undefined : undefined,
        notes: payload.notes === undefined ? undefined : normalizeText(payload.notes) || null
      },
      include: LABOR_FILE_RELATIONS
    });

    return mapLaborFile(record);
  }

  public async uploadDocument(laborFileId: string, payload: LaborFileDocumentUploadRecord) {
    await this.findOrThrow(laborFileId);
    validateDocumentType(payload.documentType);

    const filename = normalizeText(payload.originalFileName);
    if (!filename) {
      throw new AppError(400, "LABOR_FILE_DOCUMENT_NAME_REQUIRED", "El nombre del archivo es obligatorio.");
    }

    if (!payload.fileContent.byteLength) {
      throw new AppError(400, "LABOR_FILE_DOCUMENT_REQUIRED", "El archivo es obligatorio.");
    }

    const mimeType = normalizeText(payload.fileMimeType).toLowerCase();
    if (PDF_ONLY_TYPES.has(payload.documentType) && !isPdfFile(payload)) {
      throw new AppError(400, "LABOR_FILE_DOCUMENT_PDF_REQUIRED", "El contrato laboral y sus addenda deben ser PDF.");
    }

    if (!PDF_ONLY_TYPES.has(payload.documentType) && mimeType && !ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType)) {
      throw new AppError(400, "LABOR_FILE_DOCUMENT_TYPE_NOT_ALLOWED", "Solo se permiten archivos PDF, JPG o PNG.");
    }

    const record = await this.prisma.laborFileDocument.create({
      data: {
        laborFileId,
        documentType: payload.documentType,
        originalFileName: filename,
        fileMimeType: mimeType || null,
        fileSizeBytes: payload.fileSizeBytes ?? payload.fileContent.byteLength,
        fileContent: toPrismaBytes(payload.fileContent)
      },
      select: LABOR_FILE_RELATIONS.documents.select
    });

    await this.refreshStatus(laborFileId);
    return mapLaborFileDocument(record);
  }

  public async deleteDocument(documentId: string) {
    const record = await this.prisma.laborFileDocument.findUnique({
      where: { id: documentId },
      select: { laborFileId: true }
    });

    if (!record) {
      throw new AppError(404, "LABOR_FILE_DOCUMENT_NOT_FOUND", "El documento no existe.");
    }

    await this.prisma.laborFileDocument.delete({ where: { id: documentId } });
    await this.refreshStatus(record.laborFileId);
  }

  public async createVacationEvent(laborFileId: string, payload: LaborVacationEventInput) {
    await this.findOrThrow(laborFileId);

    if (payload.eventType !== "PREVIOUS_YEAR_DEDUCTION" && payload.eventType !== "VACATION") {
      throw new AppError(400, "INVALID_LABOR_VACATION_EVENT_TYPE", "Tipo de movimiento de vacaciones inválido.");
    }

    const vacationDateKeys = payload.eventType === "VACATION" ? getVacationDateKeys(payload) : [];
    const days = payload.eventType === "VACATION" ? vacationDateKeys.length : Number(payload.days);
    if (!Number.isFinite(days) || days <= 0) {
      throw new AppError(400, "INVALID_LABOR_VACATION_DAYS", "Los días de vacaciones deben ser mayores a cero.");
    }

    if (payload.eventType === "VACATION" && vacationDateKeys.length === 0) {
      throw new AppError(400, "LABOR_VACATION_DATE_REQUIRED", "Captura al menos un día de vacaciones.");
    }

    const startDate = payload.eventType === "VACATION"
      ? toDate(vacationDateKeys[0])
      : toDate(payload.startDate);
    const endDate = payload.eventType === "VACATION"
      ? toDate(vacationDateKeys[vacationDateKeys.length - 1])
      : toDate(payload.endDate) ?? startDate;

    const acceptanceOriginalFileName = normalizeText(payload.acceptanceOriginalFileName);
    const acceptanceFileMimeType = normalizeText(payload.acceptanceFileMimeType).toLowerCase();
    const acceptanceFileContent = decodeBase64File(payload.acceptanceFileBase64);

    if (payload.eventType === "VACATION") {
      if (!acceptanceOriginalFileName || !acceptanceFileContent?.byteLength) {
        throw new AppError(400, "LABOR_VACATION_ACCEPTANCE_PDF_REQUIRED", "Carga el formato de aceptación de vacaciones en PDF.");
      }

      if (!isPdfFile({ originalFileName: acceptanceOriginalFileName, fileMimeType: acceptanceFileMimeType })) {
        throw new AppError(400, "LABOR_VACATION_ACCEPTANCE_PDF_REQUIRED", "El formato de aceptación de vacaciones debe ser PDF.");
      }
    }

    const record = await this.prisma.laborVacationEvent.create({
      data: {
        laborFileId,
        eventType: payload.eventType,
        startDate,
        endDate,
        vacationDates: payload.eventType === "VACATION" ? vacationDateKeys : undefined,
        days: new Prisma.Decimal(days),
        description: normalizeText(payload.description) || null,
        acceptanceOriginalFileName: payload.eventType === "VACATION" ? acceptanceOriginalFileName : null,
        acceptanceFileMimeType: payload.eventType === "VACATION" ? acceptanceFileMimeType || "application/pdf" : null,
        acceptanceFileSizeBytes: payload.eventType === "VACATION" ? acceptanceFileContent?.byteLength ?? null : null,
        acceptanceFileContent: payload.eventType === "VACATION" && acceptanceFileContent ? toPrismaBytes(acceptanceFileContent) : null
      }
    });

    return mapLaborVacationEvent(record);
  }

  public async deleteVacationEvent(eventId: string) {
    const record = await this.prisma.laborVacationEvent.findUnique({
      where: { id: eventId },
      select: { id: true }
    });

    if (!record) {
      throw new AppError(404, "LABOR_VACATION_EVENT_NOT_FOUND", "El movimiento de vacaciones no existe.");
    }

    await this.prisma.laborVacationEvent.delete({ where: { id: eventId } });
  }

  public async listGlobalVacationDays() {
    const records = await this.findGlobalVacationDayRecords();
    return records.map(mapLaborGlobalVacationDay);
  }

  public async createGlobalVacationDay(payload: LaborGlobalVacationDayInput) {
    const date = toDate(payload.date);
    if (!date) {
      throw new AppError(400, "LABOR_GLOBAL_VACATION_DATE_REQUIRED", "Captura el día general de vacaciones.");
    }

    const days = Number(payload.days ?? 1);
    if (!Number.isFinite(days) || days <= 0) {
      throw new AppError(400, "INVALID_LABOR_GLOBAL_VACATION_DAYS", "Los días de vacaciones deben ser mayores a cero.");
    }

    const record = await this.prisma.laborGlobalVacationDay.upsert({
      where: { date },
      update: {
        days: new Prisma.Decimal(days),
        description: normalizeText(payload.description) || null
      },
      create: {
        date,
        days: new Prisma.Decimal(days),
        description: normalizeText(payload.description) || null
      },
      select: GLOBAL_VACATION_DAY_SELECT
    });

    return mapLaborGlobalVacationDay(record);
  }

  public async deleteGlobalVacationDay(dayId: string) {
    const record = await this.prisma.laborGlobalVacationDay.findUnique({
      where: { id: dayId },
      select: { id: true }
    });

    if (!record) {
      throw new AppError(404, "LABOR_GLOBAL_VACATION_DAY_NOT_FOUND", "El día general de vacaciones no existe.");
    }

    await this.prisma.laborGlobalVacationDay.delete({ where: { id: dayId } });
  }

  public async syncMissingForUsers() {
    const users = await this.prisma.user.findMany({
      where: {
        role: { not: "SUPERADMIN" },
        legacyRole: { not: "SUPERADMIN" },
        laborFile: { is: null }
      }
    });

    for (const user of users) {
      await this.createForUser(user);
    }
  }

  private async ensureForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { laborFile: { select: { id: true } } }
    });

    if (!user || user.laborFile || !shouldHaveLaborFile(user)) {
      return;
    }

    await this.createForUser(user);
  }

  private async createForUser(user: LaborFileUserSnapshot) {
    if (!shouldHaveLaborFile(user)) {
      return null;
    }

    return this.prisma.laborFile.create({
      data: {
        user: { connect: { id: user.id } },
        ...buildLaborFileSnapshot(user),
        status: "INCOMPLETE"
      }
    });
  }

  private async findOrThrow(laborFileId: string) {
    const record = await this.prisma.laborFile.findUnique({
      where: { id: laborFileId },
      select: { id: true }
    });

    if (!record) {
      throw new AppError(404, "LABOR_FILE_NOT_FOUND", "El expediente laboral no existe.");
    }

    return record;
  }

  private async refreshStatus(laborFileId: string) {
    const laborFile = await this.prisma.laborFile.findUnique({
      where: { id: laborFileId },
      select: {
        specificRole: true,
        documents: {
          select: { documentType: true }
        }
      }
    });

    if (!laborFile) {
      return;
    }

    await this.prisma.laborFile.update({
      where: { id: laborFileId },
      data: {
        status: computeLaborFileStatus({
          specificRole: laborFile.specificRole,
          documentTypes: laborFile.documents.map((document) => document.documentType)
        })
      }
    });
  }

  private async refreshStatuses(where: Prisma.LaborFileWhereInput = {}) {
    const laborFiles = await this.prisma.laborFile.findMany({
      where,
      select: {
        id: true,
        status: true,
        specificRole: true,
        documents: {
          select: { documentType: true }
        }
      }
    });

    for (const laborFile of laborFiles) {
      const nextStatus = computeLaborFileStatus({
        specificRole: laborFile.specificRole,
        documentTypes: laborFile.documents.map((document) => document.documentType)
      });

      if (nextStatus !== laborFile.status) {
        await this.prisma.laborFile.update({
          where: { id: laborFile.id },
          data: { status: nextStatus }
        });
      }
    }
  }

  private findGlobalVacationDayRecords() {
    return this.prisma.laborGlobalVacationDay.findMany({
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: GLOBAL_VACATION_DAY_SELECT
    });
  }
}
