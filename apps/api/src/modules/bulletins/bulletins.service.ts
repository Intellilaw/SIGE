import type { BulletinDraftInput } from "@sige/contracts";

import { AppError } from "../../core/errors/app-error";
import type {
  BulletinAttachmentWriteRecord,
  BulletinsRepository,
  BulletinUploadWriteRecord
} from "../../repositories/types";
import { renderBulletinExports } from "./bulletin-export";
import { generateBulletinDraft } from "./bulletin-generator";

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
  public constructor(private readonly repository: BulletinsRepository) {}

  public list() {
    return this.repository.list();
  }

  public async generate(input: BulletinGenerationServiceInput, actor: BulletinActor) {
    const draft = await generateBulletinDraft({
      ...input,
      organizationId: actor.organizationId,
      userId: actor.userId
    });

    return this.repository.createDraft({
      ...draft,
      sourceText: input.sourceText,
      sourceUrls: input.sourceUrls,
      attachments: input.attachments,
      createdByUserId: actor.userId,
      createdByName: actor.displayName
    });
  }

  public update(bulletinId: string, payload: BulletinDraftInput) {
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
