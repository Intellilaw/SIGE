import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAnyPermissions, requireAuth } from "../../core/auth/guards";

const paymentMilestoneSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  amountMxn: z.number().nullable().optional(),
  notes: z.string().nullable().optional()
});

const createContractSchema = z.object({
  contractNumber: z.string().min(1),
  contractType: z.enum(["PROFESSIONAL_SERVICES", "LABOR"]),
  documentKind: z.enum(["CONTRACT", "ADDENDUM"]).default("CONTRACT"),
  clientId: z.string().nullable().optional(),
  collaboratorName: z.string().nullable().optional(),
  paymentMilestones: z.array(paymentMilestoneSchema).default([]),
  notes: z.string().nullable().optional(),
  originalFileName: z.string().nullable().optional(),
  fileMimeType: z.string().nullable().optional(),
  fileBase64: z.string().nullable().optional()
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

export const internalContractsRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.InternalContractsService(app.repositories.internalContracts);
  const readGuards = [requireAuth, requireAnyPermissions(["internal-contracts:read", "internal-contracts:write"])];
  const writeGuards = [requireAuth, requireAnyPermissions(["internal-contracts:write"])];

  app.get("/internal-contracts", { preHandler: readGuards }, async () => service.list());

  app.get("/internal-contracts/collaborators", { preHandler: readGuards }, async () => service.listCollaborators());

  app.post("/internal-contracts", { bodyLimit: 25 * 1024 * 1024, preHandler: writeGuards }, async (request) => {
    const payload = createContractSchema.parse(request.body ?? {});
    const fileContent = decodeFileBase64(payload.fileBase64);

    return service.create({
      contractNumber: payload.contractNumber,
      contractType: payload.contractType,
      documentKind: payload.documentKind,
      clientId: payload.clientId,
      collaboratorName: payload.collaboratorName,
      paymentMilestones: payload.paymentMilestones.map((milestone, index) => ({
        id: milestone.id ?? `milestone-${index + 1}`,
        label: milestone.label ?? "",
        dueDate: milestone.dueDate ?? undefined,
        amountMxn: milestone.amountMxn ?? undefined,
        notes: milestone.notes ?? undefined
      })),
      notes: payload.notes,
      originalFileName: payload.originalFileName,
      fileMimeType: payload.fileMimeType,
      fileSizeBytes: fileContent?.byteLength ?? null,
      fileContent
    });
  });

  app.get("/internal-contracts/:contractId/document", { preHandler: readGuards }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const document = await service.findDocument(params.contractId);

    if (!document) {
      throw new app.errors.AppError(404, "INTERNAL_CONTRACT_DOCUMENT_NOT_FOUND", "El archivo del contrato no existe.");
    }

    reply.header("Content-Type", document.fileMimeType || "application/octet-stream");
    reply.header("Content-Disposition", encodeDispositionFilename(document.originalFileName));
    return reply.send(document.fileContent);
  });

  app.delete("/internal-contracts/:contractId", { preHandler: writeGuards }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    await service.delete(params.contractId);
    reply.code(204);
    return null;
  });
};
