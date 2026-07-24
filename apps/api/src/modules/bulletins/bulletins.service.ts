import type { BulletinDraftInput } from "@sige/contracts";

import { AppError } from "../../core/errors/app-error";
import { runWithTenantContext } from "../../core/tenant/tenant-context";
import type {
  BulletinAttachmentWriteRecord,
  BulletinsRepository,
  BulletinUploadWriteRecord
} from "../../repositories/types";
import { getCurrentMexicoDate } from "./bulletin-date";
import { renderBulletinExports } from "./bulletin-export";
import { generateBulletinDraft } from "./bulletin-generator";

type BulletinDraftGenerator = typeof generateBulletinDraft;

export interface BulletinActor {
  organizationId: string;
  userId: string;
  displayName: string;
}

export interface BulletinGenerationServiceInput {
  sourceText?: string | null;
  sourceUrls?: string[];
  attachments?: BulletinAttachmentWriteRecord[];
}

export class BulletinsService {
  public constructor(
    private readonly repository: BulletinsRepository,
    private readonly draftGenerator: BulletinDraftGenerator = generateBulletinDraft
  ) {}

  public list() {
    return this.repository.list();
  }

  public createPendingGeneration(input: BulletinGenerationServiceInput, actor: BulletinActor) {
    return this.repository.createPendingGeneration({
      bulletinDate: getCurrentMexicoDate(),
      sourceText: input.sourceText,
      sourceUrls: input.sourceUrls,
      attachments: input.attachments,
      createdByUserId: actor.userId,
      createdByName: actor.displayName
    });
  }

  public processGeneration(bulletinId: string, actor: BulletinActor) {
    return runWithTenantContext(actor.organizationId, async () => {
      const claimed = await this.repository.claimPendingGeneration(bulletinId);
      if (!claimed) {
        return null;
      }

      try {
        const source = await this.repository.findGenerationInput(bulletinId);
        if (!source) {
          throw new AppError(404, "BULLETIN_NOT_FOUND", "El boletin no existe.");
        }

        const draft = await this.draftGenerator({
          ...source,
          organizationId: actor.organizationId,
          userId: actor.userId
        });
        return await this.repository.completeGeneration(bulletinId, draft);
      } catch (error) {
        const message = error instanceof AppError
          ? error.message
          : "No se pudo generar el borrador con OpenAI.";
        await this.repository.failGeneration(bulletinId, message);
        return null;
      }
    });
  }

  public async retryGeneration(bulletinId: string) {
    const bulletin = await this.repository.findById(bulletinId);
    if (!bulletin) {
      throw new AppError(404, "BULLETIN_NOT_FOUND", "El boletin no existe.");
    }
    if (bulletin.origin !== "GENERATED" || bulletin.generationStatus !== "FAILED") {
      throw new AppError(409, "BULLETIN_GENERATION_NOT_RETRYABLE", "Este boletin no necesita reintentar la generacion.");
    }

    return this.repository.retryGeneration(bulletinId);
  }

  public async update(bulletinId: string, payload: BulletinDraftInput) {
    const bulletin = await this.repository.findById(bulletinId);
    if (!bulletin) {
      throw new AppError(404, "BULLETIN_NOT_FOUND", "El boletin no existe.");
    }
    if (bulletin.generationStatus !== "READY") {
      throw new AppError(409, "BULLETIN_GENERATION_INCOMPLETE", "Espera a que termine la generacion antes de editar.");
    }

    return this.repository.updateDraft(bulletinId, payload);
  }

  public async approve(bulletinId: string, actor: BulletinActor) {
    const bulletin = await this.repository.findById(bulletinId);
    if (!bulletin) {
      throw new AppError(404, "BULLETIN_NOT_FOUND", "El boletin no existe.");
    }

    if (bulletin.origin === "UPLOADED") {
      throw new AppError(400, "BULLETIN_UPLOAD_ALREADY_APPROVED", "Los boletines cargados ya se consideran aprobados.");
    }
    if (bulletin.generationStatus !== "READY") {
      throw new AppError(409, "BULLETIN_GENERATION_INCOMPLETE", "Espera a que termine la generacion antes de aprobar.");
    }

    const exports = await renderBulletinExports(bulletin);
    return this.repository.approve(bulletinId, {
      approvedByUserId: actor.userId,
      approvedByName: actor.displayName,
      docxOriginalFileName: exports.docx.filename,
      docxFileMimeType: exports.docx.contentType,
      docxFileContent: exports.docx.buffer,
      pdfOriginalFileName: exports.pdf.filename,
      pdfFileMimeType: exports.pdf.contentType,
      pdfFileContent: exports.pdf.buffer
    });
  }

  public upload(payload: BulletinUploadWriteRecord, actor: BulletinActor) {
    return this.repository.uploadApproved({
      ...payload,
      createdByUserId: actor.userId,
      createdByName: actor.displayName
    });
  }

  public async download(bulletinId: string, format: "docx" | "pdf") {
    const document = await this.repository.findDocument(bulletinId, format);
    if (!document) {
      throw new AppError(
        404,
        "BULLETIN_DOCUMENT_NOT_FOUND",
        `El boletin no tiene un archivo ${format.toUpperCase()} disponible.`
      );
    }

    return document;
  }

  public delete(bulletinId: string) {
    return this.repository.delete(bulletinId);
  }
}
