import { Buffer } from "node:buffer";

import { Prisma, type PrismaClient } from "@prisma/client";
import type { InternalContract } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { mapInternalContract, mapInternalContractCollaborator, mapInternalContractTemplate } from "./mappers";
import type {
  InternalContractsRepository,
  InternalContractTemplateWriteRecord,
  InternalContractWriteRecord
} from "./types";

const LABOR_FILE_CONTRACT_DOCUMENT_ID_PREFIX = "labor-file-document:";
const LABOR_FILE_CONTRACT_DOCUMENT_TYPES = ["EMPLOYMENT_CONTRACT", "ADDENDUM"] as const;

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function validateContractType(value: InternalContract["contractType"]) {
  if (value !== "PROFESSIONAL_SERVICES" && value !== "LABOR") {
    throw new AppError(400, "INVALID_INTERNAL_CONTRACT_TYPE", "Tipo de contrato interno invalido.");
  }
}

function validateDocumentKind(value: InternalContract["documentKind"]) {
  if (value !== "CONTRACT" && value !== "ADDENDUM") {
    throw new AppError(400, "INVALID_INTERNAL_CONTRACT_DOCUMENT_KIND", "Tipo de documento invalido.");
  }
}

function normalizeMilestones(milestones: InternalContract["paymentMilestones"]) {
  return milestones
    .map((milestone, index) => {
      const dueDate = normalizeText(milestone.dueDate);
      const notes = normalizeText(milestone.notes);
      const amountMxn = Number(milestone.amountMxn);
      const normalized: Record<string, string | number> = {
        id: milestone.id || `milestone-${index + 1}`,
        label: normalizeText(milestone.label || dueDate || `Hito ${index + 1}`)
      };

      if (dueDate) {
        normalized.dueDate = dueDate;
      }

      if (Number.isFinite(amountMxn) && amountMxn > 0) {
        normalized.amountMxn = amountMxn;
      }

      if (notes) {
        normalized.notes = notes;
      }

      return normalized;
    })
    .filter((milestone) => milestone.label || milestone.dueDate || milestone.notes || milestone.amountMxn);
}

function toPrismaBytes(content?: Buffer | null) {
  if (!content) {
    return null;
  }

  const bytes = new Uint8Array(content.byteLength);
  bytes.set(content);
  return bytes;
}

function normalizeIdentifierSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function parseLaborFileDocumentContractId(contractId: string) {
  const normalized = contractId.includes("%") ? decodeURIComponent(contractId) : contractId;
  return normalized.startsWith(LABOR_FILE_CONTRACT_DOCUMENT_ID_PREFIX)
    ? normalized.slice(LABOR_FILE_CONTRACT_DOCUMENT_ID_PREFIX.length)
    : null;
}

function buildLaborFileContractNumber(record: {
  id: string;
  documentType: string;
  uploadedAt: Date;
  laborFile: {
    employeeName: string;
    employeeUsername: string;
    employeeShortName: string | null;
  };
}) {
  const documentKind = record.documentType === "ADDENDUM" ? "ADD" : "LAB";
  const collaborator = normalizeIdentifierSegment(
    record.laborFile.employeeShortName || record.laborFile.employeeUsername || record.laborFile.employeeName || "COLABORADOR"
  );
  const uploadedDate = record.uploadedAt.toISOString().slice(0, 10).replace(/-/g, "");
  const serial = record.id.slice(0, 8).toUpperCase();

  return `EXP-${documentKind}-${collaborator}-${uploadedDate}-${serial}`;
}

function mapLaborFileDocumentToInternalContract(record: {
  id: string;
  documentType: string;
  originalFileName: string;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  laborFile: {
    employeeName: string;
    employeeUsername: string;
    employeeShortName: string | null;
  };
}): InternalContract {
  return {
    id: `${LABOR_FILE_CONTRACT_DOCUMENT_ID_PREFIX}${record.id}`,
    contractNumber: buildLaborFileContractNumber(record),
    contractType: "LABOR",
    documentKind: record.documentType === "ADDENDUM" ? "ADDENDUM" : "CONTRACT",
    collaboratorName: record.laborFile.employeeName,
    originalFileName: record.originalFileName,
    fileMimeType: record.fileMimeType ?? undefined,
    fileSizeBytes: record.fileSizeBytes ?? undefined,
    paymentMilestones: [],
    notes: "Origen: Expedientes Laborales.",
    createdAt: record.uploadedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export class PrismaInternalContractsRepository implements InternalContractsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    const [records, laborFileDocuments] = await Promise.all([
      this.prisma.internalContract.findMany({
        orderBy: [{ createdAt: "desc" }, { contractNumber: "asc" }]
      }),
      this.prisma.laborFileDocument.findMany({
        where: {
          documentType: { in: [...LABOR_FILE_CONTRACT_DOCUMENT_TYPES] }
        },
        orderBy: [{ uploadedAt: "desc" }, { originalFileName: "asc" }],
        select: {
          id: true,
          documentType: true,
          originalFileName: true,
          fileMimeType: true,
          fileSizeBytes: true,
          uploadedAt: true,
          createdAt: true,
          updatedAt: true,
          laborFile: {
            select: {
              employeeName: true,
              employeeUsername: true,
              employeeShortName: true
            }
          }
        }
      })
    ]);

    return [
      ...records.map(mapInternalContract),
      ...laborFileDocuments.map(mapLaborFileDocumentToInternalContract)
    ];
  }

  public async create(payload: InternalContractWriteRecord) {
    const contractNumber = normalizeText(payload.contractNumber);
    if (!contractNumber) {
      throw new AppError(400, "INTERNAL_CONTRACT_NUMBER_REQUIRED", "El numero de contrato es obligatorio.");
    }

    validateContractType(payload.contractType);
    validateDocumentKind(payload.documentKind);

    const baseData = await this.buildScopedData(payload);

    try {
      const record = await this.prisma.internalContract.create({
        data: {
          ...baseData,
          contractNumber,
          contractType: payload.contractType,
          documentKind: payload.documentKind,
          originalFileName: normalizeText(payload.originalFileName) || null,
          fileMimeType: normalizeText(payload.fileMimeType) || null,
          fileSizeBytes: payload.fileSizeBytes ?? null,
          fileContent: toPrismaBytes(payload.fileContent),
          paymentMilestones: normalizeMilestones(payload.paymentMilestones),
          notes: normalizeText(payload.notes) || null
        }
      });

      return mapInternalContract(record);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "INTERNAL_CONTRACT_NUMBER_EXISTS", "Ya existe un contrato con ese numero.");
      }

      throw error;
    }
  }

  public async delete(contractId: string) {
    if (parseLaborFileDocumentContractId(contractId)) {
      throw new AppError(
        400,
        "LABOR_FILE_CONTRACT_DELETE_FROM_LABOR_FILES",
        "Este contrato viene de Expedientes Laborales. Borralo desde el expediente laboral del trabajador."
      );
    }

    await this.findOrThrow(contractId);
    await this.prisma.internalContract.delete({ where: { id: contractId } });
  }

  public async findDocument(contractId: string) {
    const laborFileDocumentId = parseLaborFileDocumentContractId(contractId);
    if (laborFileDocumentId) {
      return this.findLaborFileContractDocument(laborFileDocumentId);
    }

    const record = await this.prisma.internalContract.findUnique({
      where: { id: contractId },
      select: {
        contractNumber: true,
        originalFileName: true,
        fileMimeType: true,
        fileContent: true
      }
    });

    if (!record?.fileContent || !record.originalFileName) {
      return null;
    }

    return {
      contractNumber: record.contractNumber,
      originalFileName: record.originalFileName,
      fileMimeType: record.fileMimeType,
      fileContent: Buffer.from(record.fileContent)
    };
  }

  private async findLaborFileContractDocument(documentId: string) {
    const record = await this.prisma.laborFileDocument.findFirst({
      where: {
        id: documentId,
        documentType: { in: [...LABOR_FILE_CONTRACT_DOCUMENT_TYPES] }
      },
      select: {
        id: true,
        documentType: true,
        originalFileName: true,
        fileMimeType: true,
        fileContent: true,
        uploadedAt: true,
        laborFile: {
          select: {
            employeeName: true,
            employeeUsername: true,
            employeeShortName: true
          }
        }
      }
    });

    if (!record?.fileContent || !record.originalFileName) {
      return null;
    }

    return {
      contractNumber: buildLaborFileContractNumber(record),
      originalFileName: record.originalFileName,
      fileMimeType: record.fileMimeType,
      fileContent: Buffer.from(record.fileContent)
    };
  }

  public async listCollaborators() {
    const records = await this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: [{ displayName: "asc" }, { username: "asc" }],
      select: {
        id: true,
        displayName: true,
        username: true,
        shortName: true,
        team: true
      }
    });

    return records.map(mapInternalContractCollaborator);
  }

  public async listTemplates() {
    const records = await this.prisma.internalContractTemplate.findMany({
      orderBy: [{ createdAt: "desc" }, { title: "asc" }]
    });

    return records.map(mapInternalContractTemplate);
  }

  public async createTemplate(payload: InternalContractTemplateWriteRecord) {
    const title = normalizeText(payload.title);
    const originalFileName = normalizeText(payload.originalFileName);

    if (!title) {
      throw new AppError(400, "INTERNAL_CONTRACT_TEMPLATE_TITLE_REQUIRED", "El nombre del machote es obligatorio.");
    }

    if (!originalFileName || !payload.fileContent) {
      throw new AppError(400, "INTERNAL_CONTRACT_TEMPLATE_FILE_REQUIRED", "Carga el archivo del contrato machote.");
    }

    const record = await this.prisma.internalContractTemplate.create({
      data: {
        title,
        originalFileName,
        fileMimeType: normalizeText(payload.fileMimeType) || null,
        fileSizeBytes: payload.fileSizeBytes ?? null,
        fileContent: toPrismaBytes(payload.fileContent) ?? new Uint8Array(),
        notes: normalizeText(payload.notes) || null
      }
    });

    return mapInternalContractTemplate(record);
  }

  public async deleteTemplate(templateId: string) {
    await this.findTemplateOrThrow(templateId);
    await this.prisma.internalContractTemplate.delete({ where: { id: templateId } });
  }

  public async findTemplateDocument(templateId: string) {
    const record = await this.prisma.internalContractTemplate.findUnique({
      where: { id: templateId },
      select: {
        title: true,
        originalFileName: true,
        fileMimeType: true,
        fileContent: true
      }
    });

    if (!record?.fileContent || !record.originalFileName) {
      return null;
    }

    return {
      title: record.title,
      originalFileName: record.originalFileName,
      fileMimeType: record.fileMimeType,
      fileContent: Buffer.from(record.fileContent)
    };
  }

  private async buildScopedData(payload: InternalContractWriteRecord) {
    if (payload.contractType === "PROFESSIONAL_SERVICES") {
      const clientId = normalizeText(payload.clientId);
      if (!clientId) {
        throw new AppError(400, "INTERNAL_CONTRACT_CLIENT_REQUIRED", "Selecciona un cliente del catalogo.");
      }

      const client = await this.prisma.client.findFirst({
        where: { id: clientId, deletedAt: null },
        select: { id: true, clientNumber: true, name: true }
      });

      if (!client) {
        throw new AppError(404, "INTERNAL_CONTRACT_CLIENT_NOT_FOUND", "El cliente seleccionado no existe.");
      }

      return {
        client: { connect: { id: client.id } },
        clientNumber: client.clientNumber,
        clientName: client.name,
        collaboratorName: null
      };
    }

    const collaboratorName = normalizeText(payload.collaboratorName);
    if (!collaboratorName) {
      throw new AppError(400, "INTERNAL_CONTRACT_COLLABORATOR_REQUIRED", "Selecciona un colaborador interno.");
    }

    return {
      clientId: null,
      clientNumber: null,
      clientName: null,
      collaboratorName
    };
  }

  private async findOrThrow(contractId: string) {
    const record = await this.prisma.internalContract.findUnique({
      where: { id: contractId },
      select: { id: true }
    });

    if (!record) {
      throw new AppError(404, "INTERNAL_CONTRACT_NOT_FOUND", "El contrato solicitado no existe.");
    }

    return record;
  }

  private async findTemplateOrThrow(templateId: string) {
    const record = await this.prisma.internalContractTemplate.findUnique({
      where: { id: templateId },
      select: { id: true }
    });

    if (!record) {
      throw new AppError(404, "INTERNAL_CONTRACT_TEMPLATE_NOT_FOUND", "El contrato machote solicitado no existe.");
    }

    return record;
  }
}
