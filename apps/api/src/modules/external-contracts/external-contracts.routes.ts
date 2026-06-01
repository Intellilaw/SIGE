import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { Buffer } from "node:buffer";
import { z } from "zod";

import { getSessionUser, requireAnyPermissions, requireAuth } from "../../core/auth/guards";
import { AppError } from "../../core/errors/app-error";

const contractBaseSchema = z.object({
  contractNumber: z.string().trim().min(1),
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
  fileBase64: z.string().nullable().optional()
});

const createContractSchema = contractBaseSchema;
const updateContractSchema = contractBaseSchema.partial().extend({
  contractType: z.enum(["LEASE"]).optional()
});

const paramsSchema = z.object({
  contractId: z.string().min(1)
});

function decodeFileBase64(value?: string | null) {
  if (!value) {
    return null;
  }

  const base64Payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return Buffer.from(base64Payload, "base64");
}

function encodeDispositionFilename(filename: string) {
  return `attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
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
      fileContent
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
      fileContent
    });
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
