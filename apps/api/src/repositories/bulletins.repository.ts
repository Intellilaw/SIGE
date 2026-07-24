import { Buffer } from "node:buffer";

import { Prisma, type PrismaClient } from "@prisma/client";
import type { Bulletin, BulletinBlock, BulletinDraftInput, BulletinPageCount } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import type {
  BulletinApprovalWriteRecord,
  BulletinDocumentRecord,
  BulletinDraftWriteRecord,
  BulletinGenerationInputRecord,
  BulletinPendingGenerationWriteRecord,
  BulletinsRepository,
  BulletinUploadWriteRecord
} from "./types";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME_TYPE = "application/pdf";

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function asStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.map((entry) => normalizeText(String(entry))).filter(Boolean) : [];
}

function asBulletinBlocks(value: Prisma.JsonValue): BulletinBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Prisma.JsonObject => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry, index) => ({
      id: normalizeText(typeof entry.id === "string" ? entry.id : "") || `block-${index + 1}`,
      headingEs: normalizeText(typeof entry.headingEs === "string" ? entry.headingEs : ""),
      headingEn: normalizeText(typeof entry.headingEn === "string" ? entry.headingEn : ""),
      bodyEs: normalizeText(typeof entry.bodyEs === "string" ? entry.bodyEs : ""),
      bodyEn: normalizeText(typeof entry.bodyEn === "string" ? entry.bodyEn : "")
    }))
    .filter((entry) => entry.bodyEs && entry.bodyEn);
}

function toPrismaBytes(content?: Buffer | null) {
  if (!content) {
    return null;
  }

  const bytes = new Uint8Array(content.byteLength);
  bytes.set(content);
  return bytes;
}

function toPrismaBlocks(blocks: BulletinBlock[]): Prisma.InputJsonValue {
  return blocks.map((block) => ({
    id: normalizeText(block.id),
    headingEs: normalizeText(block.headingEs),
    headingEn: normalizeText(block.headingEn),
    bodyEs: normalizeText(block.bodyEs),
    bodyEn: normalizeText(block.bodyEn)
  }));
}

function sanitizeFilenameSegment(value: string, fallback: string) {
  return (normalizeText(value) || fallback)
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 100)
    .trim() || fallback;
}

type BulletinRecord = Prisma.BulletinGetPayload<{
  include: {
    attachments: {
      select: {
        id: true;
        originalFileName: true;
        fileMimeType: true;
        fileSizeBytes: true;
        uploadedAt: true;
      };
    };
  };
}>;

function mapBulletin(record: BulletinRecord): Bulletin {
  return {
    id: record.id,
    organizationId: record.organizationId,
    origin: record.origin === "UPLOADED" ? "UPLOADED" : "GENERATED",
    status: record.status === "APPROVED" ? "APPROVED" : "DRAFT",
    generationStatus: ["PENDING", "PROCESSING", "FAILED"].includes(record.generationStatus)
      ? record.generationStatus as Bulletin["generationStatus"]
      : "READY",
    generationError: record.generationError,
    generationStartedAt: record.generationStartedAt?.toISOString() ?? null,
    generationCompletedAt: record.generationCompletedAt?.toISOString() ?? null,
    bulletinDate: record.bulletinDate.toISOString().slice(0, 10),
    titleEs: record.titleEs,
    titleEn: record.titleEn,
    pageCount: record.pageCount === 2 ? 2 : 1,
    twoPageReason: record.twoPageReason,
    blocks: asBulletinBlocks(record.blocks),
    sourceText: record.sourceText,
    sourceUrls: asStringArray(record.sourceUrls),
    attachments: record.attachments.map((attachment) => ({
      id: attachment.id,
      originalFileName: attachment.originalFileName,
      fileMimeType: attachment.fileMimeType,
      fileSizeBytes: attachment.fileSizeBytes,
      uploadedAt: attachment.uploadedAt.toISOString()
    })),
    hasDocx: Boolean(record.docxFileContent),
    hasPdf: Boolean(record.pdfFileContent),
    approvedAt: record.approvedAt?.toISOString() ?? null,
    approvedByUserId: record.approvedByUserId,
    approvedByName: record.approvedByName,
    createdByUserId: record.createdByUserId,
    createdByName: record.createdByName,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function normalizePageCount(value: BulletinPageCount) {
  return value === 2 ? 2 : 1;
}

export class PrismaBulletinsRepository implements BulletinsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    const records = await this.prisma.bulletin.findMany({
      where: { deletedAt: null },
      include: {
        attachments: {
          select: {
            id: true,
            originalFileName: true,
            fileMimeType: true,
            fileSizeBytes: true,
            uploadedAt: true
          },
          orderBy: { uploadedAt: "asc" }
        }
      },
      orderBy: [{ bulletinDate: "desc" }, { updatedAt: "desc" }]
    });

    return records.map(mapBulletin);
  }

  public async findById(bulletinId: string) {
    const record = await this.prisma.bulletin.findFirst({
      where: { id: bulletinId, deletedAt: null },
      include: {
        attachments: {
          select: {
            id: true,
            originalFileName: true,
            fileMimeType: true,
            fileSizeBytes: true,
            uploadedAt: true
          },
          orderBy: { uploadedAt: "asc" }
        }
      }
    });

    return record ? mapBulletin(record) : null;
  }

  public async createPendingGeneration(payload: BulletinPendingGenerationWriteRecord) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const record = await this.prisma.bulletin.create({
      data: {
        origin: "GENERATED",
        status: "DRAFT",
        generationStatus: "PENDING",
        bulletinDate: new Date(`${payload.bulletinDate}T00:00:00.000Z`),
        titleEs: "Borrador en preparacion",
        titleEn: "Draft in progress",
        pageCount: 1,
        blocks: [],
        sourceText: normalizeText(payload.sourceText) || null,
        sourceUrls: (payload.sourceUrls ?? []).map(normalizeText).filter(Boolean),
        createdByUserId: payload.createdByUserId ?? null,
        createdByName: normalizeText(payload.createdByName) || null,
        attachments: payload.attachments?.length
          ? {
              create: payload.attachments.map((attachment) => ({
                organizationId,
                originalFileName: normalizeText(attachment.originalFileName),
                fileMimeType: normalizeText(attachment.fileMimeType) || null,
                fileSizeBytes: attachment.fileContent.byteLength,
                fileContent: toPrismaBytes(attachment.fileContent) ?? new Uint8Array()
              }))
            }
          : undefined
      },
      include: {
        attachments: {
          select: {
            id: true,
            originalFileName: true,
            fileMimeType: true,
            fileSizeBytes: true,
            uploadedAt: true
          }
        }
      }
    });

    return mapBulletin(record);
  }

  public async claimPendingGeneration(bulletinId: string) {
    const result = await this.prisma.bulletin.updateMany({
      where: {
        id: bulletinId,
        deletedAt: null,
        generationStatus: "PENDING"
      },
      data: {
        generationStatus: "PROCESSING",
        generationError: null,
        generationStartedAt: new Date(),
        generationCompletedAt: null
      }
    });

    return result.count === 1;
  }

  public async findGenerationInput(bulletinId: string): Promise<BulletinGenerationInputRecord | null> {
    const record = await this.prisma.bulletin.findFirst({
      where: { id: bulletinId, deletedAt: null, origin: "GENERATED" },
      select: {
        sourceText: true,
        sourceUrls: true,
        attachments: {
          select: {
            originalFileName: true,
            fileMimeType: true,
            fileContent: true
          },
          orderBy: { uploadedAt: "asc" }
        }
      }
    });

    if (!record) {
      return null;
    }

    return {
      sourceText: record.sourceText,
      sourceUrls: asStringArray(record.sourceUrls),
      attachments: record.attachments.map((attachment) => ({
        originalFileName: attachment.originalFileName,
        fileMimeType: attachment.fileMimeType,
        fileContent: Buffer.from(attachment.fileContent)
      }))
    };
  }

  public async completeGeneration(bulletinId: string, payload: BulletinDraftInput) {
    await this.findActiveOrThrow(bulletinId);
    const record = await this.prisma.bulletin.update({
      where: { id: bulletinId },
      data: {
        status: "DRAFT",
        generationStatus: "READY",
        generationError: null,
        generationCompletedAt: new Date(),
        bulletinDate: new Date(`${payload.bulletinDate}T00:00:00.000Z`),
        titleEs: normalizeText(payload.titleEs),
        titleEn: normalizeText(payload.titleEn),
        pageCount: normalizePageCount(payload.pageCount),
        twoPageReason: normalizeText(payload.twoPageReason) || null,
        blocks: toPrismaBlocks(payload.blocks)
      },
      include: {
        attachments: {
          select: {
            id: true,
            originalFileName: true,
            fileMimeType: true,
            fileSizeBytes: true,
            uploadedAt: true
          }
        }
      }
    });

    return mapBulletin(record);
  }

  public async failGeneration(bulletinId: string, message: string) {
    await this.findActiveOrThrow(bulletinId);
    const record = await this.prisma.bulletin.update({
      where: { id: bulletinId },
      data: {
        generationStatus: "FAILED",
        generationError: normalizeText(message).slice(0, 2000) || "No se pudo generar el borrador.",
        generationCompletedAt: new Date()
      },
      include: {
        attachments: {
          select: {
            id: true,
            originalFileName: true,
            fileMimeType: true,
            fileSizeBytes: true,
            uploadedAt: true
          }
        }
      }
    });

    return mapBulletin(record);
  }

  public async retryGeneration(bulletinId: string) {
    await this.findActiveOrThrow(bulletinId);
    const record = await this.prisma.bulletin.update({
      where: { id: bulletinId },
      data: {
        status: "DRAFT",
        generationStatus: "PENDING",
        generationError: null,
        generationStartedAt: null,
        generationCompletedAt: null
      },
      include: {
        attachments: {
          select: {
            id: true,
            originalFileName: true,
            fileMimeType: true,
            fileSizeBytes: true,
            uploadedAt: true
          }
        }
      }
    });

    return mapBulletin(record);
  }

  public async updateDraft(bulletinId: string, payload: BulletinDraftWriteRecord) {
    await this.findActiveOrThrow(bulletinId);
    const record = await this.prisma.bulletin.update({
      where: { id: bulletinId },
      data: {
        status: "DRAFT",
        generationStatus: "READY",
        generationError: null,
        bulletinDate: new Date(`${payload.bulletinDate}T00:00:00.000Z`),
        titleEs: normalizeText(payload.titleEs),
        titleEn: normalizeText(payload.titleEn),
        pageCount: normalizePageCount(payload.pageCount),
        twoPageReason: normalizeText(payload.twoPageReason) || null,
        blocks: toPrismaBlocks(payload.blocks),
        docxOriginalFileName: null,
        docxFileMimeType: null,
        docxFileSizeBytes: null,
        docxFileContent: null,
        pdfOriginalFileName: null,
        pdfFileMimeType: null,
        pdfFileSizeBytes: null,
        pdfFileContent: null,
        approvedAt: null,
        approvedByUserId: null,
        approvedByName: null
      },
      include: {
        attachments: {
          select: {
            id: true,
            originalFileName: true,
            fileMimeType: true,
            fileSizeBytes: true,
            uploadedAt: true
          }
        }
      }
    });

    return mapBulletin(record);
  }

  public async approve(bulletinId: string, payload: BulletinApprovalWriteRecord) {
    await this.findActiveOrThrow(bulletinId);
    const record = await this.prisma.bulletin.update({
      where: { id: bulletinId },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedByUserId: payload.approvedByUserId ?? null,
        approvedByName: normalizeText(payload.approvedByName) || null,
        docxOriginalFileName: payload.docxOriginalFileName,
        docxFileMimeType: payload.docxFileMimeType,
        docxFileSizeBytes: payload.docxFileContent.byteLength,
        docxFileContent: toPrismaBytes(payload.docxFileContent),
        pdfOriginalFileName: payload.pdfOriginalFileName,
        pdfFileMimeType: payload.pdfFileMimeType,
        pdfFileSizeBytes: payload.pdfFileContent.byteLength,
        pdfFileContent: toPrismaBytes(payload.pdfFileContent)
      },
      include: {
        attachments: {
          select: {
            id: true,
            originalFileName: true,
            fileMimeType: true,
            fileSizeBytes: true,
            uploadedAt: true
          }
        }
      }
    });

    return mapBulletin(record);
  }

  public async uploadApproved(payload: BulletinUploadWriteRecord) {
    const title = normalizeText(payload.title);
    const docxName = payload.docx
      ? payload.docx.originalFileName || `${sanitizeFilenameSegment(title, "Boletin")}.docx`
      : null;
    const pdfName = payload.pdf
      ? payload.pdf.originalFileName || `${sanitizeFilenameSegment(title, "Boletin")}.pdf`
      : null;
    const record = await this.prisma.bulletin.create({
      data: {
        origin: "UPLOADED",
        status: "APPROVED",
        generationStatus: "READY",
        generationCompletedAt: new Date(),
        bulletinDate: new Date(`${payload.bulletinDate}T00:00:00.000Z`),
        titleEs: title,
        titleEn: title,
        pageCount: 1,
        blocks: [],
        approvedAt: new Date(),
        approvedByUserId: payload.createdByUserId ?? null,
        approvedByName: normalizeText(payload.createdByName) || null,
        createdByUserId: payload.createdByUserId ?? null,
        createdByName: normalizeText(payload.createdByName) || null,
        docxOriginalFileName: docxName,
        docxFileMimeType: payload.docx ? DOCX_MIME_TYPE : null,
        docxFileSizeBytes: payload.docx?.fileContent.byteLength ?? null,
        docxFileContent: toPrismaBytes(payload.docx?.fileContent),
        pdfOriginalFileName: pdfName,
        pdfFileMimeType: payload.pdf ? PDF_MIME_TYPE : null,
        pdfFileSizeBytes: payload.pdf?.fileContent.byteLength ?? null,
        pdfFileContent: toPrismaBytes(payload.pdf?.fileContent)
      },
      include: {
        attachments: {
          select: {
            id: true,
            originalFileName: true,
            fileMimeType: true,
            fileSizeBytes: true,
            uploadedAt: true
          }
        }
      }
    });

    return mapBulletin(record);
  }

  public async findDocument(bulletinId: string, format: "docx" | "pdf"): Promise<BulletinDocumentRecord | null> {
    const record = await this.prisma.bulletin.findFirst({
      where: { id: bulletinId, deletedAt: null, status: "APPROVED" },
      select: {
        titleEs: true,
        docxOriginalFileName: true,
        docxFileMimeType: true,
        docxFileContent: true,
        pdfOriginalFileName: true,
        pdfFileMimeType: true,
        pdfFileContent: true
      }
    });

    if (!record) {
      return null;
    }

    if (format === "docx" && record.docxFileContent) {
      return {
        originalFileName: record.docxOriginalFileName ?? `${sanitizeFilenameSegment(record.titleEs, "Boletin")}.docx`,
        fileMimeType: record.docxFileMimeType ?? DOCX_MIME_TYPE,
        fileContent: Buffer.from(record.docxFileContent)
      };
    }

    if (format === "pdf" && record.pdfFileContent) {
      return {
        originalFileName: record.pdfOriginalFileName ?? `${sanitizeFilenameSegment(record.titleEs, "Boletin")}.pdf`,
        fileMimeType: record.pdfFileMimeType ?? PDF_MIME_TYPE,
        fileContent: Buffer.from(record.pdfFileContent)
      };
    }

    return null;
  }

  public async delete(bulletinId: string) {
    await this.findActiveOrThrow(bulletinId);
    await this.prisma.bulletin.update({
      where: { id: bulletinId },
      data: { deletedAt: new Date() }
    });
  }

  private async findActiveOrThrow(bulletinId: string) {
    const record = await this.prisma.bulletin.findFirst({
      where: { id: bulletinId, deletedAt: null },
      select: { id: true }
    });

    if (!record) {
      throw new AppError(404, "BULLETIN_NOT_FOUND", "El boletin no existe.");
    }

    return record;
  }
}
