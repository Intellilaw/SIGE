import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Prisma, type PrismaClient } from "@prisma/client";
import {
  LABOR_FILE_DOCUMENT_DEFINITIONS,
  type LaborFile,
  type LaborFileDocument,
  type LaborFileDocumentType,
  type LaborFileUpdateInput,
  type LaborGlobalVacationDay,
  type LaborGlobalVacationDayInput,
  type LaborVacationEvent,
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

type LocalAuthUserSnapshot = Omit<LaborFileUserSnapshot, "createdAt" | "updatedAt"> & {
  permissions?: string[];
  passwordResetRequired?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

interface LocalAuthState {
  users: LocalAuthUserSnapshot[];
}

interface LocalLaborFileDocumentState extends Omit<LaborFileDocument, "fileMimeType"> {
  fileMimeType?: string | null;
  fileBase64: string;
}

interface LocalLaborVacationEventState extends Omit<LaborVacationEvent, "description" | "acceptanceFileMimeType"> {
  description?: string | null;
  acceptanceFileMimeType?: string | null;
  acceptanceFileBase64?: string | null;
}

interface LocalLaborFileState extends Omit<LaborFile, "documents" | "vacationEvents" | "globalVacationDays" | "vacationSummary" | "employeeEmail" | "employeeShortName" | "team" | "legacyTeam" | "specificRole" | "employmentEndedAt" | "notes"> {
  employeeEmail?: string | null;
  employeeShortName?: string | null;
  team?: string | null;
  legacyTeam?: string | null;
  specificRole?: string | null;
  employmentEndedAt?: string | null;
  notes?: string | null;
  documents: LocalLaborFileDocumentState[];
  vacationEvents: LocalLaborVacationEventState[];
}

interface LocalLaborState {
  files: LocalLaborFileState[];
  globalVacationDays: LaborGlobalVacationDay[];
}

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
const LABOR_CONTRACT_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);
const CONTRACT_PREFILL_DOCUMENT_TYPES = new Set<LaborFileDocumentType>([
  "PROOF_OF_ADDRESS",
  "TAX_STATUS_CERTIFICATE",
  "OFFICIAL_ID",
  "CV",
  "PROFESSIONAL_TITLE",
  "PROFESSIONAL_LICENSE"
]);

function isDatabaseUnavailableError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = `${error.name} ${error.message}`;
  return [
    "ECONNREFUSED",
    "Can't reach database server",
    "database server",
    "Connection refused"
  ].some((fragment) => message.includes(fragment));
}

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

function isDocxFile(payload: Pick<LaborFileDocumentUploadRecord, "fileMimeType" | "originalFileName">) {
  const mimeType = normalizeText(payload.fileMimeType).toLowerCase();
  const filename = normalizeText(payload.originalFileName).toLowerCase();
  return mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.endsWith(".docx");
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

  public async listDocumentsForContractPrefill(laborFileId: string) {
    await this.findOrThrow(laborFileId);
    const records = await this.prisma.laborFileDocument.findMany({
      where: {
        laborFileId,
        documentType: {
          in: Array.from(CONTRACT_PREFILL_DOCUMENT_TYPES)
        }
      },
      orderBy: [{ documentType: "asc" }, { uploadedAt: "desc" }],
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
    const seenTypes = new Set<string>();

    return records
      .filter((record) => {
        if (seenTypes.has(record.documentType)) {
          return false;
        }

        seenTypes.add(record.documentType);
        return true;
      })
      .map((record) => ({
        laborFileId: record.laborFileId,
        userId: record.laborFile.userId,
        employeeName: record.laborFile.employeeName,
        documentType: record.documentType as LaborFileDocumentType,
        originalFileName: record.originalFileName,
        fileMimeType: record.fileMimeType,
        fileContent: Buffer.from(record.fileContent)
      }));
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
    if (payload.documentType === "EMPLOYMENT_CONTRACT" && !isPdfFile(payload) && !isDocxFile(payload)) {
      throw new AppError(400, "LABOR_FILE_DOCUMENT_TYPE_NOT_ALLOWED", "El contrato laboral debe ser PDF o DOCX.");
    }

    if (PDF_ONLY_TYPES.has(payload.documentType) && !isPdfFile(payload)) {
      throw new AppError(400, "LABOR_FILE_DOCUMENT_PDF_REQUIRED", "El contrato laboral y sus addenda deben ser PDF.");
    }

    if (
      payload.documentType === "EMPLOYMENT_CONTRACT" &&
      mimeType &&
      !LABOR_CONTRACT_MIME_TYPES.has(mimeType)
    ) {
      throw new AppError(400, "LABOR_FILE_DOCUMENT_TYPE_NOT_ALLOWED", "El contrato laboral debe ser PDF o DOCX.");
    }

    if (
      payload.documentType !== "EMPLOYMENT_CONTRACT" &&
      !PDF_ONLY_TYPES.has(payload.documentType) &&
      mimeType &&
      !ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType)
    ) {
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

function localDate(value?: string | null) {
  const raw = normalizeText(value);
  if (!raw) {
    return new Date(0);
  }

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`)
    : new Date(raw);

  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function normalizeDateKey(value?: string | null) {
  const parsed = toDate(value);
  return parsed ? toDateKey(parsed) : undefined;
}

function getLocalFileSize(payload: LaborFileDocumentUploadRecord) {
  return payload.fileSizeBytes ?? payload.fileContent.byteLength;
}

export class LocalLaborFilesRepository implements LaborFilesRepository {
  private static readonly repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  private static readonly authStatePath = resolve(this.repoRoot, "apps", "api", "runtime-assets", "local-auth-store.json");
  private static readonly statePath = resolve(this.repoRoot, "apps", "api", "runtime-assets", "local-labor-files-store.json");

  private state: LocalLaborState | null = null;

  public static isAvailable() {
    return existsSync(this.authStatePath);
  }

  public async list() {
    await this.syncMissingForUsers();
    this.refreshStatuses();
    const state = this.getState();
    return [...state.files]
      .sort((left, right) =>
        left.employmentStatus.localeCompare(right.employmentStatus) ||
        left.employeeName.localeCompare(right.employeeName)
      )
      .map((record) => this.mapLaborFile(record));
  }

  public async listForUser(userId: string) {
    await this.ensureForUser(userId);
    this.refreshStatuses();
    return this.getState().files
      .filter((record) => record.userId === userId)
      .sort((left, right) => left.employeeName.localeCompare(right.employeeName))
      .map((record) => this.mapLaborFile(record));
  }

  public async findById(laborFileId: string) {
    await this.syncMissingForUsers();
    const record = this.getState().files.find((candidate) => candidate.id === laborFileId);
    return record ? this.mapLaborFile(record) : null;
  }

  public async findDocument(documentId: string) {
    for (const laborFile of this.getState().files) {
      const document = laborFile.documents.find((candidate) => candidate.id === documentId);
      if (document) {
        return {
          laborFileId: laborFile.id,
          userId: laborFile.userId,
          employeeName: laborFile.employeeName,
          documentType: document.documentType,
          originalFileName: document.originalFileName,
          fileMimeType: document.fileMimeType,
          fileContent: Buffer.from(document.fileBase64, "base64")
        };
      }
    }

    return null;
  }

  public async listDocumentsForContractPrefill(laborFileId: string) {
    const laborFile = this.findOrThrow(laborFileId);
    const seenTypes = new Set<string>();
    return [...laborFile.documents]
      .filter((document) => CONTRACT_PREFILL_DOCUMENT_TYPES.has(document.documentType))
      .sort((left, right) =>
        left.documentType.localeCompare(right.documentType) ||
        right.uploadedAt.localeCompare(left.uploadedAt)
      )
      .filter((document) => {
        if (seenTypes.has(document.documentType)) {
          return false;
        }

        seenTypes.add(document.documentType);
        return true;
      })
      .map((document) => ({
        laborFileId: laborFile.id,
        userId: laborFile.userId,
        employeeName: laborFile.employeeName,
        documentType: document.documentType,
        originalFileName: document.originalFileName,
        fileMimeType: document.fileMimeType,
        fileContent: Buffer.from(document.fileBase64, "base64")
      }));
  }

  public async findVacationAcceptanceDocument(eventId: string) {
    for (const laborFile of this.getState().files) {
      const event = laborFile.vacationEvents.find((candidate) => candidate.id === eventId);
      if (event?.acceptanceOriginalFileName && event.acceptanceFileBase64) {
        return {
          laborFileId: laborFile.id,
          userId: laborFile.userId,
          employeeName: laborFile.employeeName,
          originalFileName: event.acceptanceOriginalFileName,
          fileMimeType: event.acceptanceFileMimeType,
          fileContent: Buffer.from(event.acceptanceFileBase64, "base64")
        };
      }
    }

    return null;
  }

  public async update(laborFileId: string, payload: LaborFileUpdateInput) {
    let updated: LocalLaborFileState | null = null;
    this.updateState((state) => {
      const laborFile = this.findOrThrowInState(state, laborFileId);
      if (payload.hireDate !== undefined) {
        laborFile.hireDate = normalizeDateKey(payload.hireDate) ?? laborFile.hireDate;
      }
      if (payload.notes !== undefined) {
        laborFile.notes = normalizeText(payload.notes) || null;
      }
      laborFile.updatedAt = new Date().toISOString();
      updated = laborFile;
    });

    return this.mapLaborFile(updated!);
  }

  public async uploadDocument(laborFileId: string, payload: LaborFileDocumentUploadRecord) {
    validateDocumentType(payload.documentType);

    const filename = normalizeText(payload.originalFileName);
    if (!filename) {
      throw new AppError(400, "LABOR_FILE_DOCUMENT_NAME_REQUIRED", "El nombre del archivo es obligatorio.");
    }

    if (!payload.fileContent.byteLength) {
      throw new AppError(400, "LABOR_FILE_DOCUMENT_REQUIRED", "El archivo es obligatorio.");
    }

    const mimeType = normalizeText(payload.fileMimeType).toLowerCase();
    if (payload.documentType === "EMPLOYMENT_CONTRACT" && !isPdfFile(payload) && !isDocxFile(payload)) {
      throw new AppError(400, "LABOR_FILE_DOCUMENT_TYPE_NOT_ALLOWED", "El contrato laboral debe ser PDF o DOCX.");
    }

    if (PDF_ONLY_TYPES.has(payload.documentType) && !isPdfFile(payload)) {
      throw new AppError(400, "LABOR_FILE_DOCUMENT_PDF_REQUIRED", "El contrato laboral y sus addenda deben ser PDF.");
    }

    if (
      payload.documentType === "EMPLOYMENT_CONTRACT" &&
      mimeType &&
      !LABOR_CONTRACT_MIME_TYPES.has(mimeType)
    ) {
      throw new AppError(400, "LABOR_FILE_DOCUMENT_TYPE_NOT_ALLOWED", "El contrato laboral debe ser PDF o DOCX.");
    }

    if (
      payload.documentType !== "EMPLOYMENT_CONTRACT" &&
      !PDF_ONLY_TYPES.has(payload.documentType) &&
      mimeType &&
      !ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType)
    ) {
      throw new AppError(400, "LABOR_FILE_DOCUMENT_TYPE_NOT_ALLOWED", "Solo se permiten archivos PDF, JPG o PNG.");
    }

    let created: LocalLaborFileDocumentState | null = null;
    this.updateState((state) => {
      const laborFile = this.findOrThrowInState(state, laborFileId);
      const now = new Date().toISOString();
      created = {
        id: randomUUID(),
        laborFileId,
        documentType: payload.documentType,
        originalFileName: filename,
        fileMimeType: mimeType || null,
        fileSizeBytes: getLocalFileSize(payload),
        fileBase64: payload.fileContent.toString("base64"),
        uploadedAt: now,
        createdAt: now,
        updatedAt: now
      };
      laborFile.documents.push(created);
      this.refreshStatusForRecord(laborFile);
    });

    return this.mapDocument(created!);
  }

  public async deleteDocument(documentId: string) {
    let deleted = false;
    this.updateState((state) => {
      for (const laborFile of state.files) {
        const nextDocuments = laborFile.documents.filter((document) => document.id !== documentId);
        if (nextDocuments.length !== laborFile.documents.length) {
          laborFile.documents = nextDocuments;
          this.refreshStatusForRecord(laborFile);
          deleted = true;
          break;
        }
      }
    });

    if (!deleted) {
      throw new AppError(404, "LABOR_FILE_DOCUMENT_NOT_FOUND", "El documento no existe.");
    }
  }

  public async createVacationEvent(laborFileId: string, payload: LaborVacationEventInput) {
    if (payload.eventType !== "PREVIOUS_YEAR_DEDUCTION" && payload.eventType !== "VACATION") {
      throw new AppError(400, "INVALID_LABOR_VACATION_EVENT_TYPE", "Tipo de movimiento de vacaciones invalido.");
    }

    const vacationDateKeys = payload.eventType === "VACATION" ? getVacationDateKeys(payload) : [];
    const days = payload.eventType === "VACATION" ? vacationDateKeys.length : Number(payload.days);
    if (!Number.isFinite(days) || days <= 0) {
      throw new AppError(400, "INVALID_LABOR_VACATION_DAYS", "Los dias de vacaciones deben ser mayores a cero.");
    }

    if (payload.eventType === "VACATION" && vacationDateKeys.length === 0) {
      throw new AppError(400, "LABOR_VACATION_DATE_REQUIRED", "Captura al menos un dia de vacaciones.");
    }

    const startDate = payload.eventType === "VACATION"
      ? vacationDateKeys[0]
      : normalizeDateKey(payload.startDate);
    const endDate = payload.eventType === "VACATION"
      ? vacationDateKeys[vacationDateKeys.length - 1]
      : normalizeDateKey(payload.endDate) ?? startDate;

    const acceptanceOriginalFileName = normalizeText(payload.acceptanceOriginalFileName);
    const acceptanceFileMimeType = normalizeText(payload.acceptanceFileMimeType).toLowerCase();
    const acceptanceFileContent = decodeBase64File(payload.acceptanceFileBase64);

    if (payload.eventType === "VACATION") {
      if (!acceptanceOriginalFileName || !acceptanceFileContent?.byteLength) {
        throw new AppError(400, "LABOR_VACATION_ACCEPTANCE_PDF_REQUIRED", "Carga el formato de aceptacion de vacaciones en PDF.");
      }

      if (!isPdfFile({ originalFileName: acceptanceOriginalFileName, fileMimeType: acceptanceFileMimeType })) {
        throw new AppError(400, "LABOR_VACATION_ACCEPTANCE_PDF_REQUIRED", "El formato de aceptacion de vacaciones debe ser PDF.");
      }
    }

    let created: LocalLaborVacationEventState | null = null;
    this.updateState((state) => {
      const laborFile = this.findOrThrowInState(state, laborFileId);
      const now = new Date().toISOString();
      created = {
        id: randomUUID(),
        laborFileId,
        eventType: payload.eventType,
        startDate,
        endDate,
        vacationDates: payload.eventType === "VACATION" ? vacationDateKeys : [],
        days,
        description: normalizeText(payload.description) || null,
        acceptanceOriginalFileName: payload.eventType === "VACATION" ? acceptanceOriginalFileName : undefined,
        acceptanceFileMimeType: payload.eventType === "VACATION" ? acceptanceFileMimeType || "application/pdf" : null,
        acceptanceFileSizeBytes: payload.eventType === "VACATION" ? acceptanceFileContent?.byteLength : undefined,
        acceptanceFileBase64: payload.eventType === "VACATION" && acceptanceFileContent
          ? acceptanceFileContent.toString("base64")
          : null,
        createdAt: now,
        updatedAt: now
      };
      laborFile.vacationEvents.push(created);
      laborFile.updatedAt = now;
    });

    return this.mapVacationEvent(created!);
  }

  public async deleteVacationEvent(eventId: string) {
    let deleted = false;
    this.updateState((state) => {
      for (const laborFile of state.files) {
        const nextEvents = laborFile.vacationEvents.filter((event) => event.id !== eventId);
        if (nextEvents.length !== laborFile.vacationEvents.length) {
          laborFile.vacationEvents = nextEvents;
          laborFile.updatedAt = new Date().toISOString();
          deleted = true;
          break;
        }
      }
    });

    if (!deleted) {
      throw new AppError(404, "LABOR_VACATION_EVENT_NOT_FOUND", "El movimiento de vacaciones no existe.");
    }
  }

  public async listGlobalVacationDays() {
    return [...this.getState().globalVacationDays].sort((left, right) =>
      left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt)
    );
  }

  public async createGlobalVacationDay(payload: LaborGlobalVacationDayInput) {
    const date = normalizeDateKey(payload.date);
    if (!date) {
      throw new AppError(400, "LABOR_GLOBAL_VACATION_DATE_REQUIRED", "Captura el dia general de vacaciones.");
    }

    const days = Number(payload.days ?? 1);
    if (!Number.isFinite(days) || days <= 0) {
      throw new AppError(400, "INVALID_LABOR_GLOBAL_VACATION_DAYS", "Los dias de vacaciones deben ser mayores a cero.");
    }

    let saved: LaborGlobalVacationDay | null = null;
    this.updateState((state) => {
      const now = new Date().toISOString();
      const existing = state.globalVacationDays.find((day) => day.date === date);
      if (existing) {
        existing.days = days;
        existing.description = normalizeText(payload.description) || undefined;
        existing.updatedAt = now;
        saved = existing;
        return;
      }

      saved = {
        id: randomUUID(),
        date,
        days,
        description: normalizeText(payload.description) || undefined,
        createdAt: now,
        updatedAt: now
      };
      state.globalVacationDays.push(saved);
    });

    return saved!;
  }

  public async deleteGlobalVacationDay(dayId: string) {
    let deleted = false;
    this.updateState((state) => {
      const nextDays = state.globalVacationDays.filter((day) => day.id !== dayId);
      deleted = nextDays.length !== state.globalVacationDays.length;
      state.globalVacationDays = nextDays;
    });

    if (!deleted) {
      throw new AppError(404, "LABOR_GLOBAL_VACATION_DAY_NOT_FOUND", "El dia general de vacaciones no existe.");
    }
  }

  public async syncMissingForUsers() {
    const users = this.readLocalUsers();
    this.updateState((state) => {
      for (const user of users) {
        const snapshot = this.toLaborFileUserSnapshot(user);
        if (!snapshot || !shouldHaveLaborFile(snapshot)) {
          continue;
        }

        const existing = state.files.find((file) => file.userId === snapshot.id);
        if (existing) {
          const nextSnapshot = buildLaborFileSnapshot(snapshot);
          existing.employeeName = nextSnapshot.employeeName;
          existing.employeeEmail = nextSnapshot.employeeEmail;
          existing.employeeUsername = snapshot.username;
          existing.employeeShortName = nextSnapshot.employeeShortName;
          existing.team = nextSnapshot.team;
          existing.legacyTeam = nextSnapshot.legacyTeam;
          existing.specificRole = nextSnapshot.specificRole;
          existing.employmentStatus = nextSnapshot.employmentStatus as LocalLaborFileState["employmentStatus"];
          existing.employmentEndedAt = nextSnapshot.employmentEndedAt ? toDateKey(nextSnapshot.employmentEndedAt) : null;
          this.refreshStatusForRecord(existing);
          continue;
        }

        state.files.push(this.createLocalFile(snapshot));
      }
    });
  }

  private ensureForUser(userId: string) {
    const user = this.readLocalUsers().find((candidate) => candidate.id === userId);
    const snapshot = user ? this.toLaborFileUserSnapshot(user) : null;
    if (!snapshot || !shouldHaveLaborFile(snapshot)) {
      return;
    }

    this.updateState((state) => {
      if (!state.files.some((file) => file.userId === userId)) {
        state.files.push(this.createLocalFile(snapshot));
      }
    });
  }

  private getState() {
    if (!this.state) {
      this.state = this.loadState();
    }

    return this.state;
  }

  private loadState(): LocalLaborState {
    if (!existsSync(LocalLaborFilesRepository.statePath)) {
      return {
        files: [],
        globalVacationDays: []
      };
    }

    const parsed = JSON.parse(readFileSync(LocalLaborFilesRepository.statePath, "utf8")) as Partial<LocalLaborState>;
    return {
      files: Array.isArray(parsed.files) ? parsed.files : [],
      globalVacationDays: Array.isArray(parsed.globalVacationDays) ? parsed.globalVacationDays : []
    };
  }

  private updateState(mutator: (state: LocalLaborState) => void) {
    const state = this.getState();
    mutator(state);
    this.persistState(state);
  }

  private persistState(state: LocalLaborState) {
    mkdirSync(dirname(LocalLaborFilesRepository.statePath), { recursive: true });
    writeFileSync(LocalLaborFilesRepository.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  private readLocalUsers() {
    if (!existsSync(LocalLaborFilesRepository.authStatePath)) {
      return [];
    }

    const parsed = JSON.parse(readFileSync(LocalLaborFilesRepository.authStatePath, "utf8")) as Partial<LocalAuthState>;
    return Array.isArray(parsed.users) ? parsed.users : [];
  }

  private toLaborFileUserSnapshot(user: LocalAuthUserSnapshot): LaborFileUserSnapshot | null {
    if (!user.id || !user.username) {
      return null;
    }

    return {
      id: user.id,
      email: normalizeText(user.email) || `${user.username}@local.sige`,
      username: user.username,
      displayName: normalizeText(user.displayName) || user.username,
      shortName: normalizeText(user.shortName) || null,
      role: user.role,
      legacyRole: user.legacyRole,
      team: normalizeText(user.team) || null,
      legacyTeam: normalizeText(user.legacyTeam) || null,
      specificRole: normalizeText(user.specificRole) || null,
      isActive: user.isActive !== false,
      createdAt: localDate(user.createdAt),
      updatedAt: localDate(user.updatedAt)
    };
  }

  private createLocalFile(user: LaborFileUserSnapshot): LocalLaborFileState {
    const now = new Date().toISOString();
    const snapshot = buildLaborFileSnapshot(user);
    const record: LocalLaborFileState = {
      id: randomUUID(),
      userId: user.id,
      employeeName: snapshot.employeeName,
      employeeEmail: snapshot.employeeEmail,
      employeeUsername: user.username,
      employeeShortName: snapshot.employeeShortName,
      team: snapshot.team,
      legacyTeam: snapshot.legacyTeam,
      specificRole: snapshot.specificRole,
      status: "INCOMPLETE",
      employmentStatus: snapshot.employmentStatus as LocalLaborFileState["employmentStatus"],
      hireDate: toDateKey(snapshot.hireDate),
      employmentEndedAt: snapshot.employmentEndedAt ? toDateKey(snapshot.employmentEndedAt) : null,
      notes: null,
      documents: [],
      vacationEvents: [],
      createdAt: now,
      updatedAt: now
    };

    this.refreshStatusForRecord(record);
    return record;
  }

  private findOrThrow(laborFileId: string) {
    return this.findOrThrowInState(this.getState(), laborFileId);
  }

  private findOrThrowInState(state: LocalLaborState, laborFileId: string) {
    const laborFile = state.files.find((candidate) => candidate.id === laborFileId);
    if (!laborFile) {
      throw new AppError(404, "LABOR_FILE_NOT_FOUND", "El expediente laboral no existe.");
    }

    return laborFile;
  }

  private refreshStatuses() {
    this.updateState((state) => {
      state.files.forEach((file) => this.refreshStatusForRecord(file));
    });
  }

  private refreshStatusForRecord(laborFile: LocalLaborFileState) {
    laborFile.status = computeLaborFileStatus({
      specificRole: laborFile.specificRole,
      documentTypes: laborFile.documents.map((document) => document.documentType)
    });
    laborFile.updatedAt = new Date().toISOString();
  }

  private mapLaborFile(record: LocalLaborFileState) {
    return mapLaborFile({
      id: record.id,
      userId: record.userId ?? null,
      employeeName: record.employeeName,
      employeeEmail: record.employeeEmail ?? null,
      employeeUsername: record.employeeUsername,
      employeeShortName: record.employeeShortName ?? null,
      team: record.team ?? null,
      legacyTeam: record.legacyTeam ?? null,
      specificRole: record.specificRole ?? null,
      status: record.status,
      employmentStatus: record.employmentStatus,
      hireDate: localDate(record.hireDate),
      employmentEndedAt: record.employmentEndedAt ? localDate(record.employmentEndedAt) : null,
      notes: record.notes ?? null,
      documents: record.documents.map((document) => this.mapDocumentRecord(document)),
      vacationEvents: record.vacationEvents.map((event) => this.mapVacationEventRecord(event)),
      createdAt: localDate(record.createdAt),
      updatedAt: localDate(record.updatedAt)
    }, this.getState().globalVacationDays.map((day) => ({
      id: day.id,
      date: localDate(day.date),
      days: new Prisma.Decimal(day.days),
      description: day.description ?? null,
      createdAt: localDate(day.createdAt),
      updatedAt: localDate(day.updatedAt)
    })));
  }

  private mapDocument(document: LocalLaborFileDocumentState) {
    return mapLaborFileDocument(this.mapDocumentRecord(document));
  }

  private mapDocumentRecord(document: LocalLaborFileDocumentState): Parameters<typeof mapLaborFileDocument>[0] {
    return {
      id: document.id,
      laborFileId: document.laborFileId,
      documentType: document.documentType,
      originalFileName: document.originalFileName,
      fileMimeType: document.fileMimeType ?? null,
      fileSizeBytes: document.fileSizeBytes ?? null,
      uploadedAt: localDate(document.uploadedAt),
      createdAt: localDate(document.createdAt),
      updatedAt: localDate(document.updatedAt)
    };
  }

  private mapVacationEvent(event: LocalLaborVacationEventState) {
    return mapLaborVacationEvent(this.mapVacationEventRecord(event));
  }

  private mapVacationEventRecord(event: LocalLaborVacationEventState): Parameters<typeof mapLaborVacationEvent>[0] {
    return {
      id: event.id,
      laborFileId: event.laborFileId,
      eventType: event.eventType,
      startDate: event.startDate ? localDate(event.startDate) : null,
      endDate: event.endDate ? localDate(event.endDate) : null,
      vacationDates: event.vacationDates ?? [],
      days: new Prisma.Decimal(event.days),
      description: event.description ?? null,
      acceptanceOriginalFileName: event.acceptanceOriginalFileName ?? null,
      acceptanceFileMimeType: event.acceptanceFileMimeType ?? null,
      acceptanceFileSizeBytes: event.acceptanceFileSizeBytes ?? null,
      createdAt: localDate(event.createdAt),
      updatedAt: localDate(event.updatedAt)
    };
  }
}

export class ResilientLaborFilesRepository implements LaborFilesRepository {
  private warned = false;

  public constructor(
    private readonly primary: LaborFilesRepository,
    private readonly fallback: LaborFilesRepository | null,
    private readonly logger?: { warn: (message: string) => void }
  ) {}

  public list() {
    return this.withFallback(() => this.primary.list(), () => this.fallback?.list() ?? Promise.resolve([]));
  }

  public listForUser(userId: string) {
    return this.withFallback(
      () => this.primary.listForUser(userId),
      () => this.fallback?.listForUser(userId) ?? Promise.resolve([])
    );
  }

  public findById(laborFileId: string) {
    return this.withFallback(
      () => this.primary.findById(laborFileId),
      () => this.fallback?.findById(laborFileId) ?? Promise.resolve(null)
    );
  }

  public findDocument(documentId: string) {
    return this.withFallback(
      () => this.primary.findDocument(documentId),
      () => this.fallback?.findDocument(documentId) ?? Promise.resolve(null)
    );
  }

  public listDocumentsForContractPrefill(laborFileId: string) {
    return this.withFallback(
      () => this.primary.listDocumentsForContractPrefill(laborFileId),
      () => this.fallback?.listDocumentsForContractPrefill(laborFileId) ?? Promise.resolve([])
    );
  }

  public findVacationAcceptanceDocument(eventId: string) {
    return this.withFallback(
      () => this.primary.findVacationAcceptanceDocument(eventId),
      () => this.fallback?.findVacationAcceptanceDocument(eventId) ?? Promise.resolve(null)
    );
  }

  public update(laborFileId: string, payload: LaborFileUpdateInput) {
    return this.withFallback(() => this.primary.update(laborFileId, payload), () => this.fallback!.update(laborFileId, payload));
  }

  public uploadDocument(laborFileId: string, payload: LaborFileDocumentUploadRecord) {
    return this.withFallback(
      () => this.primary.uploadDocument(laborFileId, payload),
      () => this.fallback!.uploadDocument(laborFileId, payload)
    );
  }

  public deleteDocument(documentId: string) {
    return this.withFallback(() => this.primary.deleteDocument(documentId), () => this.fallback!.deleteDocument(documentId));
  }

  public createVacationEvent(laborFileId: string, payload: LaborVacationEventInput) {
    return this.withFallback(
      () => this.primary.createVacationEvent(laborFileId, payload),
      () => this.fallback!.createVacationEvent(laborFileId, payload)
    );
  }

  public deleteVacationEvent(eventId: string) {
    return this.withFallback(() => this.primary.deleteVacationEvent(eventId), () => this.fallback!.deleteVacationEvent(eventId));
  }

  public listGlobalVacationDays() {
    return this.withFallback(
      () => this.primary.listGlobalVacationDays(),
      () => this.fallback?.listGlobalVacationDays() ?? Promise.resolve([])
    );
  }

  public createGlobalVacationDay(payload: LaborGlobalVacationDayInput) {
    return this.withFallback(() => this.primary.createGlobalVacationDay(payload), () => this.fallback!.createGlobalVacationDay(payload));
  }

  public deleteGlobalVacationDay(dayId: string) {
    return this.withFallback(() => this.primary.deleteGlobalVacationDay(dayId), () => this.fallback!.deleteGlobalVacationDay(dayId));
  }

  public syncMissingForUsers() {
    return this.withFallback(() => this.primary.syncMissingForUsers(), () => this.fallback?.syncMissingForUsers() ?? Promise.resolve());
  }

  private async withFallback<T>(primaryAction: () => Promise<T>, fallbackAction: () => Promise<T>) {
    try {
      return await primaryAction();
    } catch (error) {
      if (!this.fallback || !isDatabaseUnavailableError(error)) {
        throw error;
      }

      if (!this.warned) {
        this.warned = true;
        this.logger?.warn("Database unavailable. Using local development labor files fallback.");
      }

      return fallbackAction();
    }
  }
}
