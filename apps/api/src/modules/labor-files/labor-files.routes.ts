import type { FastifyPluginAsync } from "fastify";
import { deriveEffectivePermissions, type LaborFile, type LaborGlobalVacationBatchResult, type LaborVacationEvent } from "@sige/contracts";
import JSZip from "jszip";
import { z } from "zod";

import { getSessionUser, requireAnyPermissions, requireAuth } from "../../core/auth/guards";
import type { SessionUser } from "../../core/auth/types";
import { AppError } from "../../core/errors/app-error";
import {
  laborContractFieldValuesSchema,
  prefillLaborContractFields,
  renderLaborContractDocx
} from "./labor-contract-generator";
import {
  DOCX_MIME_TYPE,
  laborVacationFormatFieldValuesSchema,
  renderLaborVacationFormatDocx
} from "./labor-vacation-format-generator";

const laborFileIdParamsSchema = z.object({
  laborFileId: z.string().min(1)
});

const documentIdParamsSchema = z.object({
  documentId: z.string().min(1)
});

const vacationEventIdParamsSchema = z.object({
  eventId: z.string().min(1)
});

const globalVacationDayIdParamsSchema = z.object({
  dayId: z.string().min(1)
});

const updateLaborFileSchema = z.object({
  hireDate: z.string().min(10).max(30).optional(),
  dailySalaryMxn: z.number().nonnegative().nullable().optional(),
  personalPhone: z.string().nullable().optional(),
  personalEmail: z.string().email().or(z.literal("")).nullable().optional(),
  emergencyContactName: z.string().nullable().optional(),
  emergencyContactPhone: z.string().nullable().optional(),
  emergencyContactAddress: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
});

const uploadDocumentSchema = z.object({
  documentType: z.enum([
    "EMPLOYMENT_CONTRACT",
    "ADDENDUM",
    "PROOF_OF_ADDRESS",
    "TAX_STATUS_CERTIFICATE",
    "CURP",
    "IMSS_WEEKS_CERTIFICATE",
    "BANK_ACCOUNT_STATEMENT",
    "OFFICIAL_ID",
    "CV",
    "EDUCATION_PROOF",
    "PROFESSIONAL_TITLE",
    "PROFESSIONAL_LICENSE",
    "EQUIPMENT_DELIVERY_FORMAT"
  ]),
  originalFileName: z.string().min(1),
  fileMimeType: z.string().nullable().optional(),
  fileBase64: z.string().min(1)
});

const laborContractGenerationSchema = laborContractFieldValuesSchema;
const laborVacationFormatGenerationSchema = laborVacationFormatFieldValuesSchema;

const vacationEventSchema = z.object({
  eventType: z.enum(["PREVIOUS_YEAR_DEDUCTION", "VACATION", "GLOBAL_VACATION"]),
  globalVacationDayId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  vacationDates: z.array(z.string().min(10).max(30)).optional(),
  days: z.number().positive().optional(),
  description: z.string().nullable().optional(),
  acceptanceOriginalFileName: z.string().nullable().optional(),
  acceptanceFileMimeType: z.string().nullable().optional(),
  acceptanceFileBase64: z.string().nullable().optional()
});

const signedVacationFormatSchema = z.object({
  originalFileName: z.string().min(1),
  fileMimeType: z.string().nullable().optional(),
  fileBase64: z.string().min(1),
  overrideTeamVacationConflict: z.boolean().optional().default(false)
});

const previousYearPendingVacationSchema = z.object({
  days: z.number().min(0),
  description: z.string().nullable().optional(),
  manualOverrideConfirmed: z.literal(true),
  pendingPeriod: z.enum(["LAST_YEAR", "YEAR_BEFORE_LAST"]).optional().default("LAST_YEAR")
});

const globalVacationDaySchema = z.object({
  date: z.string().min(10).max(30),
  vacationDates: z.array(z.string().min(10).max(30)).optional(),
  days: z.number().positive().optional(),
  description: z.string().nullable().optional()
});

function decodeFileBase64(value: string) {
  const base64Payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return Buffer.from(base64Payload, "base64");
}

function encodeDispositionFilename(filename: string) {
  const safeFilename = filename.replace(/"/g, "");
  return `inline; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function encodeAttachmentFilename(filename: string) {
  const safeFilename = filename.replace(/"/g, "");
  return `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function sanitizeZipPathPart(value: string) {
  return normalizeComparableText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "trabajador";
}

function getEffectivePermissions(user: ReturnType<typeof getSessionUser>) {
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

function canWriteLaborFiles(user: ReturnType<typeof getSessionUser>) {
  const permissions = getEffectivePermissions(user);
  return permissions.includes("*") || permissions.includes("labor-file:write");
}

function normalizeComparableText(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isEduardoRusconi(user: SessionUser) {
  return (
    normalizeComparableText(user.username) === "eduardo rusconi" ||
    normalizeComparableText(user.displayName) === "eduardo rusconi" ||
    user.email.toLowerCase().startsWith("eduardo.rusconi")
  );
}

function isMayraOrdonez(user: SessionUser) {
  const username = normalizeComparableText(user.username);
  const displayName = normalizeComparableText(user.displayName);
  const email = normalizeComparableText(user.email);

  return (
    (username.includes("mayra") && username.includes("ordonez")) ||
    (displayName.includes("mayra") && displayName.includes("ordonez")) ||
    (email.includes("mayra") && email.includes("ordonez"))
  );
}

function isSuperadminEduardoRusconi(user: SessionUser) {
  const permissions = getEffectivePermissions(user);
  return isEduardoRusconi(user) && (
    normalizeComparableText(user.role) === "superadmin" ||
    normalizeComparableText(user.legacyRole) === "superadmin" ||
    permissions.includes("*")
  );
}

function isSuperadmin(user: SessionUser) {
  const permissions = getEffectivePermissions(user);
  return (
    normalizeComparableText(user.role) === "superadmin" ||
    normalizeComparableText(user.legacyRole) === "superadmin" ||
    permissions.includes("*")
  );
}

function getTeamKey(laborFile: LaborFile) {
  return normalizeComparableText(laborFile.team ?? laborFile.legacyTeam);
}

function normalizeDateKey(value?: string | null) {
  const key = (value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : "";
}

function addDateKey(value: string, offset: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function enumerateDateKeys(startDate?: string, endDate?: string) {
  const startKey = normalizeDateKey(startDate);
  const endKey = normalizeDateKey(endDate) || startKey;
  if (!startKey || !endKey || endKey < startKey) {
    return [];
  }

  const dates: string[] = [];
  let cursor = startKey;
  while (cursor <= endKey) {
    dates.push(cursor);
    cursor = addDateKey(cursor, 1);
  }

  return dates;
}

function getGlobalVacationDateKeys(startDate: string, days: number) {
  if (!Number.isInteger(days) || days <= 1) {
    return [startDate];
  }

  return enumerateDateKeys(startDate, addDateKey(startDate, days - 1));
}

function isLaborFileEligibleForGlobalVacationFormat(laborFile: LaborFile) {
  return laborFile.employmentStatus === "ACTIVE";
}

function getVacationEventDateKeys(event: LaborVacationEvent) {
  const explicitDates = (event.vacationDates ?? []).map(normalizeDateKey).filter(Boolean);
  return explicitDates.length > 0
    ? Array.from(new Set(explicitDates)).sort()
    : enumerateDateKeys(event.startDate, event.endDate);
}

function isVacationFormatEvent(event: LaborVacationEvent) {
  return event.eventType === "VACATION" || event.eventType === "GLOBAL_VACATION";
}

function isVacationEventAuthorizedWithSignedPdf(event: LaborVacationEvent) {
  const mimeType = (event.acceptanceFileMimeType ?? "").toLowerCase();
  const filename = (event.acceptanceOriginalFileName ?? "").toLowerCase();
  return isVacationFormatEvent(event) && (mimeType === "application/pdf" || filename.endsWith(".pdf"));
}

function assertCanDeleteVacationEvent(user: SessionUser, event: LaborVacationEvent) {
  if (event.eventType === "PREVIOUS_YEAR_PENDING") {
    if (!isSuperadminEduardoRusconi(user)) {
      throw new AppError(
        403,
        "LABOR_PREVIOUS_YEAR_PENDING_FORBIDDEN",
        "Solo el superadmin Eduardo Rusconi puede modificar pendientes del año anterior."
      );
    }
    return;
  }

  if (!isVacationFormatEvent(event)) {
    return;
  }

  if (isVacationEventAuthorizedWithSignedPdf(event)) {
    if (!isEduardoRusconi(user)) {
      throw new AppError(
        403,
        "LABOR_VACATION_APPROVED_DELETE_FORBIDDEN",
        "Solo Eduardo Rusconi puede quitar periodos de vacaciones aprobados con PDF firmado."
      );
    }
    return;
  }

  if (!isMayraOrdonez(user) && !isEduardoRusconi(user)) {
    throw new AppError(
      403,
      "LABOR_VACATION_DRAFT_DELETE_FORBIDDEN",
      "Solo Mayra Ordoñez puede quitar periodos de vacaciones que todavía no tienen PDF firmado."
    );
  }
}

function findTeamVacationConflicts(input: {
  laborFiles: LaborFile[];
  laborFile: LaborFile;
  dateKeys: string[];
  excludeEventId?: string;
}) {
  const teamKey = getTeamKey(input.laborFile);
  if (!teamKey || input.dateKeys.length === 0) {
    return [];
  }

  const requestedDateKeys = new Set(input.dateKeys);
  return input.laborFiles.flatMap((candidate) => {
    if (candidate.id === input.laborFile.id || getTeamKey(candidate) !== teamKey) {
      return [];
    }

    return candidate.vacationEvents
      .filter((event) => event.eventType === "VACATION" && event.id !== input.excludeEventId)
      .map((event) => ({
        employeeName: candidate.employeeName,
        dates: getVacationEventDateKeys(event).filter((date) => requestedDateKeys.has(date))
      }))
      .filter((conflict) => conflict.dates.length > 0);
  });
}

function assertCanBypassTeamVacationConflicts(user: SessionUser, override: boolean) {
  if (override && !isEduardoRusconi(user)) {
    throw new AppError(403, "LABOR_VACATION_CONFLICT_OVERRIDE_FORBIDDEN", "Solo Eduardo Rusconi puede marcar el override de conflicto de vacaciones del equipo.");
  }
}

function assertNoTeamVacationConflicts(input: {
  laborFiles: LaborFile[];
  laborFile: LaborFile;
  dateKeys: string[];
  user: SessionUser;
  override: boolean;
  excludeEventId?: string;
}) {
  assertCanBypassTeamVacationConflicts(input.user, input.override);

  const conflicts = findTeamVacationConflicts(input);
  if (conflicts.length === 0 || input.override) {
    return;
  }

  const teamName = input.laborFile.legacyTeam ?? input.laborFile.team ?? "equipo";
  const conflictDetails = conflicts
    .map((conflict) => `${conflict.employeeName}: ${conflict.dates.join(", ")}`)
    .join("; ");

  throw new AppError(
    409,
    "LABOR_VACATION_TEAM_DATE_CONFLICT",
    `Regla de vacaciones por equipo: no se puede generar ni autorizar el formato porque otra persona del mismo equipo (${teamName}) pidió vacaciones en las mismas fechas. Conflictos: ${conflictDetails}. Solo Eduardo Rusconi puede marcar el override.`
  );
}

export const laborFilesRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.LaborFilesService(app.repositories.laborFiles);
  const readGuards = [requireAuth, requireAnyPermissions(["labor-file:read", "labor-file:write"])];
  const writeGuards = [requireAuth, requireAnyPermissions(["labor-file:write"])];

  app.get("/labor-files", { preHandler: readGuards }, async (request) => {
    const user = getSessionUser(request);
    return canWriteLaborFiles(user) ? service.list() : service.listForUser(user.id);
  });

  app.get("/labor-files/global-vacation-days", { preHandler: writeGuards }, async () => {
    return service.listGlobalVacationDays();
  });

  app.post("/labor-files/global-vacation-days", { preHandler: writeGuards }, async (request): Promise<LaborGlobalVacationBatchResult> => {
    const payload = globalVacationDaySchema.parse(request.body ?? {});
    const laborFiles = await service.list();
    const day = await service.createGlobalVacationDay(payload);
    const vacationDateKeys = day.vacationDates.length > 0
      ? day.vacationDates
      : getGlobalVacationDateKeys(day.date.slice(0, 10), day.days);
    const dateKey = vacationDateKeys[0] ?? day.date.slice(0, 10);
    const applicableLaborFiles = laborFiles.filter(isLaborFileEligibleForGlobalVacationFormat);

    const generatedFormats = await Promise.all(applicableLaborFiles.map(async (laborFile) => {
      const vacationDays = vacationDateKeys.length || day.days;
      const generatedFormat = await renderLaborVacationFormatDocx(laborFile, {
        employeeName: laborFile.employeeName,
        requestDate: new Date().toISOString().slice(0, 10),
        vacationDates: vacationDateKeys,
        vacationDays,
        enjoymentText: "",
        interestedName: laborFile.employeeName,
        authorizerName: "Mayra Rubí Ordóñez Mendoza",
        hireDate: laborFile.hireDate.slice(0, 10),
        vacationYearStartDate: laborFile.vacationSummary.currentYearStartDate,
        completedYearsLabel: laborFile.vacationSummary.completedYearsLabel,
        entitlementDays: laborFile.vacationSummary.entitlementDays +
          laborFile.vacationSummary.previousYearPendingDays +
          laborFile.vacationSummary.yearBeforeLastPendingDays,
        pendingDays: Math.max(0, laborFile.vacationSummary.remainingDays - vacationDays),
        enjoyedDays: laborFile.vacationSummary.usedDays + vacationDays,
        description: payload.description || "Vacación general"
      });

      return {
        laborFile,
        generatedFormat
      };
    }));

    await service.deleteGlobalVacationEvents(day.id);
    for (const generated of generatedFormats) {
      await service.createVacationEvent(generated.laborFile.id, {
        eventType: "GLOBAL_VACATION",
        globalVacationDayId: day.id,
        vacationDates: vacationDateKeys,
        days: day.days,
        startDate: vacationDateKeys[0] ?? dateKey,
        endDate: vacationDateKeys[vacationDateKeys.length - 1] ?? dateKey,
        description: payload.description || "Vacación general",
        acceptanceOriginalFileName: generated.generatedFormat.filename,
        acceptanceFileMimeType: DOCX_MIME_TYPE,
        acceptanceFileBase64: generated.generatedFormat.buffer.toString("base64")
      });
    }

    return {
      day,
      generatedFormats: generatedFormats.length
    };
  });

  app.get("/labor-files/global-vacation-days/:dayId/acceptance-formats", { preHandler: writeGuards }, async (request, reply) => {
    const params = globalVacationDayIdParamsSchema.parse(request.params);
    const documents = await service.findGlobalVacationAcceptanceDocuments(params.dayId);

    if (documents.length === 0) {
      throw new app.errors.AppError(404, "LABOR_GLOBAL_VACATION_FORMATS_NOT_FOUND", "No hay formatos generados para esta vacación general.");
    }

    const zip = new JSZip();
    for (const document of documents) {
      zip.file(`${sanitizeZipPathPart(document.employeeName)}-${document.originalFileName}`, document.fileContent);
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", encodeAttachmentFilename(`formatos-vacaciones-generales-${params.dayId}.zip`));
    return reply.send(buffer);
  });

  app.delete("/labor-files/global-vacation-days/:dayId", { preHandler: writeGuards }, async (request, reply) => {
    const params = globalVacationDayIdParamsSchema.parse(request.params);
    const user = getSessionUser(request);
    const laborFiles = await service.list();
    const relatedEvents = laborFiles.flatMap((laborFile) =>
      laborFile.vacationEvents.filter((event) =>
        event.eventType === "GLOBAL_VACATION" && event.globalVacationDayId === params.dayId
      )
    );

    if (relatedEvents.length > 0) {
      const hasSignedPdf = relatedEvents.some(isVacationEventAuthorizedWithSignedPdf);
      if (hasSignedPdf && !isEduardoRusconi(user)) {
        throw new app.errors.AppError(
          403,
          "LABOR_VACATION_APPROVED_DELETE_FORBIDDEN",
          "Solo Eduardo Rusconi puede quitar vacaciones generales que ya tienen algún PDF firmado."
        );
      }

      if (!hasSignedPdf && !isMayraOrdonez(user) && !isEduardoRusconi(user)) {
        throw new app.errors.AppError(
          403,
          "LABOR_VACATION_DRAFT_DELETE_FORBIDDEN",
          "Solo Mayra Ordoñez puede quitar vacaciones generales que todavía no tienen PDFs firmados."
        );
      }
    }

    await service.deleteGlobalVacationDay(params.dayId);
    reply.code(204);
    return null;
  });

  app.get("/labor-files/:laborFileId", { preHandler: readGuards }, async (request) => {
    const params = laborFileIdParamsSchema.parse(request.params);
    const user = getSessionUser(request);
    const laborFile = await service.findById(params.laborFileId);

    if (!laborFile) {
      throw new app.errors.AppError(404, "LABOR_FILE_NOT_FOUND", "El expediente laboral no existe.");
    }

    if (!canWriteLaborFiles(user) && laborFile.userId !== user.id) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Solo puedes consultar tu propio expediente laboral.");
    }

    return laborFile;
  });

  app.patch("/labor-files/:laborFileId", { preHandler: writeGuards }, async (request) => {
    const params = laborFileIdParamsSchema.parse(request.params);
    const payload = updateLaborFileSchema.parse(request.body ?? {});
    return service.update(params.laborFileId, payload);
  });

  app.post("/labor-files/:laborFileId/archive", { preHandler: writeGuards }, async (request) => {
    const params = laborFileIdParamsSchema.parse(request.params);
    return service.archive(params.laborFileId);
  });

  app.post("/labor-files/:laborFileId/restore", { preHandler: writeGuards }, async (request) => {
    const params = laborFileIdParamsSchema.parse(request.params);
    return service.restore(params.laborFileId);
  });

  app.delete("/labor-files/:laborFileId", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = laborFileIdParamsSchema.parse(request.params);
    const user = getSessionUser(request);

    if (!isSuperadmin(user)) {
      throw new app.errors.AppError(
        403,
        "LABOR_FILE_ARCHIVE_DELETE_FORBIDDEN",
        "Solo el superadmin puede borrar expedientes laborales del archivo historico."
      );
    }

    await service.deleteLaborFile(params.laborFileId);
    reply.code(204);
    return null;
  });

  app.post("/labor-files/:laborFileId/documents", { bodyLimit: 25 * 1024 * 1024, preHandler: writeGuards }, async (request) => {
    const params = laborFileIdParamsSchema.parse(request.params);
    const payload = uploadDocumentSchema.parse(request.body ?? {});
    const fileContent = decodeFileBase64(payload.fileBase64);

    return service.uploadDocument(params.laborFileId, {
      documentType: payload.documentType,
      originalFileName: payload.originalFileName,
      fileMimeType: payload.fileMimeType,
      fileSizeBytes: fileContent.byteLength,
      fileContent
    });
  });

  app.post("/labor-files/:laborFileId/contract/prefill", { preHandler: writeGuards }, async (request) => {
    const params = laborFileIdParamsSchema.parse(request.params);
    const laborFile = await service.findById(params.laborFileId);

    if (!laborFile) {
      throw new app.errors.AppError(404, "LABOR_FILE_NOT_FOUND", "El expediente laboral no existe.");
    }

    const documents = await service.listDocumentsForContractPrefill(params.laborFileId);
    return prefillLaborContractFields(laborFile, documents);
  });

  app.post("/labor-files/:laborFileId/contract/generate", { preHandler: writeGuards }, async (request) => {
    const params = laborFileIdParamsSchema.parse(request.params);
    const payload = laborContractGenerationSchema.parse(request.body ?? {});
    const laborFile = await service.findById(params.laborFileId);

    if (!laborFile) {
      throw new app.errors.AppError(404, "LABOR_FILE_NOT_FOUND", "El expediente laboral no existe.");
    }

    const generatedContract = await renderLaborContractDocx(laborFile, payload);
    return service.uploadDocument(params.laborFileId, {
      documentType: "EMPLOYMENT_CONTRACT",
      originalFileName: generatedContract.filename,
      fileMimeType: generatedContract.contentType,
      fileSizeBytes: generatedContract.buffer.byteLength,
      fileContent: generatedContract.buffer
    });
  });

  app.post("/labor-files/:laborFileId/vacation-format/generate", { preHandler: writeGuards }, async (request) => {
    const params = laborFileIdParamsSchema.parse(request.params);
    const payload = laborVacationFormatGenerationSchema.parse(request.body ?? {});
    const user = getSessionUser(request);
    const laborFile = await service.findById(params.laborFileId);

    if (!laborFile) {
      throw new app.errors.AppError(404, "LABOR_FILE_NOT_FOUND", "El expediente laboral no existe.");
    }

    const generatedFormat = await renderLaborVacationFormatDocx(laborFile, payload);
    const laborFiles = await service.list();
    assertNoTeamVacationConflicts({
      laborFiles,
      laborFile,
      dateKeys: generatedFormat.fields.vacationDates,
      user,
      override: Boolean(payload.overrideTeamVacationConflict)
    });

    return service.createVacationEvent(params.laborFileId, {
      eventType: "VACATION",
      vacationDates: generatedFormat.fields.vacationDates,
      days: generatedFormat.fields.vacationDates.length,
      startDate: generatedFormat.fields.vacationDates[0] ?? null,
      endDate: generatedFormat.fields.vacationDates[generatedFormat.fields.vacationDates.length - 1] ?? null,
      description: generatedFormat.fields.description || null,
      acceptanceOriginalFileName: generatedFormat.filename,
      acceptanceFileMimeType: DOCX_MIME_TYPE,
      acceptanceFileBase64: generatedFormat.buffer.toString("base64")
    });
  });

  app.get("/labor-files/documents/:documentId", { preHandler: readGuards }, async (request, reply) => {
    const params = documentIdParamsSchema.parse(request.params);
    const user = getSessionUser(request);
    const document = await service.findDocument(params.documentId);

    if (!document) {
      throw new app.errors.AppError(404, "LABOR_FILE_DOCUMENT_NOT_FOUND", "El documento no existe.");
    }

    if (!canWriteLaborFiles(user) && document.userId !== user.id) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Solo puedes consultar documentos de tu propio expediente.");
    }

    reply.header("Content-Type", document.fileMimeType || "application/octet-stream");
    reply.header("Content-Disposition", encodeDispositionFilename(document.originalFileName));
    return reply.send(document.fileContent);
  });

  app.delete("/labor-files/documents/:documentId", { preHandler: writeGuards }, async (request, reply) => {
    const params = documentIdParamsSchema.parse(request.params);
    await service.deleteDocument(params.documentId);
    reply.code(204);
    return null;
  });

  app.post("/labor-files/:laborFileId/vacation-events", { preHandler: writeGuards }, async (request) => {
    const params = laborFileIdParamsSchema.parse(request.params);
    const payload = vacationEventSchema.parse(request.body ?? {});
    if (payload.eventType === "VACATION" || payload.eventType === "GLOBAL_VACATION") {
      throw new app.errors.AppError(
        400,
        "LABOR_VACATION_FORMAT_REQUIRED",
        "Las vacaciones nuevas solo pueden agregarse desde la tarjeta Generación de formato de vacaciones o desde Vacaciones generales."
      );
    }

    return service.createVacationEvent(params.laborFileId, payload);
  });

  app.post("/labor-files/:laborFileId/previous-year-pending-vacations", { preHandler: writeGuards }, async (request) => {
    const params = laborFileIdParamsSchema.parse(request.params);
    const payload = previousYearPendingVacationSchema.parse(request.body ?? {});
    const user = getSessionUser(request);

    if (!isSuperadminEduardoRusconi(user)) {
      throw new app.errors.AppError(
        403,
        "LABOR_PREVIOUS_YEAR_PENDING_FORBIDDEN",
        "Solo el superadmin Eduardo Rusconi puede agregar manualmente días pendientes del año anterior."
      );
    }

    const laborFile = await service.findById(params.laborFileId);
    if (!laborFile) {
      throw new app.errors.AppError(404, "LABOR_FILE_NOT_FOUND", "El expediente laboral no existe.");
    }

    const pendingPeriodDates = payload.pendingPeriod === "YEAR_BEFORE_LAST"
      ? {
          previousYearStartDate: laborFile.vacationSummary.yearBeforeLastStartDate,
          previousYearEndDate: laborFile.vacationSummary.yearBeforeLastEndDate
        }
      : {
          previousYearStartDate: laborFile.vacationSummary.previousYearStartDate,
          previousYearEndDate: laborFile.vacationSummary.previousYearEndDate
        };

    return service.setPreviousYearPendingVacationDays(params.laborFileId, {
      days: payload.days,
      description: payload.description || null,
      manualOverrideConfirmed: payload.manualOverrideConfirmed,
      pendingPeriod: payload.pendingPeriod,
      ...pendingPeriodDates
    });
  });

  app.post("/labor-files/vacation-events/:eventId/signed-format", { bodyLimit: 25 * 1024 * 1024, preHandler: writeGuards }, async (request) => {
    const params = vacationEventIdParamsSchema.parse(request.params);
    const payload = signedVacationFormatSchema.parse(request.body ?? {});
    const user = getSessionUser(request);
    const laborFiles = await service.list();
    const laborFile = laborFiles.find((candidate) =>
      candidate.vacationEvents.some((event) => event.id === params.eventId)
    );
    const vacationEvent = laborFile?.vacationEvents.find((event) => event.id === params.eventId);

    if (!laborFile || !vacationEvent) {
      throw new app.errors.AppError(404, "LABOR_VACATION_EVENT_NOT_FOUND", "El movimiento de vacaciones no existe.");
    }

    if (vacationEvent.eventType !== "VACATION" && vacationEvent.eventType !== "GLOBAL_VACATION") {
      throw new app.errors.AppError(400, "LABOR_VACATION_SIGNED_FORMAT_INVALID_EVENT", "Solo las vacaciones pueden autorizarse con PDF firmado.");
    }

    if (vacationEvent.eventType === "VACATION") {
      assertNoTeamVacationConflicts({
        laborFiles,
        laborFile,
        dateKeys: getVacationEventDateKeys(vacationEvent),
        user,
        override: Boolean(payload.overrideTeamVacationConflict),
        excludeEventId: vacationEvent.id
      });
    }

    return service.updateVacationAcceptance(params.eventId, {
      originalFileName: payload.originalFileName,
      fileMimeType: payload.fileMimeType,
      fileContent: decodeFileBase64(payload.fileBase64)
    });
  });

  app.get("/labor-files/vacation-events/:eventId/acceptance-format", { preHandler: readGuards }, async (request, reply) => {
    const params = vacationEventIdParamsSchema.parse(request.params);
    const user = getSessionUser(request);
    const document = await service.findVacationAcceptanceDocument(params.eventId);

    if (!document) {
      throw new app.errors.AppError(404, "LABOR_VACATION_ACCEPTANCE_DOCUMENT_NOT_FOUND", "El formato de aceptación no existe.");
    }

    if (!canWriteLaborFiles(user) && document.userId !== user.id) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Solo puedes consultar documentos de tu propio expediente.");
    }

    reply.header("Content-Type", document.fileMimeType || "application/pdf");
    reply.header("Content-Disposition", encodeDispositionFilename(document.originalFileName));
    return reply.send(document.fileContent);
  });

  app.delete("/labor-files/vacation-events/:eventId", { preHandler: writeGuards }, async (request, reply) => {
    const params = vacationEventIdParamsSchema.parse(request.params);
    const user = getSessionUser(request);
    const laborFiles = await service.list();
    const vacationEvent = laborFiles
      .flatMap((laborFile) => laborFile.vacationEvents)
      .find((event) => event.id === params.eventId);

    if (vacationEvent) {
      assertCanDeleteVacationEvent(user, vacationEvent);
    }

    await service.deleteVacationEvent(params.eventId);
    reply.code(204);
    return null;
  });
};
