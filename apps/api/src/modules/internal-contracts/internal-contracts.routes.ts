import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAnyPermissions, requireAuth, requireRoles } from "../../core/auth/guards";
import {
  buildProfessionalServicesContractPrefill,
  professionalServicesContractFieldValuesSchema,
  renderProfessionalServicesContractFiles
} from "./professional-services-contract-generator";

const paymentMilestoneSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  amountMxn: z.number().nullable().optional(),
  notes: z.string().nullable().optional()
});

const createContractSchema = z.object({
  contractNumber: z.string().min(1),
  title: z.string().nullable().optional(),
  contractType: z.enum(["PROFESSIONAL_SERVICES", "LEGAL_POLICIES", "LABOR"]),
  documentKind: z.enum(["CONTRACT", "ADDENDUM"]).default("CONTRACT"),
  clientId: z.string().nullable().optional(),
  collaboratorName: z.string().nullable().optional(),
  paymentMilestones: z.array(paymentMilestoneSchema).default([]),
  notes: z.string().nullable().optional(),
  originalFileName: z.string().nullable().optional(),
  fileMimeType: z.string().nullable().optional(),
  fileBase64: z.string().nullable().optional()
});

const createTemplateSchema = z.object({
  title: z.string().min(1),
  notes: z.string().nullable().optional(),
  originalFileName: z.string().nullable().optional(),
  fileMimeType: z.string().nullable().optional(),
  fileBase64: z.string().nullable().optional()
});

const paramsSchema = z.object({
  contractId: z.string().min(1)
});

const templateParamsSchema = z.object({
  templateId: z.string().min(1)
});

const professionalServicesParamsSchema = z.object({
  matterId: z.string().min(1)
});

const professionalServicesGenerateSchema = z.object({
  matterId: z.string().min(1),
  fields: professionalServicesContractFieldValuesSchema
});

const documentQuerySchema = z.object({
  format: z.enum(["docx", "pdf"]).optional()
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
  const templateReadGuards = [requireAuth, requireAnyPermissions(["internal-contract-templates:read"])];
  const superadminGuards = [requireAuth, requireRoles(["SUPERADMIN"])];
  const professionalServicesGuards = [requireAuth, requireAnyPermissions(["finances:write", "matters:write", "internal-contracts:write"])];

  async function loadProfessionalServicesContext(matterId: string) {
    const matter = (await app.repositories.matters.list()).find((entry) => entry.id === matterId);
    if (!matter) {
      throw new app.errors.AppError(404, "MATTER_NOT_FOUND", "El asunto seleccionado no existe.");
    }

    if (!matter.clientId) {
      throw new app.errors.AppError(400, "INTERNAL_CONTRACT_CLIENT_REQUIRED", "El asunto no tiene cliente vinculado.");
    }

    if (!matter.quoteId) {
      throw new app.errors.AppError(400, "INTERNAL_CONTRACT_QUOTE_REQUIRED", "El asunto no tiene cotizacion vinculada.");
    }

    const quote = await app.repositories.quotes.findById(matter.quoteId);
    if (!quote) {
      throw new app.errors.AppError(404, "QUOTE_NOT_FOUND", "La cotizacion vinculada no existe.");
    }

    const existingState = await service.findGeneratedProfessionalServicesState(matter.id);
    return { matter, quote, existingState };
  }

  app.get("/internal-contracts", { preHandler: readGuards }, async () => service.list());

  app.get("/internal-contracts/collaborators", { preHandler: readGuards }, async () => service.listCollaborators());

  app.get("/internal-contracts/templates", { preHandler: templateReadGuards }, async () => service.listTemplates());

  app.post("/internal-contracts/templates", { bodyLimit: 25 * 1024 * 1024, preHandler: superadminGuards }, async (request) => {
    const payload = createTemplateSchema.parse(request.body ?? {});
    const fileContent = decodeFileBase64(payload.fileBase64);

    return service.createTemplate({
      title: payload.title,
      notes: payload.notes,
      originalFileName: payload.originalFileName,
      fileMimeType: payload.fileMimeType,
      fileSizeBytes: fileContent?.byteLength ?? null,
      fileContent
    });
  });

  app.get("/internal-contracts/templates/:templateId/document", { preHandler: templateReadGuards }, async (request, reply) => {
    const params = templateParamsSchema.parse(request.params);
    const document = await service.findTemplateDocument(params.templateId);

    if (!document) {
      throw new app.errors.AppError(404, "INTERNAL_CONTRACT_TEMPLATE_DOCUMENT_NOT_FOUND", "El archivo del machote no existe.");
    }

    reply.header("Content-Type", document.fileMimeType || "application/octet-stream");
    reply.header("Content-Disposition", encodeDispositionFilename(document.originalFileName));
    return reply.send(document.fileContent);
  });

  app.delete("/internal-contracts/templates/:templateId", { preHandler: superadminGuards }, async (request, reply) => {
    const params = templateParamsSchema.parse(request.params);
    await service.deleteTemplate(params.templateId);
    reply.code(204);
    return null;
  });

  app.post("/internal-contracts", { bodyLimit: 25 * 1024 * 1024, preHandler: writeGuards }, async (request) => {
    const payload = createContractSchema.parse(request.body ?? {});
    const fileContent = decodeFileBase64(payload.fileBase64);

    return service.create({
      contractNumber: payload.contractNumber,
      title: payload.title,
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

  app.get("/internal-contracts/professional-services/prefill/:matterId", { preHandler: professionalServicesGuards }, async (request) => {
    const params = professionalServicesParamsSchema.parse(request.params);
    const { matter, quote, existingState } = await loadProfessionalServicesContext(params.matterId);
    return buildProfessionalServicesContractPrefill(matter, quote, existingState);
  });

  app.post("/internal-contracts/professional-services/generate", { preHandler: professionalServicesGuards }, async (request) => {
    const payload = professionalServicesGenerateSchema.parse(request.body ?? {});
    const { matter, quote } = await loadProfessionalServicesContext(payload.matterId);
    const prefill = buildProfessionalServicesContractPrefill(matter, quote, null);
    const files = await renderProfessionalServicesContractFiles({
      coverContractNumber: prefill.contractNumber,
      clientName: prefill.clientName,
      title: prefill.title,
      fields: payload.fields,
      serviceLines: prefill.serviceLines,
      paymentMilestones: prefill.paymentMilestones,
      totalMxn: prefill.totalMxn
    });

    return service.upsertGeneratedProfessionalServices({
      contractNumber: prefill.contractNumber,
      title: prefill.title,
      clientId: matter.clientId!,
      sourceMatterId: matter.id,
      sourceQuoteId: matter.quoteId,
      signatureStatus: "PENDING",
      fields: payload.fields,
      paymentMilestones: prefill.paymentMilestones,
      notes: `Generado desde Finanzas para ${prefill.subject}.`,
      docxOriginalFileName: files.docx.filename,
      docxFileMimeType: files.docx.contentType,
      docxFileSizeBytes: files.docx.buffer.byteLength,
      docxFileContent: files.docx.buffer,
      pdfOriginalFileName: files.pdf?.filename ?? null,
      pdfFileMimeType: files.pdf?.contentType ?? null,
      pdfFileSizeBytes: files.pdf?.buffer.byteLength ?? null,
      pdfFileContent: files.pdf?.buffer ?? null
    });
  });

  app.get("/internal-contracts/:contractId/document", { preHandler: readGuards }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const query = documentQuerySchema.parse(request.query ?? {});
    const requestedFormat = query.format ?? "docx";
    const generatedState = await service.findGeneratedProfessionalServicesStateByContractId(params.contractId);

    if (generatedState && requestedFormat !== "pdf") {
      const { matter, quote, existingState } = await loadProfessionalServicesContext(generatedState.sourceMatterId);
      const prefill = buildProfessionalServicesContractPrefill(matter, quote, existingState);
      const files = await renderProfessionalServicesContractFiles({
        coverContractNumber: prefill.contractNumber,
        clientName: prefill.clientName,
        title: prefill.title,
        fields: prefill.fields,
        serviceLines: prefill.serviceLines,
        paymentMilestones: prefill.paymentMilestones,
        totalMxn: prefill.totalMxn
      });

      reply.header("Content-Type", files.docx.contentType);
      reply.header("Content-Disposition", encodeDispositionFilename(files.docx.filename));
      return reply.send(files.docx.buffer);
    }

    const document = await service.findDocument(params.contractId, query.format);

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
