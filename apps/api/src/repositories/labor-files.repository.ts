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
  type LaborPreviousYearPendingVacationInput,
  type LaborVacationEvent,
  type LaborVacationEventInput
} from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import {
  LABOR_SALARY_EXTRACTION_DETAIL_VERSION,
  extractLaborSalaryFromDocument,
  formatLaborSalaryExtractionDetail,
  formatLaborSalaryExtractionFailureDetail,
  isLaborSalaryDocumentType
} from "../modules/labor-files/labor-salary-intelligence";
import { mapLaborFile, mapLaborFileDocument, mapLaborGlobalVacationDay, mapLaborVacationEvent } from "./mappers";
import type { LaborFileDocumentUploadRecord, LaborFilesRepository, LaborVacationAcceptanceUploadRecord } from "./types";

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
  createLaborFile?: boolean;
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

interface LocalLaborFileState extends Omit<LaborFile, "documents" | "vacationEvents" | "globalVacationDays" | "vacationSummary" | "employeeEmail" | "employeeShortName" | "personalPhone" | "personalEmail" | "emergencyContactName" | "emergencyContactPhone" | "emergencyContactAddress" | "team" | "legacyTeam" | "specificRole" | "employmentEndedAt" | "notes"> {
  employeeEmail?: string | null;
  employeeShortName?: string | null;
  personalPhone?: string | null;
  personalEmail?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactAddress?: string | null;
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

type PreviousYearPendingVacationWrite = LaborPreviousYearPendingVacationInput & {
  previousYearStartDate: string;
  previousYearEndDate: string;
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
        riExtractedDailySalaryMxn: true,
        riExtractedMonthlyGrossSalaryMxn: true,
        riSalaryExtractionDetail: true,
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
  vacationDates: true,
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
const VACATION_ACCEPTANCE_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);
const CONTRACT_PREFILL_DOCUMENT_TYPES = new Set<LaborFileDocumentType>([
  "PROOF_OF_ADDRESS",
  "TAX_STATUS_CERTIFICATE",
  "CURP",
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

function normalizeMoney(value?: number | null) {
  const numeric = Number(value ?? 0);
  return new Prisma.Decimal(Number.isFinite(numeric) ? Math.max(0, numeric) : 0);
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

function isVacationRequestEventType(eventType: LaborVacationEvent["eventType"]) {
  return eventType === "VACATION" || eventType === "GLOBAL_VACATION";
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

function getGlobalVacationDateKeys(payload: LaborGlobalVacationDayInput) {
  const explicitDateKeys = (payload.vacationDates ?? [])
    .map((date) => toDate(date))
    .filter((date): date is Date => Boolean(date))
    .map(toDateKey);

  if (explicitDateKeys.length > 0) {
    return Array.from(new Set(explicitDateKeys)).sort();
  }

  const startDate = toDate(payload.date);
  if (!startDate) {
    return [];
  }

  const days = Number(payload.days ?? 1);
  if (!Number.isInteger(days) || days <= 1) {
    return [toDateKey(startDate)];
  }

  return Array.from(new Set(enumerateDateKeys(startDate, addDays(startDate, days - 1)))).sort();
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

function isVacationAcceptanceFile(payload: Pick<LaborFileDocumentUploadRecord, "fileMimeType" | "originalFileName">) {
  return isPdfFile(payload) || isDocxFile(payload);
}

function getDocumentDefinition(documentType: LaborFileDocumentType) {
  return LABOR_FILE_DOCUMENT_DEFINITIONS.find((definition) => definition.type === documentType);
}

function validateDocumentType(documentType: LaborFileDocumentType) {
  if (!KNOWN_DOCUMENT_TYPES.has(documentType)) {
    throw new AppError(400, "INVALID_LABOR_FILE_DOCUMENT_TYPE", "Tipo de documento laboral inválido.");
  }
}

function validateLaborDocumentFile(documentType: LaborFileDocumentType, payload: Pick<LaborFileDocumentUploadRecord, "fileMimeType" | "originalFileName">) {
  const definition = getDocumentDefinition(documentType);
  const label = definition?.label ?? "El documento";
  const mimeType = normalizeText(payload.fileMimeType).toLowerCase();

  if (definition?.wordAllowed && !isPdfFile(payload) && !isDocxFile(payload)) {
    throw new AppError(400, "LABOR_FILE_DOCUMENT_TYPE_NOT_ALLOWED", `${label} debe ser PDF o DOCX.`);
  }

  if (PDF_ONLY_TYPES.has(documentType) && !isPdfFile(payload)) {
    throw new AppError(400, "LABOR_FILE_DOCUMENT_PDF_REQUIRED", `${label} debe ser PDF.`);
  }

  if (definition?.wordAllowed && mimeType && !LABOR_CONTRACT_MIME_TYPES.has(mimeType)) {
    throw new AppError(400, "LABOR_FILE_DOCUMENT_TYPE_NOT_ALLOWED", `${label} debe ser PDF o DOCX.`);
  }

  if (!definition?.wordAllowed && !PDF_ONLY_TYPES.has(documentType) && mimeType && !ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType)) {
    throw new AppError(400, "LABOR_FILE_DOCUMENT_TYPE_NOT_ALLOWED", "Solo se permiten archivos PDF, JPG o PNG.");
  }
}

function assertDocumentLimit(documentType: LaborFileDocumentType, currentCount: number) {
  const definition = getDocumentDefinition(documentType);
  if (!definition?.maxFiles || currentCount < definition.maxFiles) {
    return;
  }

  throw new AppError(
    400,
    "LABOR_FILE_DOCUMENT_LIMIT_REACHED",
    `Solo se pueden cargar hasta ${definition.maxFiles} archivos para ${definition.label}.`
  );
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

function attachSalaryExtractionToDocument(
  document: LaborFileDocument,
  extraction: Awaited<ReturnType<typeof extractLaborSalaryFromDocument>>
) {
  if (!extraction) {
    return document;
  }

  return {
    ...document,
    riExtractedDailySalaryMxn: extraction.dailySalaryMxn,
    riExtractedMonthlyGrossSalaryMxn: extraction.monthlyGrossSalaryMxn,
    riSalaryExtractionDetail: formatLaborSalaryExtractionDetail(extraction)
  } satisfies LaborFileDocument;
}

function getSalaryExtractionWriteData(
  originalFileName: string,
  extraction: Awaited<ReturnType<typeof extractLaborSalaryFromDocument>>
) {
  return extraction
    ? {
        riExtractedDailySalaryMxn: normalizeMoney(extraction.dailySalaryMxn),
        riExtractedMonthlyGrossSalaryMxn: extraction.monthlyGrossSalaryMxn === undefined
          ? null
          : normalizeMoney(extraction.monthlyGrossSalaryMxn),
        riSalaryExtractionDetail: formatLaborSalaryExtractionDetail(extraction)
      }
    : {
        riExtractedDailySalaryMxn: null,
        riExtractedMonthlyGrossSalaryMxn: null,
        riSalaryExtractionDetail: formatLaborSalaryExtractionFailureDetail(originalFileName)
      };
}

function getLocalSalaryExtractionData(
  originalFileName: string,
  extraction: Awaited<ReturnType<typeof extractLaborSalaryFromDocument>>
) {
  return extraction
    ? {
        riExtractedDailySalaryMxn: extraction.dailySalaryMxn,
        riExtractedMonthlyGrossSalaryMxn: extraction.monthlyGrossSalaryMxn,
        riSalaryExtractionDetail: formatLaborSalaryExtractionDetail(extraction)
      }
    : {
        riExtractedDailySalaryMxn: undefined,
        riExtractedMonthlyGrossSalaryMxn: undefined,
        riSalaryExtractionDetail: formatLaborSalaryExtractionFailureDetail(originalFileName)
      };
}

function shouldRefreshSalaryExtractionCache(document: {
  documentType: string;
  riSalaryExtractionDetail?: string | null;
}) {
  return isLaborSalaryDocumentType(document.documentType) &&
    !document.riSalaryExtractionDetail?.includes(LABOR_SALARY_EXTRACTION_DETAIL_VERSION);
}

export function shouldHaveLaborFile(user: Pick<LaborFileUserSnapshot, "role" | "legacyRole" | "createLaborFile">) {
  return user.createLaborFile !== false && user.role !== "SUPERADMIN" && user.legacyRole !== "SUPERADMIN";
}

function shouldExposeLaborFile(record: { user?: Pick<LaborFileUserSnapshot, "role" | "legacyRole" | "createLaborFile"> | null }) {
  return !record.user || shouldHaveLaborFile(record.user);
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

export function buildLaborFileUserSyncSnapshot(user: LaborFileUserSnapshot) {
  const snapshot = buildLaborFileSnapshot(user);
  return {
    employeeName: snapshot.employeeName,
    employeeEmail: snapshot.employeeEmail,
    employeeUsername: snapshot.employeeUsername,
    employeeShortName: snapshot.employeeShortName,
    team: snapshot.team,
    legacyTeam: snapshot.legacyTeam,
    specificRole: snapshot.specificRole,
    employmentStatus: snapshot.employmentStatus,
    employmentEndedAt: snapshot.employmentEndedAt
  };
}

export class PrismaLaborFilesRepository implements LaborFilesRepository {
  private salaryExtractionRefresh: Promise<void> | null = null;

  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    await this.syncMissingForUsers();
    await this.refreshStatuses();
    this.scheduleSalaryExtractionCacheRefresh();
    const [records, globalVacationDays] = await Promise.all([
      this.prisma.laborFile.findMany({
        include: {
          ...LABOR_FILE_RELATIONS,
          user: {
            select: {
              role: true,
              legacyRole: true,
              createLaborFile: true
            }
          }
        },
        orderBy: [{ employmentStatus: "asc" }, { employeeName: "asc" }]
      }),
      this.findGlobalVacationDayRecords()
    ]);

    return records.filter(shouldExposeLaborFile).map((record) => mapLaborFile(record, globalVacationDays));
  }

  public async listForUser(userId: string) {
    await this.ensureForUser(userId);
    await this.refreshStatuses({ userId });
    this.scheduleSalaryExtractionCacheRefresh({ userId });
    const [records, globalVacationDays] = await Promise.all([
      this.prisma.laborFile.findMany({
        where: { userId },
        include: {
          ...LABOR_FILE_RELATIONS,
          user: {
            select: {
              role: true,
              legacyRole: true,
              createLaborFile: true
            }
          }
        },
        orderBy: [{ employeeName: "asc" }]
      }),
      this.findGlobalVacationDayRecords()
    ]);

    return records.filter(shouldExposeLaborFile).map((record) => mapLaborFile(record, globalVacationDays));
  }

  public async findById(laborFileId: string) {
    this.scheduleSalaryExtractionCacheRefresh({ id: laborFileId });
    const [record, globalVacationDays] = await Promise.all([
      this.prisma.laborFile.findUnique({
        where: { id: laborFileId },
        include: {
          ...LABOR_FILE_RELATIONS,
          user: {
            select: {
              role: true,
              legacyRole: true,
              createLaborFile: true
            }
          }
        }
      }),
      this.findGlobalVacationDayRecords()
    ]);

    if (!record || !shouldExposeLaborFile(record)) {
      return null;
    }

    return mapLaborFile(record, globalVacationDays);
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
        dailySalaryMxn: payload.dailySalaryMxn === undefined ? undefined : normalizeMoney(payload.dailySalaryMxn),
        personalPhone: payload.personalPhone === undefined ? undefined : normalizeText(payload.personalPhone) || null,
        personalEmail: payload.personalEmail === undefined ? undefined : normalizeText(payload.personalEmail) || null,
        emergencyContactName: payload.emergencyContactName === undefined ? undefined : normalizeText(payload.emergencyContactName) || null,
        emergencyContactPhone: payload.emergencyContactPhone === undefined ? undefined : normalizeText(payload.emergencyContactPhone) || null,
        emergencyContactAddress: payload.emergencyContactAddress === undefined ? undefined : normalizeText(payload.emergencyContactAddress) || null,
        notes: payload.notes === undefined ? undefined : normalizeText(payload.notes) || null
      },
      include: LABOR_FILE_RELATIONS
    });

    return mapLaborFile(record);
  }

  public async archive(laborFileId: string) {
    const existing = await this.prisma.laborFile.findUnique({
      where: { id: laborFileId },
      select: {
        id: true,
        employmentStatus: true,
        employmentEndedAt: true
      }
    });

    if (!existing) {
      throw new AppError(404, "LABOR_FILE_NOT_FOUND", "El expediente laboral no existe.");
    }

    const record = await this.prisma.laborFile.update({
      where: { id: laborFileId },
      data: {
        employmentStatus: "ARCHIVED",
        employmentEndedAt: existing.employmentStatus === "FORMER"
          ? existing.employmentEndedAt ?? new Date()
          : existing.employmentEndedAt
      },
      include: LABOR_FILE_RELATIONS
    });

    return mapLaborFile(record);
  }

  public async restore(laborFileId: string) {
    await this.findOrThrow(laborFileId);
    const record = await this.prisma.laborFile.update({
      where: { id: laborFileId },
      data: {
        employmentStatus: "ACTIVE",
        employmentEndedAt: null
      },
      include: LABOR_FILE_RELATIONS
    });

    return mapLaborFile(record);
  }

  public async deleteLaborFile(laborFileId: string) {
    const existing = await this.prisma.laborFile.findUnique({
      where: { id: laborFileId },
      select: { id: true, employmentStatus: true }
    });

    if (!existing) {
      throw new AppError(404, "LABOR_FILE_NOT_FOUND", "El expediente laboral no existe.");
    }

    if (existing.employmentStatus !== "ARCHIVED") {
      throw new AppError(
        400,
        "LABOR_FILE_DELETE_REQUIRES_ARCHIVE",
        "Primero envia el expediente laboral al archivo historico antes de borrarlo."
      );
    }

    await this.prisma.laborFile.delete({ where: { id: laborFileId } });
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
    validateLaborDocumentFile(payload.documentType, payload);
    const currentCount = await this.prisma.laborFileDocument.count({
      where: { laborFileId, documentType: payload.documentType }
    });
    assertDocumentLimit(payload.documentType, currentCount);
    const salaryExtraction = isLaborSalaryDocumentType(payload.documentType)
      ? await extractLaborSalaryFromDocument({
          id: "pending",
          documentType: payload.documentType,
          originalFileName: filename,
          fileMimeType: mimeType || null,
          uploadedAt: new Date(),
          fileContent: payload.fileContent
        })
      : null;

    const record = await this.prisma.laborFileDocument.create({
      data: {
        laborFileId,
        documentType: payload.documentType,
        originalFileName: filename,
        fileMimeType: mimeType || null,
        fileSizeBytes: payload.fileSizeBytes ?? payload.fileContent.byteLength,
        fileContent: toPrismaBytes(payload.fileContent),
        ...(isLaborSalaryDocumentType(payload.documentType)
          ? getSalaryExtractionWriteData(filename, salaryExtraction)
          : {})
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

    if (
      payload.eventType !== "PREVIOUS_YEAR_DEDUCTION" &&
      payload.eventType !== "PREVIOUS_YEAR_PENDING" &&
      payload.eventType !== "VACATION" &&
      payload.eventType !== "GLOBAL_VACATION"
    ) {
      throw new AppError(400, "INVALID_LABOR_VACATION_EVENT_TYPE", "Tipo de movimiento de vacaciones inválido.");
    }

    const isVacationRequest = isVacationRequestEventType(payload.eventType);
    const vacationDateKeys = isVacationRequest ? getVacationDateKeys(payload) : [];
    const days = payload.eventType === "VACATION" ? vacationDateKeys.length : Number(payload.days);
    if (!Number.isFinite(days) || days <= 0) {
      throw new AppError(400, "INVALID_LABOR_VACATION_DAYS", "Los días de vacaciones deben ser mayores a cero.");
    }

    if (isVacationRequest && vacationDateKeys.length === 0) {
      throw new AppError(400, "LABOR_VACATION_DATE_REQUIRED", "Captura al menos un día de vacaciones.");
    }

    const startDate = isVacationRequest
      ? toDate(vacationDateKeys[0])
      : toDate(payload.startDate);
    const endDate = isVacationRequest
      ? toDate(vacationDateKeys[vacationDateKeys.length - 1])
      : toDate(payload.endDate) ?? startDate;

    const acceptanceOriginalFileName = normalizeText(payload.acceptanceOriginalFileName);
    const acceptanceFileMimeType = normalizeText(payload.acceptanceFileMimeType).toLowerCase();
    const acceptanceFileContent = decodeBase64File(payload.acceptanceFileBase64);

    if (isVacationRequest) {
      if (!acceptanceOriginalFileName || !acceptanceFileContent?.byteLength) {
        throw new AppError(400, "LABOR_VACATION_ACCEPTANCE_FILE_REQUIRED", "Carga el formato de aceptacion de vacaciones en PDF o DOCX.");
      }

      if (!isVacationAcceptanceFile({ originalFileName: acceptanceOriginalFileName, fileMimeType: acceptanceFileMimeType })) {
        throw new AppError(400, "LABOR_VACATION_ACCEPTANCE_FILE_REQUIRED", "El formato de aceptacion de vacaciones debe ser PDF o DOCX.");
      }

      if (acceptanceFileMimeType && !VACATION_ACCEPTANCE_MIME_TYPES.has(acceptanceFileMimeType)) {
        throw new AppError(400, "LABOR_VACATION_ACCEPTANCE_FILE_REQUIRED", "El formato de aceptacion de vacaciones debe ser PDF o DOCX.");
      }
    }

    const record = await this.prisma.laborVacationEvent.create({
      data: {
        laborFileId,
        globalVacationDayId: payload.eventType === "GLOBAL_VACATION" ? normalizeText(payload.globalVacationDayId) || null : null,
        eventType: payload.eventType,
        startDate,
        endDate,
        vacationDates: isVacationRequest ? vacationDateKeys : undefined,
        days: new Prisma.Decimal(days),
        description: normalizeText(payload.description) || null,
        acceptanceOriginalFileName: isVacationRequest ? acceptanceOriginalFileName : null,
        acceptanceFileMimeType: isVacationRequest ? acceptanceFileMimeType || "application/pdf" : null,
        acceptanceFileSizeBytes: isVacationRequest ? acceptanceFileContent?.byteLength ?? null : null,
        acceptanceFileContent: isVacationRequest && acceptanceFileContent ? toPrismaBytes(acceptanceFileContent) : null
      }
    });

    return mapLaborVacationEvent(record);
  }

  public async setPreviousYearPendingVacationDays(laborFileId: string, payload: PreviousYearPendingVacationWrite) {
    await this.findOrThrow(laborFileId);

    const days = Number(payload.days ?? 0);
    if (!Number.isFinite(days) || days < 0) {
      throw new AppError(400, "INVALID_LABOR_PREVIOUS_YEAR_PENDING_DAYS", "Los días pendientes del año anterior no pueden ser negativos.");
    }

    const startDate = toDate(payload.previousYearStartDate);
    const endDate = toDate(payload.previousYearEndDate);
    if (!startDate || !endDate || toDateKey(endDate) < toDateKey(startDate)) {
      throw new AppError(400, "INVALID_LABOR_PREVIOUS_YEAR_PENDING_PERIOD", "El periodo del año anterior no es válido.");
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.laborVacationEvent.deleteMany({
        where: {
          laborFileId,
          eventType: "PREVIOUS_YEAR_PENDING",
          startDate,
          endDate
        }
      });

      if (days > 0) {
        await transaction.laborVacationEvent.create({
          data: {
            laborFileId,
            eventType: "PREVIOUS_YEAR_PENDING",
            startDate,
            endDate,
            days: new Prisma.Decimal(days),
            description: normalizeText(payload.description) || null
          }
        });
      }
    });

    const updated = await this.findById(laborFileId);
    if (!updated) {
      throw new AppError(404, "LABOR_FILE_NOT_FOUND", "El expediente laboral no existe.");
    }

    return updated;
  }

  public async updateVacationAcceptance(eventId: string, payload: LaborVacationAcceptanceUploadRecord) {
    const acceptanceOriginalFileName = normalizeText(payload.originalFileName);
    const acceptanceFileMimeType = normalizeText(payload.fileMimeType).toLowerCase();

    if (!acceptanceOriginalFileName || !payload.fileContent.byteLength) {
      throw new AppError(400, "LABOR_VACATION_SIGNED_FORMAT_REQUIRED", "Carga el formato firmado de vacaciones en PDF.");
    }

    if (!isPdfFile({ originalFileName: acceptanceOriginalFileName, fileMimeType: acceptanceFileMimeType })) {
      throw new AppError(400, "LABOR_VACATION_SIGNED_FORMAT_PDF_REQUIRED", "El formato firmado de vacaciones debe ser PDF.");
    }

    const existing = await this.prisma.laborVacationEvent.findUnique({
      where: { id: eventId },
      select: { id: true, eventType: true }
    });

    if (!existing) {
      throw new AppError(404, "LABOR_VACATION_EVENT_NOT_FOUND", "El movimiento de vacaciones no existe.");
    }

    if (existing.eventType !== "VACATION" && existing.eventType !== "GLOBAL_VACATION") {
      throw new AppError(400, "LABOR_VACATION_SIGNED_FORMAT_INVALID_EVENT", "Solo las vacaciones pueden autorizarse con PDF firmado.");
    }

    const record = await this.prisma.laborVacationEvent.update({
      where: { id: eventId },
      data: {
        acceptanceOriginalFileName,
        acceptanceFileMimeType: "application/pdf",
        acceptanceFileSizeBytes: payload.fileContent.byteLength,
        acceptanceFileContent: toPrismaBytes(payload.fileContent)
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
    const organizationId = getCurrentOrganizationIdOrDefault();
    const vacationDateKeys = getGlobalVacationDateKeys(payload);
    const date = toDate(vacationDateKeys[0] ?? payload.date);
    if (!date) {
      throw new AppError(400, "LABOR_GLOBAL_VACATION_DATE_REQUIRED", "Captura el día general de vacaciones.");
    }

    const hasExplicitVacationDates = Boolean(payload.vacationDates?.length);
    const days = hasExplicitVacationDates ? vacationDateKeys.length : Number(payload.days ?? (vacationDateKeys.length || 1));
    if (!Number.isFinite(days) || days <= 0) {
      throw new AppError(400, "INVALID_LABOR_GLOBAL_VACATION_DAYS", "Los días de vacaciones deben ser mayores a cero.");
    }

    const record = await this.prisma.laborGlobalVacationDay.upsert({
      where: {
        organizationId_date: {
          organizationId,
          date
        }
      },
      update: {
        days: new Prisma.Decimal(days),
        vacationDates: vacationDateKeys,
        description: normalizeText(payload.description) || null
      },
      create: {
        date,
        days: new Prisma.Decimal(days),
        vacationDates: vacationDateKeys,
        description: normalizeText(payload.description) || null
      },
      select: GLOBAL_VACATION_DAY_SELECT
    });

    return mapLaborGlobalVacationDay(record);
  }

  public async findGlobalVacationAcceptanceDocuments(globalVacationDayId: string) {
    const records = await this.prisma.laborVacationEvent.findMany({
      where: {
        globalVacationDayId,
        eventType: "GLOBAL_VACATION",
        acceptanceFileContent: { not: null }
      },
      orderBy: [{ laborFile: { employeeName: "asc" } }, { createdAt: "asc" }],
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

    return records.map((record) => ({
      laborFileId: record.laborFileId,
      userId: record.laborFile.userId,
      employeeName: record.laborFile.employeeName,
      originalFileName: record.acceptanceOriginalFileName ?? "formato-vacaciones.docx",
      fileMimeType: record.acceptanceFileMimeType,
      fileContent: Buffer.from(record.acceptanceFileContent ?? [])
    }));
  }

  public async deleteGlobalVacationEvents(globalVacationDayId: string) {
    await this.prisma.laborVacationEvent.deleteMany({
      where: {
        globalVacationDayId,
        eventType: "GLOBAL_VACATION"
      }
    });
  }

  public async deleteGlobalVacationDay(dayId: string) {
    const record = await this.prisma.laborGlobalVacationDay.findUnique({
      where: { id: dayId },
      select: { id: true }
    });

    if (!record) {
      throw new AppError(404, "LABOR_GLOBAL_VACATION_DAY_NOT_FOUND", "El día general de vacaciones no existe.");
    }

    await this.prisma.$transaction([
      this.prisma.laborVacationEvent.deleteMany({
        where: {
          globalVacationDayId: dayId,
          eventType: "GLOBAL_VACATION"
        }
      }),
      this.prisma.laborGlobalVacationDay.delete({ where: { id: dayId } })
    ]);
  }

  public async syncMissingForUsers() {
    const users = await this.prisma.user.findMany({
      where: {
        createLaborFile: true,
        role: { not: "SUPERADMIN" },
        legacyRole: { not: "SUPERADMIN" }
      },
      include: {
        laborFile: {
          select: {
            id: true,
            employeeName: true,
            employeeEmail: true,
            employeeUsername: true,
            employeeShortName: true,
            team: true,
            legacyTeam: true,
            specificRole: true,
            employmentStatus: true,
            employmentEndedAt: true,
            updatedAt: true
          }
        }
      }
    });

    for (const user of users) {
      if (!shouldHaveLaborFile(user)) {
        continue;
      }

      if (!user.laborFile) {
        await this.createForUser(user);
        continue;
      }

      const nextSnapshot = buildLaborFileUserSyncSnapshot(user);
      const wasManuallyRestoredToActive =
        user.laborFile.employmentStatus === "ACTIVE" &&
        !user.isActive &&
        user.laborFile.updatedAt.getTime() >= user.updatedAt.getTime();
      const syncSnapshot = user.laborFile.employmentStatus === "ARCHIVED"
        ? {
            ...nextSnapshot,
            employmentStatus: "ARCHIVED",
            employmentEndedAt: user.laborFile.employmentEndedAt ?? nextSnapshot.employmentEndedAt
          }
        : wasManuallyRestoredToActive
          ? {
              ...nextSnapshot,
              employmentStatus: "ACTIVE",
              employmentEndedAt: null
            }
        : nextSnapshot;
      const nextEmploymentEndedAt = syncSnapshot.employmentEndedAt?.toISOString().slice(0, 10) ?? null;
      const currentEmploymentEndedAt = user.laborFile.employmentEndedAt?.toISOString().slice(0, 10) ?? null;
      const shouldUpdate =
        user.laborFile.employeeName !== syncSnapshot.employeeName ||
        user.laborFile.employeeEmail !== syncSnapshot.employeeEmail ||
        user.laborFile.employeeUsername !== syncSnapshot.employeeUsername ||
        user.laborFile.employeeShortName !== syncSnapshot.employeeShortName ||
        user.laborFile.team !== syncSnapshot.team ||
        user.laborFile.legacyTeam !== syncSnapshot.legacyTeam ||
        user.laborFile.specificRole !== syncSnapshot.specificRole ||
        user.laborFile.employmentStatus !== syncSnapshot.employmentStatus ||
        currentEmploymentEndedAt !== nextEmploymentEndedAt;

      if (shouldUpdate) {
        await this.prisma.laborFile.update({
          where: { id: user.laborFile.id },
          data: syncSnapshot
        });
      }
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
        userId: user.id,
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

  private scheduleSalaryExtractionCacheRefresh(laborFileWhere: Prisma.LaborFileWhereInput = {}) {
    if (this.salaryExtractionRefresh) {
      return;
    }

    this.salaryExtractionRefresh = this.refreshSalaryExtractionCaches(laborFileWhere)
      .catch(() => undefined)
      .finally(() => {
        this.salaryExtractionRefresh = null;
      });
  }

  private async refreshSalaryExtractionCaches(laborFileWhere: Prisma.LaborFileWhereInput = {}) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const documents = await this.prisma.laborFileDocument.findMany({
      where: {
        organizationId,
        documentType: { in: ["EMPLOYMENT_CONTRACT", "ADDENDUM"] },
        laborFile: laborFileWhere,
        OR: [
          { riSalaryExtractionDetail: null },
          { NOT: { riSalaryExtractionDetail: { contains: LABOR_SALARY_EXTRACTION_DETAIL_VERSION } } }
        ]
      },
      select: {
        id: true,
        documentType: true,
        originalFileName: true,
        fileMimeType: true,
        uploadedAt: true,
        fileContent: true
      }
    });

    for (const document of documents) {
      const extraction = await extractLaborSalaryFromDocument(document);
      await this.prisma.laborFileDocument.update({
        where: { id: document.id },
        data: getSalaryExtractionWriteData(document.originalFileName, extraction)
      });
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

function getLocalGlobalVacationDateKeys(payload: LaborGlobalVacationDayInput) {
  const explicitDateKeys = (payload.vacationDates ?? [])
    .map((date) => normalizeDateKey(date))
    .filter((date): date is string => Boolean(date));

  if (explicitDateKeys.length > 0) {
    return Array.from(new Set(explicitDateKeys)).sort();
  }

  const startDateKey = normalizeDateKey(payload.date);
  if (!startDateKey) {
    return [];
  }

  const days = Number(payload.days ?? 1);
  if (!Number.isInteger(days) || days <= 1) {
    return [startDateKey];
  }

  const startDate = toDate(startDateKey)!;
  return Array.from({ length: days }, (_, index) => toDateKey(addDays(startDate, index)));
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
    await this.refreshLocalSalaryExtractionCaches();
    this.refreshStatuses();
    const state = this.getState();
    const users = this.readLocalUsers();
    return [...state.files]
      .filter((record) => this.shouldExposeLocalLaborFile(record, users))
      .sort((left, right) =>
        left.employmentStatus.localeCompare(right.employmentStatus) ||
        left.employeeName.localeCompare(right.employeeName)
      )
      .map((record) => this.mapLaborFile(record));
  }

  public async listForUser(userId: string) {
    await this.ensureForUser(userId);
    await this.refreshLocalSalaryExtractionCaches({ userId });
    this.refreshStatuses();
    const users = this.readLocalUsers();
    return this.getState().files
      .filter((record) => record.userId === userId)
      .filter((record) => this.shouldExposeLocalLaborFile(record, users))
      .sort((left, right) => left.employeeName.localeCompare(right.employeeName))
      .map((record) => this.mapLaborFile(record));
  }

  public async findById(laborFileId: string) {
    await this.syncMissingForUsers();
    await this.refreshLocalSalaryExtractionCaches({ laborFileId });
    const record = this.getState().files.find((candidate) => candidate.id === laborFileId);
    return record && this.shouldExposeLocalLaborFile(record) ? this.mapLaborFile(record) : null;
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
      if (payload.dailySalaryMxn !== undefined) {
        laborFile.dailySalaryMxn = normalizeMoney(payload.dailySalaryMxn).toNumber();
      }
      if (payload.personalPhone !== undefined) {
        laborFile.personalPhone = normalizeText(payload.personalPhone) || null;
      }
      if (payload.personalEmail !== undefined) {
        laborFile.personalEmail = normalizeText(payload.personalEmail) || null;
      }
      if (payload.emergencyContactName !== undefined) {
        laborFile.emergencyContactName = normalizeText(payload.emergencyContactName) || null;
      }
      if (payload.emergencyContactPhone !== undefined) {
        laborFile.emergencyContactPhone = normalizeText(payload.emergencyContactPhone) || null;
      }
      if (payload.emergencyContactAddress !== undefined) {
        laborFile.emergencyContactAddress = normalizeText(payload.emergencyContactAddress) || null;
      }
      if (payload.notes !== undefined) {
        laborFile.notes = normalizeText(payload.notes) || null;
      }
      laborFile.updatedAt = new Date().toISOString();
      updated = laborFile;
    });

    return this.mapLaborFile(updated!);
  }

  public async archive(laborFileId: string) {
    let updated: LocalLaborFileState | null = null;
    this.updateState((state) => {
      const laborFile = this.findOrThrowInState(state, laborFileId);
      const now = new Date().toISOString();
      const wasFormer = laborFile.employmentStatus === "FORMER";
      laborFile.employmentStatus = "ARCHIVED";
      laborFile.employmentEndedAt = wasFormer
        ? laborFile.employmentEndedAt ?? now.slice(0, 10)
        : laborFile.employmentEndedAt;
      laborFile.updatedAt = now;
      updated = laborFile;
    });

    return this.mapLaborFile(updated!);
  }

  public async restore(laborFileId: string) {
    let updated: LocalLaborFileState | null = null;
    this.updateState((state) => {
      const laborFile = this.findOrThrowInState(state, laborFileId);
      laborFile.employmentStatus = "ACTIVE";
      laborFile.employmentEndedAt = null;
      laborFile.updatedAt = new Date().toISOString();
      updated = laborFile;
    });

    return this.mapLaborFile(updated!);
  }

  public async deleteLaborFile(laborFileId: string) {
    let found = false;
    let archived = false;
    this.updateState((state) => {
      const laborFile = state.files.find((candidate) => candidate.id === laborFileId);
      if (!laborFile) {
        return;
      }

      found = true;
      archived = laborFile.employmentStatus === "ARCHIVED";
      if (!archived) {
        return;
      }

      state.files = state.files.filter((candidate) => candidate.id !== laborFileId);
    });

    if (!found) {
      throw new AppError(404, "LABOR_FILE_NOT_FOUND", "El expediente laboral no existe.");
    }

    if (!archived) {
      throw new AppError(
        400,
        "LABOR_FILE_DELETE_REQUIRES_ARCHIVE",
        "Primero envia el expediente laboral al archivo historico antes de borrarlo."
      );
    }
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
    validateLaborDocumentFile(payload.documentType, payload);
    const salaryExtraction = isLaborSalaryDocumentType(payload.documentType)
      ? await extractLaborSalaryFromDocument({
          id: "pending",
          documentType: payload.documentType,
          originalFileName: filename,
          fileMimeType: mimeType || null,
          uploadedAt: new Date(),
          fileContent: payload.fileContent
        })
      : null;

    let created: LocalLaborFileDocumentState | null = null;
    this.updateState((state) => {
      const laborFile = this.findOrThrowInState(state, laborFileId);
      const currentCount = laborFile.documents.filter((document) => document.documentType === payload.documentType).length;
      assertDocumentLimit(payload.documentType, currentCount);
      const now = new Date().toISOString();
      created = {
        id: randomUUID(),
        laborFileId,
        documentType: payload.documentType,
        originalFileName: filename,
        fileMimeType: mimeType || null,
        fileSizeBytes: getLocalFileSize(payload),
        fileBase64: payload.fileContent.toString("base64"),
        ...(isLaborSalaryDocumentType(payload.documentType)
          ? getLocalSalaryExtractionData(filename, salaryExtraction)
          : {}),
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
    if (
      payload.eventType !== "PREVIOUS_YEAR_DEDUCTION" &&
      payload.eventType !== "PREVIOUS_YEAR_PENDING" &&
      payload.eventType !== "VACATION" &&
      payload.eventType !== "GLOBAL_VACATION"
    ) {
      throw new AppError(400, "INVALID_LABOR_VACATION_EVENT_TYPE", "Tipo de movimiento de vacaciones invalido.");
    }

    const isVacationRequest = isVacationRequestEventType(payload.eventType);
    const vacationDateKeys = isVacationRequest ? getVacationDateKeys(payload) : [];
    const days = payload.eventType === "VACATION" ? vacationDateKeys.length : Number(payload.days);
    if (!Number.isFinite(days) || days <= 0) {
      throw new AppError(400, "INVALID_LABOR_VACATION_DAYS", "Los dias de vacaciones deben ser mayores a cero.");
    }

    if (isVacationRequest && vacationDateKeys.length === 0) {
      throw new AppError(400, "LABOR_VACATION_DATE_REQUIRED", "Captura al menos un dia de vacaciones.");
    }

    const startDate = isVacationRequest
      ? vacationDateKeys[0]
      : normalizeDateKey(payload.startDate);
    const endDate = isVacationRequest
      ? vacationDateKeys[vacationDateKeys.length - 1]
      : normalizeDateKey(payload.endDate) ?? startDate;

    const acceptanceOriginalFileName = normalizeText(payload.acceptanceOriginalFileName);
    const acceptanceFileMimeType = normalizeText(payload.acceptanceFileMimeType).toLowerCase();
    const acceptanceFileContent = decodeBase64File(payload.acceptanceFileBase64);

    if (isVacationRequest) {
      if (!acceptanceOriginalFileName || !acceptanceFileContent?.byteLength) {
        throw new AppError(400, "LABOR_VACATION_ACCEPTANCE_FILE_REQUIRED", "Carga el formato de aceptacion de vacaciones en PDF o DOCX.");
      }

      if (!isVacationAcceptanceFile({ originalFileName: acceptanceOriginalFileName, fileMimeType: acceptanceFileMimeType })) {
        throw new AppError(400, "LABOR_VACATION_ACCEPTANCE_FILE_REQUIRED", "El formato de aceptacion de vacaciones debe ser PDF o DOCX.");
      }

      if (acceptanceFileMimeType && !VACATION_ACCEPTANCE_MIME_TYPES.has(acceptanceFileMimeType)) {
        throw new AppError(400, "LABOR_VACATION_ACCEPTANCE_FILE_REQUIRED", "El formato de aceptacion de vacaciones debe ser PDF o DOCX.");
      }
    }

    let created: LocalLaborVacationEventState | null = null;
    this.updateState((state) => {
      const laborFile = this.findOrThrowInState(state, laborFileId);
      const now = new Date().toISOString();
      created = {
        id: randomUUID(),
        laborFileId,
        globalVacationDayId: payload.eventType === "GLOBAL_VACATION" ? normalizeText(payload.globalVacationDayId) || undefined : undefined,
        eventType: payload.eventType,
        startDate,
        endDate,
        vacationDates: isVacationRequest ? vacationDateKeys : [],
        days,
        description: normalizeText(payload.description) || null,
        acceptanceOriginalFileName: isVacationRequest ? acceptanceOriginalFileName : undefined,
        acceptanceFileMimeType: isVacationRequest ? acceptanceFileMimeType || "application/pdf" : null,
        acceptanceFileSizeBytes: isVacationRequest ? acceptanceFileContent?.byteLength : undefined,
        acceptanceFileBase64: isVacationRequest && acceptanceFileContent
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

  public async setPreviousYearPendingVacationDays(laborFileId: string, payload: PreviousYearPendingVacationWrite) {
    const days = Number(payload.days ?? 0);
    if (!Number.isFinite(days) || days < 0) {
      throw new AppError(400, "INVALID_LABOR_PREVIOUS_YEAR_PENDING_DAYS", "Los dias pendientes del año anterior no pueden ser negativos.");
    }

    const startDate = normalizeDateKey(payload.previousYearStartDate);
    const endDate = normalizeDateKey(payload.previousYearEndDate);
    if (!startDate || !endDate || endDate < startDate) {
      throw new AppError(400, "INVALID_LABOR_PREVIOUS_YEAR_PENDING_PERIOD", "El periodo del año anterior no es valido.");
    }

    this.updateState((state) => {
      const laborFile = this.findOrThrowInState(state, laborFileId);
      const now = new Date().toISOString();
      laborFile.vacationEvents = laborFile.vacationEvents.filter((event) =>
        event.eventType !== "PREVIOUS_YEAR_PENDING" ||
        event.startDate !== startDate ||
        event.endDate !== endDate
      );

      if (days > 0) {
        laborFile.vacationEvents.push({
          id: randomUUID(),
          laborFileId,
          eventType: "PREVIOUS_YEAR_PENDING",
          startDate,
          endDate,
          vacationDates: [],
          days,
          description: normalizeText(payload.description) || null,
          createdAt: now,
          updatedAt: now
        });
      }

      laborFile.updatedAt = now;
    });

    return this.mapLaborFile(this.findOrThrow(laborFileId));
  }

  public async updateVacationAcceptance(eventId: string, payload: LaborVacationAcceptanceUploadRecord) {
    const acceptanceOriginalFileName = normalizeText(payload.originalFileName);
    const acceptanceFileMimeType = normalizeText(payload.fileMimeType).toLowerCase();

    if (!acceptanceOriginalFileName || !payload.fileContent.byteLength) {
      throw new AppError(400, "LABOR_VACATION_SIGNED_FORMAT_REQUIRED", "Carga el formato firmado de vacaciones en PDF.");
    }

    if (!isPdfFile({ originalFileName: acceptanceOriginalFileName, fileMimeType: acceptanceFileMimeType })) {
      throw new AppError(400, "LABOR_VACATION_SIGNED_FORMAT_PDF_REQUIRED", "El formato firmado de vacaciones debe ser PDF.");
    }

    let updated: LocalLaborVacationEventState | null = null;
    this.updateState((state) => {
      for (const laborFile of state.files) {
        const event = laborFile.vacationEvents.find((candidate) => candidate.id === eventId);
        if (!event) {
          continue;
        }

        if (event.eventType !== "VACATION" && event.eventType !== "GLOBAL_VACATION") {
          throw new AppError(400, "LABOR_VACATION_SIGNED_FORMAT_INVALID_EVENT", "Solo las vacaciones pueden autorizarse con PDF firmado.");
        }

        event.acceptanceOriginalFileName = acceptanceOriginalFileName;
        event.acceptanceFileMimeType = "application/pdf";
        event.acceptanceFileSizeBytes = payload.fileContent.byteLength;
        event.acceptanceFileBase64 = payload.fileContent.toString("base64");
        event.updatedAt = new Date().toISOString();
        laborFile.updatedAt = event.updatedAt;
        updated = event;
        break;
      }
    });

    if (!updated) {
      throw new AppError(404, "LABOR_VACATION_EVENT_NOT_FOUND", "El movimiento de vacaciones no existe.");
    }

    return this.mapVacationEvent(updated);
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
    const vacationDateKeys = getLocalGlobalVacationDateKeys(payload);
    const date = vacationDateKeys[0] ?? normalizeDateKey(payload.date);
    if (!date) {
      throw new AppError(400, "LABOR_GLOBAL_VACATION_DATE_REQUIRED", "Captura el dia general de vacaciones.");
    }

    const hasExplicitVacationDates = Boolean(payload.vacationDates?.length);
    const days = hasExplicitVacationDates ? vacationDateKeys.length : Number(payload.days ?? (vacationDateKeys.length || 1));
    if (!Number.isFinite(days) || days <= 0) {
      throw new AppError(400, "INVALID_LABOR_GLOBAL_VACATION_DAYS", "Los dias de vacaciones deben ser mayores a cero.");
    }

    let saved: LaborGlobalVacationDay | null = null;
    this.updateState((state) => {
      const now = new Date().toISOString();
      const existing = state.globalVacationDays.find((day) => day.date === date);
      if (existing) {
        existing.days = days;
        existing.vacationDates = vacationDateKeys;
        existing.description = normalizeText(payload.description) || undefined;
        existing.updatedAt = now;
        saved = existing;
        return;
      }

      saved = {
        id: randomUUID(),
        date,
        days,
        vacationDates: vacationDateKeys,
        description: normalizeText(payload.description) || undefined,
        createdAt: now,
        updatedAt: now
      };
      state.globalVacationDays.push(saved);
    });

    return saved!;
  }

  public async findGlobalVacationAcceptanceDocuments(globalVacationDayId: string) {
    return this.getState().files
      .flatMap((laborFile) =>
        laborFile.vacationEvents
          .filter((event) =>
            event.eventType === "GLOBAL_VACATION" &&
            event.globalVacationDayId === globalVacationDayId &&
            Boolean(event.acceptanceFileBase64)
          )
          .map((event) => ({
            laborFileId: laborFile.id,
            userId: laborFile.userId,
            employeeName: laborFile.employeeName,
            originalFileName: event.acceptanceOriginalFileName ?? "formato-vacaciones.docx",
            fileMimeType: event.acceptanceFileMimeType,
            fileContent: Buffer.from(event.acceptanceFileBase64 ?? "", "base64")
          }))
      )
      .sort((left, right) => left.employeeName.localeCompare(right.employeeName));
  }

  public async deleteGlobalVacationEvents(globalVacationDayId: string) {
    this.updateState((state) => {
      const now = new Date().toISOString();
      for (const laborFile of state.files) {
        const nextEvents = laborFile.vacationEvents.filter((event) =>
          event.eventType !== "GLOBAL_VACATION" || event.globalVacationDayId !== globalVacationDayId
        );
        if (nextEvents.length !== laborFile.vacationEvents.length) {
          laborFile.vacationEvents = nextEvents;
          laborFile.updatedAt = now;
        }
      }
    });
  }

  public async deleteGlobalVacationDay(dayId: string) {
    let deleted = false;
    this.updateState((state) => {
      const nextDays = state.globalVacationDays.filter((day) => day.id !== dayId);
      deleted = nextDays.length !== state.globalVacationDays.length;
      state.globalVacationDays = nextDays;
      for (const laborFile of state.files) {
        laborFile.vacationEvents = laborFile.vacationEvents.filter((event) =>
          event.eventType !== "GLOBAL_VACATION" || event.globalVacationDayId !== dayId
        );
      }
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
          const wasManuallyRestoredToActive =
            existing.employmentStatus === "ACTIVE" &&
            !snapshot.isActive &&
            new Date(existing.updatedAt).getTime() >= snapshot.updatedAt.getTime();
          existing.employeeName = nextSnapshot.employeeName;
          existing.employeeEmail = nextSnapshot.employeeEmail;
          existing.employeeUsername = snapshot.username;
          existing.employeeShortName = nextSnapshot.employeeShortName;
          existing.team = nextSnapshot.team;
          existing.legacyTeam = nextSnapshot.legacyTeam;
          existing.specificRole = nextSnapshot.specificRole;
          existing.employmentStatus = existing.employmentStatus === "ARCHIVED"
            ? "ARCHIVED"
            : wasManuallyRestoredToActive
              ? "ACTIVE"
            : nextSnapshot.employmentStatus as LocalLaborFileState["employmentStatus"];
          existing.employmentEndedAt = existing.employmentStatus === "ARCHIVED"
            ? existing.employmentEndedAt ?? (nextSnapshot.employmentEndedAt ? toDateKey(nextSnapshot.employmentEndedAt) : null)
            : wasManuallyRestoredToActive
              ? null
            : nextSnapshot.employmentEndedAt ? toDateKey(nextSnapshot.employmentEndedAt) : null;
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
      globalVacationDays: Array.isArray(parsed.globalVacationDays)
        ? parsed.globalVacationDays.map((day) => ({
            ...day,
            vacationDates: Array.isArray(day.vacationDates)
              ? day.vacationDates
              : getLocalGlobalVacationDateKeys({ date: day.date, days: day.days })
          }))
        : []
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
      createLaborFile: user.createLaborFile !== false,
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
      personalPhone: null,
      personalEmail: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      emergencyContactAddress: null,
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

  private async refreshLocalSalaryExtractionCaches(filter: { userId?: string; laborFileId?: string } = {}) {
    const state = this.getState();
    let changed = false;

    for (const laborFile of state.files) {
      if (filter.userId && laborFile.userId !== filter.userId) {
        continue;
      }

      if (filter.laborFileId && laborFile.id !== filter.laborFileId) {
        continue;
      }

      for (const document of laborFile.documents) {
        if (!shouldRefreshSalaryExtractionCache(document)) {
          continue;
        }

        const extraction = await extractLaborSalaryFromDocument({
          id: document.id,
          documentType: document.documentType,
          originalFileName: document.originalFileName,
          fileMimeType: document.fileMimeType ?? null,
          uploadedAt: document.uploadedAt,
          fileContent: Buffer.from(document.fileBase64, "base64")
        });
        Object.assign(document, getLocalSalaryExtractionData(document.originalFileName, extraction), {
          updatedAt: new Date().toISOString()
        });
        changed = true;
      }
    }

    if (changed) {
      this.persistState(state);
    }
  }

  private refreshStatusForRecord(laborFile: LocalLaborFileState) {
    laborFile.status = computeLaborFileStatus({
      specificRole: laborFile.specificRole,
      documentTypes: laborFile.documents.map((document) => document.documentType)
    });
    laborFile.updatedAt = new Date().toISOString();
  }

  private shouldExposeLocalLaborFile(record: LocalLaborFileState, users = this.readLocalUsers()) {
    if (!record.userId) {
      return true;
    }

    const user = users.find((candidate) => candidate.id === record.userId);
    const snapshot = user ? this.toLaborFileUserSnapshot(user) : null;
    return !snapshot || shouldHaveLaborFile(snapshot);
  }

  private mapLaborFile(record: LocalLaborFileState) {
    return mapLaborFile({
      id: record.id,
      userId: record.userId ?? null,
      employeeName: record.employeeName,
      employeeEmail: record.employeeEmail ?? null,
      employeeUsername: record.employeeUsername,
      employeeShortName: record.employeeShortName ?? null,
      personalPhone: record.personalPhone ?? null,
      personalEmail: record.personalEmail ?? null,
      emergencyContactName: record.emergencyContactName ?? null,
      emergencyContactPhone: record.emergencyContactPhone ?? null,
      emergencyContactAddress: record.emergencyContactAddress ?? null,
      team: record.team ?? null,
      legacyTeam: record.legacyTeam ?? null,
      specificRole: record.specificRole ?? null,
      status: record.status,
      employmentStatus: record.employmentStatus,
      hireDate: localDate(record.hireDate),
      dailySalaryMxn: new Prisma.Decimal(record.dailySalaryMxn ?? 0),
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
      vacationDates: day.vacationDates ?? [],
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
      riExtractedDailySalaryMxn: document.riExtractedDailySalaryMxn ?? null,
      riExtractedMonthlyGrossSalaryMxn: document.riExtractedMonthlyGrossSalaryMxn ?? null,
      riSalaryExtractionDetail: document.riSalaryExtractionDetail ?? null,
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
      globalVacationDayId: event.globalVacationDayId ?? null,
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

  public archive(laborFileId: string) {
    return this.withFallback(() => this.primary.archive(laborFileId), () => this.fallback!.archive(laborFileId));
  }

  public restore(laborFileId: string) {
    return this.withFallback(() => this.primary.restore(laborFileId), () => this.fallback!.restore(laborFileId));
  }

  public deleteLaborFile(laborFileId: string) {
    return this.withFallback(() => this.primary.deleteLaborFile(laborFileId), () => this.fallback!.deleteLaborFile(laborFileId));
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

  public setPreviousYearPendingVacationDays(laborFileId: string, payload: PreviousYearPendingVacationWrite) {
    return this.withFallback(
      () => this.primary.setPreviousYearPendingVacationDays(laborFileId, payload),
      () => this.fallback!.setPreviousYearPendingVacationDays(laborFileId, payload)
    );
  }

  public updateVacationAcceptance(eventId: string, payload: LaborVacationAcceptanceUploadRecord) {
    return this.withFallback(
      () => this.primary.updateVacationAcceptance(eventId, payload),
      () => this.fallback!.updateVacationAcceptance(eventId, payload)
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

  public findGlobalVacationAcceptanceDocuments(globalVacationDayId: string) {
    return this.withFallback(
      () => this.primary.findGlobalVacationAcceptanceDocuments(globalVacationDayId),
      () => this.fallback?.findGlobalVacationAcceptanceDocuments(globalVacationDayId) ?? Promise.resolve([])
    );
  }

  public deleteGlobalVacationEvents(globalVacationDayId: string) {
    return this.withFallback(
      () => this.primary.deleteGlobalVacationEvents(globalVacationDayId),
      () => this.fallback?.deleteGlobalVacationEvents(globalVacationDayId) ?? Promise.resolve()
    );
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
