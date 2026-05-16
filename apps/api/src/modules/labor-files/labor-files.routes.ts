import type { FastifyPluginAsync } from "fastify";
import { deriveEffectivePermissions } from "@sige/contracts";
import { z } from "zod";

import { getSessionUser, requireAnyPermissions, requireAuth } from "../../core/auth/guards";
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
  notes: z.string().nullable().optional()
});

const uploadDocumentSchema = z.object({
  documentType: z.enum([
    "EMPLOYMENT_CONTRACT",
    "ADDENDUM",
    "PROOF_OF_ADDRESS",
    "TAX_STATUS_CERTIFICATE",
    "OFFICIAL_ID",
    "CV",
    "PROFESSIONAL_TITLE",
    "PROFESSIONAL_LICENSE"
  ]),
  originalFileName: z.string().min(1),
  fileMimeType: z.string().nullable().optional(),
  fileBase64: z.string().min(1)
});

const laborContractGenerationSchema = laborContractFieldValuesSchema;
const laborVacationFormatGenerationSchema = laborVacationFormatFieldValuesSchema;

const vacationEventSchema = z.object({
  eventType: z.enum(["PREVIOUS_YEAR_DEDUCTION", "VACATION"]),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  vacationDates: z.array(z.string().min(10).max(30)).optional(),
  days: z.number().positive().optional(),
  description: z.string().nullable().optional(),
  acceptanceOriginalFileName: z.string().nullable().optional(),
  acceptanceFileMimeType: z.string().nullable().optional(),
  acceptanceFileBase64: z.string().nullable().optional()
});

const globalVacationDaySchema = z.object({
  date: z.string().min(10).max(30),
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

function getEffectivePermissions(user: ReturnType<typeof getSessionUser>) {
  return deriveEffectivePermissions({
    legacyRole: user.legacyRole,
    team: user.team,
    legacyTeam: user.legacyTeam,
    specificRole: user.specificRole,
    permissions: user.permissions
  });
}

function canWriteLaborFiles(user: ReturnType<typeof getSessionUser>) {
  const permissions = getEffectivePermissions(user);
  return permissions.includes("*") || permissions.includes("labor-file:write");
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

  app.post("/labor-files/global-vacation-days", { preHandler: writeGuards }, async (request) => {
    const payload = globalVacationDaySchema.parse(request.body ?? {});
    return service.createGlobalVacationDay(payload);
  });

  app.delete("/labor-files/global-vacation-days/:dayId", { preHandler: writeGuards }, async (request, reply) => {
    const params = globalVacationDayIdParamsSchema.parse(request.params);
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
    const laborFile = await service.findById(params.laborFileId);

    if (!laborFile) {
      throw new app.errors.AppError(404, "LABOR_FILE_NOT_FOUND", "El expediente laboral no existe.");
    }

    const generatedFormat = await renderLaborVacationFormatDocx(laborFile, payload);
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
    return service.createVacationEvent(params.laborFileId, payload);
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
    await service.deleteVacationEvent(params.eventId);
    reply.code(204);
    return null;
  });
};
