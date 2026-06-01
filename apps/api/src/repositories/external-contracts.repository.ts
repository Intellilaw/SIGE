import { Buffer } from "node:buffer";

import { Prisma, type PrismaClient } from "@prisma/client";
import type { ExternalContract, ExternalContractDownloadFormat } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import {
  mapExternalContract,
  mapExternalContractGeneratedDocument,
  mapExternalContractInpc,
  mapExternalContractRenewal,
  mapExternalContractRenewalDocument
} from "./mappers";
import type {
  ExternalContractDocumentRecord,
  ExternalContractGeneratedDocumentRecord,
  ExternalContractGeneratedDocumentWriteRecord,
  ExternalContractInpcWriteRecord,
  ExternalContractRenewalDocumentRecord,
  ExternalContractRenewalDocumentUploadRecord,
  ExternalContractRenewalWriteRecord,
  ExternalContractsRepository,
  ExternalContractUpdateRecord,
  ExternalContractWriteRecord
} from "./types";

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeContractNumberPart(value?: string | null) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "CLIENTE";
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

const generatedDocumentMetadataSelect = {
  id: true,
  renewalId: true,
  templateId: true,
  templateTitle: true,
  originalFileName: true,
  fileMimeType: true,
  fileSizeBytes: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.ExternalContractGeneratedDocumentSelect;

const renewalDocumentMetadataSelect = {
  id: true,
  renewalId: true,
  documentType: true,
  originalFileName: true,
  fileMimeType: true,
  fileSizeBytes: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.ExternalContractRenewalDocumentSelect;

const renewalInclude = {
  orderBy: { sequence: "asc" },
  include: {
    documents: {
      orderBy: { createdAt: "desc" },
      select: renewalDocumentMetadataSelect
    }
  }
} satisfies Prisma.ExternalContractRenewalFindManyArgs;

function validateContractType(value: ExternalContract["contractType"]) {
  if (value !== "LEASE") {
    throw new AppError(400, "INVALID_EXTERNAL_CONTRACT_TYPE", "Por ahora solo se administran contratos de arrendamiento.");
  }
}

function normalizeStatus(value?: ExternalContract["status"] | null) {
  return value === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
}

function normalizeInpcPeriodKey(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    throw new AppError(400, "EXTERNAL_CONTRACT_RENEWAL_INPC_PERIOD_INVALID", "Los periodos INPC deben tener formato AAAA-MM.");
  }

  return normalized;
}

function hasRenewalContent(record: ExternalContractRenewalWriteRecord) {
  return Boolean(
    normalizeText(record.renewalDate)
    || normalizeText(record.leaseStartDate)
    || normalizeText(record.leaseEndDate)
    || record.monthlyRentMxn
    || record.rentIncreasePct
    || normalizeText(record.inpcBasePeriod)
    || normalizeText(record.inpcTargetPeriod)
    || normalizeText(record.notes)
  );
}

function normalizeRenewalRecords(
  contractId: string,
  organizationId: string,
  records?: ExternalContractRenewalWriteRecord[]
): Array<Prisma.ExternalContractRenewalCreateManyInput & { id?: string | null }> {
  return (records ?? [])
    .filter(hasRenewalContent)
    .map((record, index) => ({
      ...(normalizeNullableText(record.id) ? { id: normalizeNullableText(record.id) ?? undefined } : {}),
      organizationId,
      externalContractId: contractId,
      sequence: index + 1,
      renewalDate: normalizeDateKey(record.renewalDate),
      leaseStartDate: normalizeDateKey(record.leaseStartDate),
      leaseEndDate: normalizeDateKey(record.leaseEndDate),
      monthlyRentMxn: normalizeDecimal(record.monthlyRentMxn),
      rentIncreasePct: normalizeDecimal(record.rentIncreasePct),
      inpcBasePeriod: normalizeInpcPeriodKey(record.inpcBasePeriod),
      inpcTargetPeriod: normalizeInpcPeriodKey(record.inpcTargetPeriod),
      notes: normalizeNullableText(record.notes)
    }));
}

function normalizeInpcPeriodDate(value: string) {
  const normalized = normalizeText(value);
  if (!/^\d{4}-\d{2}-01$/.test(normalized)) {
    throw new AppError(400, "EXTERNAL_CONTRACT_INPC_PERIOD_INVALID", "El periodo INPC debe ser el primer dia del mes en formato AAAA-MM-01.");
  }

  return new Date(`${normalized}T12:00:00.000Z`);
}

function validateInpcWriteRecord(record: ExternalContractInpcWriteRecord) {
  if (!Number.isInteger(record.periodYear) || record.periodYear < 2025) {
    throw new AppError(400, "EXTERNAL_CONTRACT_INPC_YEAR_INVALID", "El anio del INPC debe ser 2025 o posterior.");
  }

  if (!Number.isInteger(record.periodMonth) || record.periodMonth < 1 || record.periodMonth > 12) {
    throw new AppError(400, "EXTERNAL_CONTRACT_INPC_MONTH_INVALID", "El mes del INPC debe estar entre 1 y 12.");
  }

  if (!Number.isFinite(record.value) || record.value <= 0) {
    throw new AppError(400, "EXTERNAL_CONTRACT_INPC_VALUE_INVALID", "El INPC debe ser un numero positivo.");
  }

  const periodDate = normalizeInpcPeriodDate(record.periodDate);
  const periodYear = periodDate.getUTCFullYear();
  const periodMonth = periodDate.getUTCMonth() + 1;
  if (periodYear !== record.periodYear || periodMonth !== record.periodMonth) {
    throw new AppError(400, "EXTERNAL_CONTRACT_INPC_PERIOD_MISMATCH", "El anio y mes del INPC no coinciden con la fecha del periodo.");
  }

  return periodDate;
}

export class PrismaExternalContractsRepository implements ExternalContractsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const records = await this.prisma.externalContract.findMany({
      where: { organizationId },
      include: {
        renewals: renewalInclude,
        generatedDocuments: {
          orderBy: { createdAt: "desc" },
          select: generatedDocumentMetadataSelect
        }
      },
      orderBy: [{ clientName: "asc" }, { contractNumber: "asc" }, { createdAt: "desc" }]
    });

    return records.map(mapExternalContract);
  }

  public async findById(contractId: string) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    return mapExternalContract(await this.findFullOrThrow(contractId, organizationId));
  }

  public async create(payload: ExternalContractWriteRecord) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    validateContractType(payload.contractType);
    const explicitContractNumber = normalizeText(payload.contractNumber);
    const originalFileName = normalizeText(payload.originalFileName);

    if (!originalFileName || !payload.fileContent) {
      throw new AppError(400, "EXTERNAL_CONTRACT_FILE_REQUIRED", "Carga el contrato del cliente en Word o PDF.");
    }

    const client = await this.findClientOrThrow(payload.clientId, organizationId);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const contractNumber = explicitContractNumber || await this.buildGeneratedContractNumber(organizationId, client.clientNumber);

      try {
        const record = await this.prisma.externalContract.create({
          data: {
            organizationId,
            contractNumber,
            title: normalizeText(payload.title) || contractNumber,
            contractType: "LEASE",
            status: normalizeStatus(payload.status),
            clientId: client.id,
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

        if (payload.renewals !== undefined) {
          await this.replaceRenewals(record.id, organizationId, payload.renewals);
        }

        return mapExternalContract(await this.findFullOrThrow(record.id, organizationId));
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          if (!explicitContractNumber && attempt === 0) {
            continue;
          }

          throw new AppError(409, "EXTERNAL_CONTRACT_NUMBER_EXISTS", "Ya existe un contrato externo con ese numero.");
        }

        throw error;
      }
    }

    throw new AppError(409, "EXTERNAL_CONTRACT_NUMBER_EXISTS", "No se pudo generar un numero de contrato disponible.");
  }

  public async update(contractId: string, payload: ExternalContractUpdateRecord) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    await this.findOrThrow(contractId, organizationId);

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
      const client = await this.findClientOrThrow(payload.clientId, organizationId);
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

      if (payload.renewals !== undefined) {
        await this.replaceRenewals(contractId, organizationId, payload.renewals);
      }

      return mapExternalContract(await this.findFullOrThrow(record.id, organizationId));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "EXTERNAL_CONTRACT_NUMBER_EXISTS", "Ya existe un contrato externo con ese numero.");
      }

      throw error;
    }
  }

  public async delete(contractId: string) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    await this.findOrThrow(contractId, organizationId);
    await this.prisma.externalContract.delete({ where: { id: contractId } });
  }

  public async findDocument(contractId: string): Promise<ExternalContractDocumentRecord | null> {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const record = await this.prisma.externalContract.findFirst({
      where: { id: contractId, organizationId },
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

  public async createGeneratedDocument(
    contractId: string,
    payload: ExternalContractGeneratedDocumentWriteRecord
  ) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    await this.findOrThrow(contractId, organizationId);
    const templateId = normalizeText(payload.templateId);
    const templateTitle = normalizeText(payload.templateTitle);
    const originalFileName = normalizeText(payload.originalFileName);
    const renewalId = normalizeNullableText(payload.renewalId);

    if (!templateId || !templateTitle || !originalFileName || !payload.fileContent) {
      throw new AppError(400, "EXTERNAL_CONTRACT_GENERATED_DOCUMENT_INVALID", "El formato generado no esta completo.");
    }

    if (renewalId) {
      const renewal = await this.prisma.externalContractRenewal.findFirst({
        where: {
          id: renewalId,
          organizationId,
          externalContractId: contractId
        },
        select: { id: true }
      });

      if (!renewal) {
        throw new AppError(404, "EXTERNAL_CONTRACT_RENEWAL_NOT_FOUND", "La renovacion seleccionada no existe para este contrato.");
      }
    }

    const record = await this.prisma.externalContractGeneratedDocument.create({
      data: {
        organizationId,
        externalContractId: contractId,
        renewalId,
        templateId,
        templateTitle,
        originalFileName,
        fileMimeType: normalizeNullableText(payload.fileMimeType),
        fileSizeBytes: payload.fileContent.byteLength,
        fileContent: toPrismaBytes(payload.fileContent) ?? new Uint8Array()
      }
    });

    return mapExternalContractGeneratedDocument(record);
  }

  public async findGeneratedDocument(
    contractId: string,
    documentId: string
  ): Promise<ExternalContractGeneratedDocumentRecord | null> {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const record = await this.prisma.externalContractGeneratedDocument.findFirst({
      where: {
        id: documentId,
        externalContractId: contractId,
        organizationId
      },
      select: {
        id: true,
        templateId: true,
        originalFileName: true,
        fileMimeType: true,
        fileContent: true,
        createdAt: true,
        externalContract: {
          select: {
            contractNumber: true,
            clientName: true
          }
        }
      }
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      contractNumber: record.externalContract.contractNumber,
      clientName: record.externalContract.clientName,
      templateId: record.templateId,
      originalFileName: record.originalFileName,
      fileMimeType: record.fileMimeType,
      fileContent: Buffer.from(record.fileContent),
      createdAt: record.createdAt.toISOString()
    };
  }

  public async uploadRenewalDocument(
    contractId: string,
    renewalId: string,
    payload: ExternalContractRenewalDocumentUploadRecord
  ) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    await this.findRenewalOrThrow(contractId, renewalId, organizationId);
    const originalFileName = normalizeText(payload.originalFileName);

    if (!originalFileName || !payload.fileContent) {
      throw new AppError(400, "EXTERNAL_CONTRACT_RENEWAL_DOCUMENT_INVALID", "El documento de renovacion no esta completo.");
    }

    const record = await this.prisma.externalContractRenewalDocument.create({
      data: {
        organizationId,
        externalContractId: contractId,
        renewalId,
        documentType: normalizeText(payload.documentType) || "RENEWAL_SUPPORT",
        originalFileName,
        fileMimeType: normalizeNullableText(payload.fileMimeType),
        fileSizeBytes: payload.fileContent.byteLength,
        fileContent: toPrismaBytes(payload.fileContent) ?? new Uint8Array()
      }
    });

    return mapExternalContractRenewalDocument(record);
  }

  public async findRenewalDocument(
    contractId: string,
    renewalId: string,
    documentId: string
  ): Promise<ExternalContractRenewalDocumentRecord | null> {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const record = await this.prisma.externalContractRenewalDocument.findFirst({
      where: {
        id: documentId,
        organizationId,
        externalContractId: contractId,
        renewalId
      },
      select: {
        id: true,
        originalFileName: true,
        fileMimeType: true,
        fileContent: true,
        externalContract: {
          select: {
            contractNumber: true
          }
        }
      }
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      contractNumber: record.externalContract.contractNumber,
      originalFileName: record.originalFileName,
      fileMimeType: record.fileMimeType,
      fileContent: Buffer.from(record.fileContent)
    };
  }

  public async listInpc() {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const records = await this.prisma.externalContractInpc.findMany({
      where: { organizationId },
      orderBy: [{ periodDate: "desc" }]
    });

    return records.map(mapExternalContractInpc);
  }

  public async listRenewals(contractId: string) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    await this.findOrThrow(contractId, organizationId);
    const records = await this.prisma.externalContractRenewal.findMany({
      where: { organizationId, externalContractId: contractId },
      orderBy: { sequence: "asc" },
      include: {
        documents: {
          orderBy: { createdAt: "desc" },
          select: renewalDocumentMetadataSelect
        }
      }
    });

    return records.map(mapExternalContractRenewal);
  }

  public async upsertInpc(records: ExternalContractInpcWriteRecord[]) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const record of records) {
      const periodDate = validateInpcWriteRecord(record);
      const value = new Prisma.Decimal(record.value);
      const source = normalizeText(record.source) || "BANXICO";
      const sourceSeries = normalizeText(record.sourceSeries) || "SP1";
      const where = {
        organizationId_periodYear_periodMonth: {
          organizationId,
          periodYear: record.periodYear,
          periodMonth: record.periodMonth
        }
      };
      const existing = await this.prisma.externalContractInpc.findUnique({
        where,
        select: {
          id: true,
          value: true,
          source: true,
          sourceSeries: true
        }
      });

      if (!existing) {
        await this.prisma.externalContractInpc.create({
          data: {
            organizationId,
            periodYear: record.periodYear,
            periodMonth: record.periodMonth,
            periodDate,
            value,
            source,
            sourceSeries,
            importedAt: new Date()
          }
        });
        imported += 1;
        continue;
      }

      const sameValue = existing.value.equals(value);
      const sameSource = existing.source === source && existing.sourceSeries === sourceSeries;
      if (sameValue && sameSource) {
        skipped += 1;
        continue;
      }

      await this.prisma.externalContractInpc.update({
        where,
        data: {
          periodDate,
          value,
          source,
          sourceSeries,
          importedAt: new Date()
        }
      });
      updated += 1;
    }

    const latest = (await this.listInpc())[0];
    return {
      imported,
      updated,
      skipped,
      total: records.length,
      latest
    };
  }

  private async findClientOrThrow(clientId: string, organizationId: string) {
    const normalizedClientId = normalizeText(clientId);
    if (!normalizedClientId) {
      throw new AppError(400, "EXTERNAL_CONTRACT_CLIENT_REQUIRED", "Selecciona un cliente del catalogo.");
    }

    const record = await this.prisma.client.findFirst({
      where: { id: normalizedClientId, organizationId, deletedAt: null },
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

  private async findOrThrow(contractId: string, organizationId: string) {
    const record = await this.prisma.externalContract.findFirst({
      where: { id: contractId, organizationId },
      select: { id: true }
    });

    if (!record) {
      throw new AppError(404, "EXTERNAL_CONTRACT_NOT_FOUND", "El contrato externo solicitado no existe.");
    }

    return record;
  }

  private async findRenewalOrThrow(contractId: string, renewalId: string, organizationId: string) {
    const record = await this.prisma.externalContractRenewal.findFirst({
      where: {
        id: renewalId,
        organizationId,
        externalContractId: contractId
      },
      select: { id: true }
    });

    if (!record) {
      throw new AppError(404, "EXTERNAL_CONTRACT_RENEWAL_NOT_FOUND", "La renovacion seleccionada no existe para este contrato.");
    }

    return record;
  }

  private async findFullOrThrow(contractId: string, organizationId: string) {
    const record = await this.prisma.externalContract.findFirst({
      where: { id: contractId, organizationId },
      include: {
        renewals: renewalInclude,
        generatedDocuments: {
          orderBy: { createdAt: "desc" },
          select: generatedDocumentMetadataSelect
        }
      }
    });

    if (!record) {
      throw new AppError(404, "EXTERNAL_CONTRACT_NOT_FOUND", "El contrato externo solicitado no existe.");
    }

    return record;
  }

  private async replaceRenewals(contractId: string, organizationId: string, records: ExternalContractRenewalWriteRecord[]) {
    const renewals = normalizeRenewalRecords(contractId, organizationId, records);
    const existingRenewals = await this.prisma.externalContractRenewal.findMany({
      where: { organizationId, externalContractId: contractId },
      select: { id: true }
    });
    const existingIds = new Set(existingRenewals.map((renewal) => renewal.id));
    const retainedIds = renewals
      .map((renewal) => renewal.id)
      .filter((id): id is string => Boolean(id && existingIds.has(id)));

    await this.prisma.$transaction(async (tx) => {
      await tx.externalContractRenewal.deleteMany({
        where: {
          organizationId,
          externalContractId: contractId,
          ...(retainedIds.length > 0 ? { id: { notIn: retainedIds } } : {})
        }
      });

      for (const renewal of renewals) {
        const { id, ...data } = renewal;
        if (id && existingIds.has(id)) {
          await tx.externalContractRenewal.update({
            where: { id },
            data
          });
          continue;
        }

        await tx.externalContractRenewal.create({
          data
        });
      }
    });
  }

  private async buildGeneratedContractNumber(organizationId: string, clientNumber: string) {
    const prefix = `ARR-${normalizeContractNumberPart(clientNumber)}`;
    const records = await this.prisma.externalContract.findMany({
      where: {
        organizationId,
        contractNumber: { startsWith: `${prefix}-` }
      },
      select: { contractNumber: true }
    });
    const next = records.reduce((max, record) => {
      const suffix = record.contractNumber.slice(prefix.length + 1);
      return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
    }, 0) + 1;

    return `${prefix}-${String(next).padStart(3, "0")}`;
  }
}
