import { Buffer } from "node:buffer";

import type { BulletinDraftInput } from "@sige/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getSessionUser, requireAuth, requireInternalUser } from "../../core/auth/guards";
import { AppError } from "../../core/errors/app-error";
import type { BulletinAttachmentWriteRecord } from "../../repositories/types";

const MAX_GENERATION_FILE_BYTES = 8 * 1024 * 1024;
const MAX_GENERATION_TOTAL_BYTES = 18 * 1024 * 1024;
const MAX_UPLOAD_FILE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_TOTAL_BYTES = 30 * 1024 * 1024;
const GENERATION_BODY_LIMIT = 28 * 1024 * 1024;
const UPLOAD_BODY_LIMIT = 42 * 1024 * 1024;

const paramsSchema = z.object({
  bulletinId: z.string().uuid()
});

const downloadParamsSchema = paramsSchema.extend({
  format: z.enum(["docx", "pdf"])
});

const attachmentSchema = z.object({
  originalFileName: z.string().trim().min(1).max(220),
  fileMimeType: z.string().trim().max(180).nullable().optional(),
  fileBase64: z.string().min(1)
});

const generationSchema = z.object({
  sourceText: z.string().trim().max(30000).nullable().optional(),
  sourceUrls: z.array(z.string().trim().url().max(2000)).max(10).default([]),
  attachments: z.array(attachmentSchema).max(6).default([])
});

const blockSchema = z.object({
  id: z.string().trim().min(1).max(80),
  headingEs: z.string().trim().max(120),
  headingEn: z.string().trim().max(120),
  bodyEs: z.string().trim().min(1).max(2200),
  bodyEn: z.string().trim().min(1).max(2200)
});

const draftSchema = z.object({
  bulletinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  titleEs: z.string().trim().min(1).max(180),
  titleEn: z.string().trim().min(1).max(180),
  pageCount: z.union([z.literal(1), z.literal(2)]),
  twoPageReason: z.string().trim().max(300).nullable().optional(),
  blocks: z.array(blockSchema).min(1).max(5)
}).superRefine((payload, context) => {
  if (payload.pageCount === 2 && (payload.twoPageReason ?? "").trim().length < 12) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["twoPageReason"],
      message: "Explica brevemente por que se justifican dos paginas."
    });
  }
});

const uploadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  bulletinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  docx: attachmentSchema.nullable().optional(),
  pdf: attachmentSchema.nullable().optional()
}).refine((payload) => payload.docx || payload.pdf, {
  message: "Carga por lo menos un archivo Word o PDF."
});

function actorFromRequest(request: Parameters<typeof getSessionUser>[0]) {
  const user = getSessionUser(request);
  return {
    organizationId: user.organizationId,
    userId: user.id,
    displayName: user.displayName || user.shortName || user.username || user.email
  };
}

function decodeBase64(value: string) {
  const normalized = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return Buffer.from(normalized, "base64");
}

function inferExtension(filename: string) {
  const match = filename.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function validateGenerationAttachment(filename: string, mimeType?: string | null) {
  const extension = inferExtension(filename);
  const allowedExtensions = new Set([".pdf", ".docx", ".txt", ".jpg", ".jpeg", ".png"]);
  const allowedMimeTypes = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "image/jpeg",
    "image/png",
    "application/octet-stream",
    ""
  ]);

  if (!allowedExtensions.has(extension) || !allowedMimeTypes.has((mimeType ?? "").toLowerCase())) {
    throw new AppError(
      400,
      "BULLETIN_ATTACHMENT_TYPE_INVALID",
      "Los adjuntos admitidos son PDF, DOCX, TXT, JPG y PNG."
    );
  }
}

function toAttachmentRecord(
  input: z.infer<typeof attachmentSchema>,
  options: { expectedExtension?: ".docx" | ".pdf"; maxBytes: number }
): BulletinAttachmentWriteRecord {
  const extension = inferExtension(input.originalFileName);
  if (options.expectedExtension && extension !== options.expectedExtension) {
    throw new AppError(
      400,
      "BULLETIN_UPLOAD_TYPE_INVALID",
      `El archivo debe tener extension ${options.expectedExtension}.`
    );
  }

  if (!options.expectedExtension) {
    validateGenerationAttachment(input.originalFileName, input.fileMimeType);
  }

  const fileContent = decodeBase64(input.fileBase64);
  if (fileContent.byteLength === 0) {
    throw new AppError(400, "BULLETIN_ATTACHMENT_EMPTY", `El archivo ${input.originalFileName} esta vacio.`);
  }
  if (fileContent.byteLength > options.maxBytes) {
    throw new AppError(400, "BULLETIN_ATTACHMENT_TOO_LARGE", `El archivo ${input.originalFileName} excede el limite permitido.`);
  }

  return {
    originalFileName: input.originalFileName,
    fileMimeType: input.fileMimeType,
    fileContent
  };
}

function contentDisposition(filename: string) {
  const asciiFallback = filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "")
    .trim() || "boletin";
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const bulletinsRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.BulletinsService(app.repositories.bulletins);
  const internalGuards = [requireAuth, requireInternalUser];

  app.get("/bulletins", { preHandler: internalGuards }, async () => service.list());

  app.post(
    "/bulletins/generate",
    { preHandler: internalGuards, bodyLimit: GENERATION_BODY_LIMIT },
    async (request, reply) => {
      const payload = generationSchema.parse(request.body ?? {});
      const attachments = payload.attachments.map((attachment) =>
        toAttachmentRecord(attachment, { maxBytes: MAX_GENERATION_FILE_BYTES })
      );
      const totalBytes = attachments.reduce((sum, attachment) => sum + attachment.fileContent.byteLength, 0);
      if (totalBytes > MAX_GENERATION_TOTAL_BYTES) {
        throw new AppError(400, "BULLETIN_ATTACHMENTS_TOO_LARGE", "Los adjuntos exceden 18 MB en conjunto.");
      }

      const actor = actorFromRequest(request);
      const bulletin = await service.createPendingGeneration({
        sourceText: payload.sourceText,
        sourceUrls: payload.sourceUrls,
        attachments
      }, actor);
      reply.raw.once("finish", () => {
        void service.processGeneration(bulletin.id, actor).catch((error: unknown) => {
          app.log.error({ error, bulletinId: bulletin.id }, "Asynchronous bulletin generation failed.");
        });
      });
      reply.code(202);
      return bulletin;
    }
  );

  app.post("/bulletins/:bulletinId/retry-generation", { preHandler: internalGuards }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const actor = actorFromRequest(request);
    const bulletin = await service.retryGeneration(params.bulletinId);
    reply.raw.once("finish", () => {
      void service.processGeneration(bulletin.id, actor).catch((error: unknown) => {
        app.log.error({ error, bulletinId: bulletin.id }, "Asynchronous bulletin retry failed.");
      });
    });
    reply.code(202);
    return bulletin;
  });

  app.patch("/bulletins/:bulletinId", { preHandler: internalGuards }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const payload = draftSchema.parse(request.body ?? {}) as BulletinDraftInput;
    return service.update(params.bulletinId, payload);
  });

  app.post("/bulletins/:bulletinId/approve", { preHandler: internalGuards }, async (request) => {
    const params = paramsSchema.parse(request.params);
    return service.approve(params.bulletinId, actorFromRequest(request));
  });

  app.post(
    "/bulletins/upload",
    { preHandler: internalGuards, bodyLimit: UPLOAD_BODY_LIMIT },
    async (request) => {
      const payload = uploadSchema.parse(request.body ?? {});
      const docx = payload.docx
        ? toAttachmentRecord(payload.docx, { expectedExtension: ".docx", maxBytes: MAX_UPLOAD_FILE_BYTES })
        : null;
      const pdf = payload.pdf
        ? toAttachmentRecord(payload.pdf, { expectedExtension: ".pdf", maxBytes: MAX_UPLOAD_FILE_BYTES })
        : null;
      if ((docx?.fileContent.byteLength ?? 0) + (pdf?.fileContent.byteLength ?? 0) > MAX_UPLOAD_TOTAL_BYTES) {
        throw new AppError(400, "BULLETIN_UPLOAD_TOO_LARGE", "Los archivos historicos exceden 30 MB en conjunto.");
      }

      return service.upload({
        title: payload.title,
        bulletinDate: payload.bulletinDate,
        docx,
        pdf
      }, actorFromRequest(request));
    }
  );

  app.get("/bulletins/:bulletinId/download/:format", { preHandler: internalGuards }, async (request, reply) => {
    const params = downloadParamsSchema.parse(request.params);
    const document = await service.download(params.bulletinId, params.format);
    reply.header("Content-Type", document.fileMimeType);
    reply.header("Content-Disposition", contentDisposition(document.originalFileName));
    return reply.send(document.fileContent);
  });

  app.delete("/bulletins/:bulletinId", { preHandler: internalGuards }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    await service.delete(params.bulletinId);
    reply.code(204);
    return null;
  });
};
