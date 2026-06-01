import { Buffer } from "node:buffer";

import { Prisma, type PrismaClient } from "@prisma/client";
import type { ExternalContract, ExternalContractDownloadFormat } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { mapExternalContract } from "./mappers";
import type {
  ExternalContractDocumentRecord,
  ExternalContractsRepository,
  ExternalContractUpdateRecord,
  ExternalContractWriteRecord
} from "./types";

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeNullableText(value?: string | null) {
  return normalizeText(value) || null;
}

function normalizeDateKey(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new AppError(400, "EXTERNAL_CONTRACT_DATE_INVALID", "Las fechas deben tener formato AAAA-MM-DD.");
  }

  return new Date(`${normalized}T12:00:00.000Z`);
}

function normalizeDecimal(value?: number | null) {
  if (value === null || value === undefined || value === 0) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new AppError(400, "EXTERNAL_CONTRACT_AMOUNT_INVALID", "Los montos y porcentajes deben ser numeros positivos.");
  }

  return new Prisma.Decimal(value);
}

function toPrismaBytes(content?: Buffer | null) {
  if (!content) {
    return null;
  }

  const bytes = new Uint8Array(content.byteLength);
  bytes.set(content);
  return bytes;
}

function inferExternalContractFormat(originalFileName?: string | null, fileMimeType?: string | null): ExternalContractDownloadFormat | null {
  const normalizedMimeType = normalizeText(fileMimeType).toLowerCase();
  const normalizedFileName = normalizeText(originalFileName).toLowerCase();

  if (normalizedMimeType.includes("pdf") || normalizedFileName.endsWith(".pdf")) {
    return "pdf";
  }

  if (
    normalizedMimeType.includes("wordprocessingml.document")
    || normalizedMimeType.includes("msword")
    || normalizedFileName.endsWith(".docx")
    || normalizedFileName.endsWith(".doc")
  ) {
    return "docx";
  }

  return null;
}

function validateContractType(value: ExternalContract["contractType"]) {
  if (value !== "LEASE") {
    throw new AppError(400, "INVALID_EXTERNAL_CONTRACT_TYPE", "Por ahora solo se administran contratos de arrendamiento.");
  }
}

function normalizeStatus(value?: ExternalContract["status"] | null) {
  return value === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
}

export class PrismaExternalContractsRepository implements ExternalContractsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    const records = await this.prisma.externalContract.findMany({
      orderBy: [{ clientName: "asc" }, { contractNumber: "asc" }, { createdAt: "desc" }]
    });

    return records.map(mapExternalContract);
  }

  public async create(payload: ExternalContractWriteRecord) {
    validateContractType(payload.contractType);
    const contractNumber = normalizeText(payload.contractNumber);
    const originalFileName = normalizeText(payload.originalFileName);

    if (!contractNumber) {
      throw new AppError(400, "EXTERNAL_CONTRACT_NUMBER_REQUIRED", "El numero de contrato es obligatorio.");
    }

    if (!originalFileName || !payload.fileContent) {
      throw new AppError(400, "EXTERNAL_CONTRACT_FILE_REQUIRED", "Carga el contrato del cliente en Word o PDF.");
    }

    const client = await this.findClientOrThrow(payload.clientId);

    try {
      const record = await this.prisma.externalContract.create({
        data: {
          contractNumber,
          title: normalizeText(payload.title) || contractNumber,
          contractType: "LEASE",
          status: normalizeStatus(payload.status),
          client: { connect: { id: client.id } },
          clientNumber: client.clientNumber,
          clientName: client.name,
          propertyAddress: normalizeNullableText(payload.propertyAddress),
          landlordName: normalizeNullableText(payload.landlordName),
          tenantName: normalizeNullableText(payload.tenantName),
          leaseStartDate: normalizeDateKey(payload.leaseStartDate),
          leaseEndDate: normalizeDateKey(payload.leaseEndDate),
          renewalDate: normalizeDateKey(payload.renewalDate),
          rentIncreaseDate: normalizeDateKey(payload.rentIncreaseDate),
          monthlyRentMxn: normalizeDecimal(payload.monthlyRentMxn),
          rentIncreasePct: normalizeDecimal(payload.rentIncreasePct),
          originalFileName,
          fileMimeType: normalizeNullableText(payload.fileMimeType),
          fileSizeBytes: payload.fileSizeBytes ?? null,
          fileContent: toPrismaBytes(payload.fileContent),
          notes: normalizeNullableText(payload.notes)
        }
      });

      return mapExternalContract(record);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "EXTERNAL_CONTRACT_NUMBER_EXISTS", "Ya existe un contrato externo con ese numero.");
      }

      throw error;
    }
  }

  public async update(contractId: string, payload: ExternalContractUpdateRecord) {
    await this.findOrThrow(contractId);

    const data: Prisma.ExternalContractUpdateInput = {};

    if (payload.contractNumber !== undefined) {
      const contractNumber = normalizeText(payload.contractNumber);
      if (!contractNumber) {
        throw new AppError(400, "EXTERNAL_CONTRACT_NUMBER_REQUIRED", "El numero de contrato es obligatorio.");
      }
      data.contractNumber = contractNumber;
    }

    if (payload.title !== undefined) {
      data.title = normalizeText(payload.title) || String(data.contractNumber ?? "");
    }

    if (payload.status !== undefined) {
      data.status = normalizeStatus(payload.status);
    }

    if (payload.clientId !== undefined) {
      const client = await this.findClientOrThrow(payload.clientId);
      data.client = { connect: { id: client.id } };
      data.clientNumber = client.clientNumber;
      data.clientName = client.name;
    }

    if (payload.propertyAddress !== undefined) {
      data.propertyAddress = normalizeNullableText(payload.propertyAddress);
    }

    if (payload.landlordName !== undefined) {
      data.landlordName = normalizeNullableText(payload.landlordName);
    }

    if (payload.tenantName !== undefined) {
      data.tenantName = normalizeNullableText(payload.tenantName);
    }

    if (payload.leaseStartDate !== undefined) {
      data.leaseStartDate = normalizeDateKey(payload.leaseStartDate);
    }

    if (payload.leaseEndDate !== undefined) {
      data.leaseEndDate = normalizeDateKey(payload.leaseEndDate);
    }

    if (payload.renewalDate !== undefined) {
      data.renewalDate = normalizeDateKey(payload.renewalDate);
    }

    if (payload.rentIncreaseDate !== undefined) {
      data.rentIncreaseDate = normalizeDateKey(payload.rentIncreaseDate);
    }

    if (payload.monthlyRentMxn !== undefined) {
      data.monthlyRentMxn = normalizeDecimal(payload.monthlyRentMxn);
    }

    if (payload.rentIncreasePct !== undefined) {
      data.rentIncreasePct = normalizeDecimal(payload.rentIncreasePct);
    }

    if (payload.notes !== undefined) {
      data.notes = normalizeNullableText(payload.notes);
    }

    if (payload.fileContent) {
      const originalFileName = normalizeText(payload.originalFileName);
      if (!originalFileName) {
        throw new AppError(400, "EXTERNAL_CONTRACT_FILE_NAME_REQUIRED", "El archivo debe incluir nombre original.");
      }

      data.originalFileName = originalFileName;
      data.fileMimeType = normalizeNullableText(payload.fileMimeType);
      data.fileSizeBytes = payload.fileSizeBytes ?? payload.fileContent.byteLength;
      data.fileContent = toPrismaBytes(payload.fileContent);
    }

    try {
      const record = await this.prisma.externalContract.update({
        where: { id: contractId },
        data
      });

      return mapExternalContract(record);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "EXTERNAL_CONTRACT_NUMBER_EXISTS", "Ya existe un contrato externo con ese numero.");
      }

      throw error;
    }
  }

  public async delete(contractId: string) {
    await this.findOrThrow(contractId);
    await this.prisma.externalContract.delete({ where: { id: contractId } });
  }

  public async findDocument(contractId: string): Promise<ExternalContractDocumentRecord | null> {
    const record = await this.prisma.externalContract.findUnique({
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
      format: inferExternalContractFormat(record.originalFileName, record.fileMimeType) ?? "docx",
      fileContent: Buffer.from(record.fileContent)
    };
  }

  private async findClientOrThrow(clientId: string) {
    const normalizedClientId = normalizeText(clientId);
    if (!normalizedClientId) {
      throw new AppError(400, "EXTERNAL_CONTRACT_CLIENT_REQUIRED", "Selecciona un cliente del catalogo.");
    }

    const record = await this.prisma.client.findFirst({
      where: { id: normalizedClientId, deletedAt: null },
      select: {
        id: true,
        clientNumber: true,
        name: true
      }
    });

    if (!record) {
      throw new AppError(404, "EXTERNAL_CONTRACT_CLIENT_NOT_FOUND", "El cliente seleccionado no existe en esta empresa.");
    }

    return record;
  }

  private async findOrThrow(contractId: string) {
    const record = await this.prisma.externalContract.findUnique({
      where: { id: contractId },
      select: { id: true }
    });

    if (!record) {
      throw new AppError(404, "EXTERNAL_CONTRACT_NOT_FOUND", "El contrato externo solicitado no existe.");
    }

    return record;
  }
}
