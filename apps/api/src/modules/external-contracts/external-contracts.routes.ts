import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { Buffer } from "node:buffer";
import { z } from "zod";

import { getSessionUser, requireAnyPermissions, requireAuth } from "../../core/auth/guards";
import { AppError } from "../../core/errors/app-error";
import { prefillExternalContractFields, prefillExternalContractRenewalFields } from "./external-contract-prefill";
import { RENT_UPDATE_TEMPLATE_ID, resolveRentUpdateDownloadFilename } from "./external-contract-rent-update-format";

const contractRenewalSchema = z.object({
  id: z.string().nullable().optional(),
  documentKind: z.enum(["NEW_CONTRACT_OR_AGREEMENT", "RENT_UPDATE_FORMAT"]).nullable().optional(),
  renewalDate: z.string().nullable().optional(),
  leaseStartDate: z.string().nullable().optional(),
  leaseEndDate: z.string().nullable().optional(),
  monthlyRentMxn: z.number().nullable().optional(),
  rentIncreasePct: z.number().nullable().optional(),
  inpcBasePeriod: z.string().nullable().optional(),
  inpcTargetPeriod: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
});

const contractMilestoneSchema = z.object({
  id: z.string().nullable().optional(),
  source: z.enum(["EXTRACTED", "MANUAL"]).nullable().optional(),
  title: z.string().trim().min(1),
  dueDate: z.string().trim().min(1),
  description: z.string().nullable().optional()
});

const contractBaseSchema = z.object({
  contractNumber: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  contractType: z.enum(["LEASE"]).default("LEASE"),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  clientId: z.string().trim().min(1),
  propertyAddress: z.string().nullable().optional(),
  landlordName: z.string().nullable().optional(),
  tenantName: z.string().nullable().optional(),
  leaseStartDate: z.string().nullable().optional(),
  leaseEndDate: z.string().nullable().optional(),
  renewalDate: z.string().nullable().optional(),
  rentIncreaseDate: z.string().nullable().optional(),
  monthlyRentMxn: z.number().nullable().optional(),
  rentIncreasePct: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  originalFileName: z.string().nullable().optional(),
  fileMimeType: z.string().nullable().optional(),
  fileBase64: z.string().nullable().optional(),
  renewals: z.array(contractRenewalSchema).optional(),
  milestones: z.array(contractMilestoneSchema).optional()
});

const createContractSchema = contractBaseSchema;
const updateContractSchema = contractBaseSchema.partial().extend({
  contractType: z.enum(["LEASE"]).optional()
});

const prefillContractSchema = z.object({
  originalFileName: z.string().trim().min(1),
  fileMimeType: z.string().nullable().optional(),
  fileBase64: z.string().trim().min(1)
});

const prefillRenewalSchema = prefillContractSchema.extend({
  documentKind: z.enum(["NEW_CONTRACT_OR_AGREEMENT", "RENT_UPDATE_FORMAT"]).default("NEW_CONTRACT_OR_AGREEMENT")
});

const paramsSchema = z.object({
  contractId: z.string().min(1)
});

const generatedDocumentParamsSchema = paramsSchema.extend({
  documentId: z.string().min(1)
});

const renewalParamsSchema = paramsSchema.extend({
  renewalId: z.string().min(1)
});

const renewalDocumentParamsSchema = renewalParamsSchema.extend({
  documentId: z.string().min(1)
});

const renewalDocumentUploadSchema = z.object({
  documentType: z.string().nullable().optional(),
  originalFileName: z.string().trim().min(1),
  fileMimeType: z.string().nullable().optional(),
  fileBase64: z.string().trim().min(1)
});

const rentUpdateFormatSchema = z.object({
  renewalId: z.string().nullable().optional(),
  documentDate: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  previousRentMxn: z.number().nullable().optional(),
  inpcBasePeriod: z.string().nullable().optional(),
  inpcTargetPeriod: z.string().nullable().optional(),
  useRoundedRent: z.boolean().nullable().optional(),
  roundedRentMxn: z.number().nullable().optional()
});

function decodeFileBase64(value?: string | null) {
  if (!value) {
    return null;
  }

  const base64Payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return Buffer.from(base64Payload, "base64");
}

function encodeDispositionFilename(filename: string) {
  const fallbackFilename = filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]+/g, "")
    .replace(/["\\;]/g, "")
    .trim() || "download";

  return `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function normalizeAccessText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function requireSettlementsTeam(request: FastifyRequest) {
  const user = getSessionUser(request);
  const normalizedTeam = normalizeAccessText(user.legacyTeam);
  const normalizedRole = normalizeAccessText(user.specificRole);
  const hasAdministrativeAccess =
    user.role === "SUPERADMIN"
    || user.legacyRole === "SUPERADMIN"
    || normalizedRole === "direccion general"
    || user.permissions.includes("*");
  const isSettlementsTeam =
    hasAdministrativeAccess || user.team === "SETTLEMENTS" || normalizedTeam === "convenios" || normalizedRole.includes("convenios");

  if (!isSettlementsTeam) {
    throw new AppError(403, "EXTERNAL_CONTRACTS_SETTLEMENTS_ONLY", "Solo el equipo de Convenios puede acceder a contratos externos.");
  }
}

export const externalContractsRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.ExternalContractsService(app.repositories.externalContracts);
  const readGuards = [requireAuth, requireSettlementsTeam, requireAnyPermissions(["external-contracts:read", "external-contracts:write"])];
  const writeGuards = [requireAuth, requireSettlementsTeam, requireAnyPermissions(["external-contracts:write"])];

  app.get("/external-contracts", { preHandler: readGuards }, async () => service.list());
  app.get("/external-contracts/inpc", { preHandler: readGuards }, async () => service.listInpc());

  app.post("/external-contracts/inpc/sync", { preHandler: writeGuards }, async () => service.syncInpc());

  app.post("/external-contracts/prefill", { bodyLimit: 25 * 1024 * 1024, preHandler: writeGuards }, async (request) => {
    const payload = prefillContractSchema.parse(request.body ?? {});
    const fileContent = decodeFileBase64(payload.fileBase64);

    if (!fileContent) {
      throw new AppError(400, "EXTERNAL_CONTRACT_PREFILL_FILE_REQUIRED", "Selecciona un archivo para leerlo con IA.");
    }

    return prefillExternalContractFields({
      originalFileName: payload.originalFileName,
      fileMimeType: payload.fileMimeType,
      fileContent
    });
  });

  app.post("/external-contracts/renewals/prefill", { bodyLimit: 25 * 1024 * 1024, preHandler: writeGuards }, async (request) => {
    const payload = prefillRenewalSchema.parse(request.body ?? {});
    const fileContent = decodeFileBase64(payload.fileBase64);

    if (!fileContent) {
      throw new AppError(400, "EXTERNAL_CONTRACT_RENEWAL_PREFILL_FILE_REQUIRED", "Selecciona un documento de renovacion para leerlo con IA.");
    }

    return prefillExternalContractRenewalFields({
      documentKind: payload.documentKind,
      originalFileName: payload.originalFileName,
      fileMimeType: payload.fileMimeType,
      fileContent
    });
  });

  app.post("/external-contracts", { bodyLimit: 25 * 1024 * 1024, preHandler: writeGuards }, async (request) => {
    const payload = createContractSchema.parse(request.body ?? {});
    const fileContent = decodeFileBase64(payload.fileBase64);

    return service.create({
      contractNumber: payload.contractNumber,
      title: payload.title,
      contractType: payload.contractType,
      status: payload.status,
      clientId: payload.clientId,
      propertyAddress: payload.propertyAddress,
      landlordName: payload.landlordName,
      tenantName: payload.tenantName,
      leaseStartDate: payload.leaseStartDate,
      leaseEndDate: payload.leaseEndDate,
      renewalDate: payload.renewalDate,
      rentIncreaseDate: payload.rentIncreaseDate,
      monthlyRentMxn: payload.monthlyRentMxn,
      rentIncreasePct: payload.rentIncreasePct,
      notes: payload.notes,
      originalFileName: payload.originalFileName,
      fileMimeType: payload.fileMimeType,
      fileSizeBytes: fileContent?.byteLength ?? null,
      fileContent,
      renewals: payload.renewals,
      milestones: payload.milestones
    });
  });

  app.patch("/external-contracts/:contractId", { bodyLimit: 25 * 1024 * 1024, preHandler: writeGuards }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const payload = updateContractSchema.parse(request.body ?? {});
    const fileContent = decodeFileBase64(payload.fileBase64);

    return service.update(params.contractId, {
      contractNumber: payload.contractNumber,
      title: payload.title,
      status: payload.status,
      clientId: payload.clientId,
      propertyAddress: payload.propertyAddress,
      landlordName: payload.landlordName,
      tenantName: payload.tenantName,
      leaseStartDate: payload.leaseStartDate,
      leaseEndDate: payload.leaseEndDate,
      renewalDate: payload.renewalDate,
      rentIncreaseDate: payload.rentIncreaseDate,
      monthlyRentMxn: payload.monthlyRentMxn,
      rentIncreasePct: payload.rentIncreasePct,
      notes: payload.notes,
      originalFileName: fileContent ? payload.originalFileName : undefined,
      fileMimeType: fileContent ? payload.fileMimeType : undefined,
      fileSizeBytes: fileContent?.byteLength ?? undefined,
      fileContent,
      renewals: payload.renewals,
      milestones: payload.milestones
    });
  });

  app.post("/external-contracts/:contractId/formats/rent-increase", { preHandler: writeGuards }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const payload = rentUpdateFormatSchema.parse(request.body ?? {});

    return service.generateRentUpdateFormat(params.contractId, payload);
  });

  app.get("/external-contracts/:contractId/generated-documents/:documentId", { preHandler: readGuards }, async (request, reply) => {
    const params = generatedDocumentParamsSchema.parse(request.params);
    const document = await service.findGeneratedDocument(params.contractId, params.documentId);

    if (!document) {
      throw new app.errors.AppError(404, "EXTERNAL_CONTRACT_GENERATED_DOCUMENT_NOT_FOUND", "El formato generado no existe.");
    }

    const downloadFilename = document.templateId === RENT_UPDATE_TEMPLATE_ID
      ? resolveRentUpdateDownloadFilename({
          clientName: document.clientName,
          tenantName: document.tenantName,
          documentDate: document.createdAt,
          fileMimeType: document.fileMimeType,
          originalFileName: document.originalFileName
        })
      : document.originalFileName;

    reply.header("Content-Type", document.fileMimeType || "application/octet-stream");
    reply.header("Content-Disposition", encodeDispositionFilename(downloadFilename));
    return reply.send(document.fileContent);
  });

  app.delete("/external-contracts/:contractId/generated-documents/:documentId", { preHandler: writeGuards }, async (request, reply) => {
    const params = generatedDocumentParamsSchema.parse(request.params);
    await service.deleteGeneratedDocument(params.contractId, params.documentId);
    reply.code(204);
    return null;
  });

  app.post("/external-contracts/:contractId/renewals/:renewalId/documents", { bodyLimit: 25 * 1024 * 1024, preHandler: writeGuards }, async (request) => {
    const params = renewalParamsSchema.parse(request.params);
    const payload = renewalDocumentUploadSchema.parse(request.body ?? {});
    const fileContent = decodeFileBase64(payload.fileBase64);

    if (!fileContent) {
      throw new AppError(400, "EXTERNAL_CONTRACT_RENEWAL_DOCUMENT_FILE_REQUIRED", "Selecciona un archivo para cargar en la renovacion.");
    }

    return service.uploadRenewalDocument(params.contractId, params.renewalId, {
      documentType: payload.documentType,
      originalFileName: payload.originalFileName,
      fileMimeType: payload.fileMimeType,
      fileContent
    });
  });

  app.get("/external-contracts/:contractId/renewals/:renewalId/documents/:documentId", { preHandler: readGuards }, async (request, reply) => {
    const params = renewalDocumentParamsSchema.parse(request.params);
    const document = await service.findRenewalDocument(params.contractId, params.renewalId, params.documentId);

    if (!document) {
      throw new app.errors.AppError(404, "EXTERNAL_CONTRACT_RENEWAL_DOCUMENT_NOT_FOUND", "El documento de renovacion no existe.");
    }

    reply.header("Content-Type", document.fileMimeType || "application/octet-stream");
    reply.header("Content-Disposition", encodeDispositionFilename(document.originalFileName));
    return reply.send(document.fileContent);
  });

  app.get("/external-contracts/:contractId/document", { preHandler: readGuards }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const document = await service.findDocument(params.contractId);

    if (!document) {
      throw new app.errors.AppError(404, "EXTERNAL_CONTRACT_DOCUMENT_NOT_FOUND", "El archivo del contrato externo no existe.");
    }

    reply.header("Content-Type", document.fileMimeType || "application/octet-stream");
    reply.header("Content-Disposition", encodeDispositionFilename(document.originalFileName));
    return reply.send(document.fileContent);
  });

  app.delete("/external-contracts/:contractId", { preHandler: writeGuards }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    await service.delete(params.contractId);
    reply.code(204);
    return null;
  });
};
