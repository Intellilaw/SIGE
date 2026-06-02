import type {
  ExternalContractsRepository,
  ExternalContractRenewalWriteRecord,
  ExternalContractRenewalDocumentUploadRecord,
  ExternalContractUpdateRecord,
  ExternalContractWriteRecord
} from "../../repositories/types";
import type { ExternalContract, ExternalContractGeneratedDocument, ExternalContractRenewal } from "@sige/contracts";
import { AppError } from "../../core/errors/app-error";
import { syncExternalContractInpc } from "./external-contract-inpc";
import { renderRentUpdateFormat } from "./external-contract-rent-update-format";

export interface ExternalContractRentUpdateFormatInput {
  renewalId?: string | null;
  documentDate?: string | null;
  effectiveDate?: string | null;
  previousRentMxn?: number | null;
  inpcBasePeriod?: string | null;
  inpcTargetPeriod?: string | null;
  useRoundedRent?: boolean | null;
  roundedRentMxn?: number | null;
}

export interface ExternalContractRentUpdateFormatResult {
  wordDocument: ExternalContractGeneratedDocument;
  pdfDocument: ExternalContractGeneratedDocument;
}

function renewalToWriteRecord(renewal: ExternalContractRenewal): ExternalContractRenewalWriteRecord {
  return {
    id: renewal.id,
    documentKind: renewal.documentKind,
    renewalDate: renewal.renewalDate ?? null,
    leaseStartDate: renewal.leaseStartDate ?? null,
    leaseEndDate: renewal.leaseEndDate ?? null,
    monthlyRentMxn: renewal.monthlyRentMxn ?? null,
    rentIncreasePct: renewal.rentIncreasePct ?? null,
    inpcBasePeriod: renewal.inpcBasePeriod ?? null,
    inpcTargetPeriod: renewal.inpcTargetPeriod ?? null,
    notes: renewal.notes ?? null
  };
}

function latestRenewal(contract: ExternalContract) {
  return [...contract.renewals].sort((left, right) => right.sequence - left.sequence)[0];
}

export class ExternalContractsService {
  public constructor(private readonly repository: ExternalContractsRepository) {}

  public list() {
    return this.repository.list();
  }

  public create(payload: ExternalContractWriteRecord) {
    return this.repository.create(payload);
  }

  public update(contractId: string, payload: ExternalContractUpdateRecord) {
    return this.repository.update(contractId, payload);
  }

  public delete(contractId: string) {
    return this.repository.delete(contractId);
  }

  public findDocument(contractId: string) {
    return this.repository.findDocument(contractId);
  }

  public async generateRentUpdateFormat(
    contractId: string,
    payload: ExternalContractRentUpdateFormatInput
  ): Promise<ExternalContractRentUpdateFormatResult> {
    const [contract, inpcRecords] = await Promise.all([
      this.repository.findById(contractId),
      this.repository.listInpc()
    ]);

    if (!contract) {
      throw new AppError(404, "EXTERNAL_CONTRACT_NOT_FOUND", "El contrato externo solicitado no existe.");
    }

    const rendered = await renderRentUpdateFormat({
      contract,
      renewalId: payload.renewalId,
      documentDate: payload.documentDate,
      effectiveDate: payload.effectiveDate,
      previousRentMxn: payload.previousRentMxn,
      inpcBasePeriod: payload.inpcBasePeriod,
      inpcTargetPeriod: payload.inpcTargetPeriod,
      useRoundedRent: payload.useRoundedRent,
      roundedRentMxn: payload.roundedRentMxn,
      inpcRecords
    });

    const updatedContract = await this.repository.update(contractId, {
      renewals: [
        ...contract.renewals.map(renewalToWriteRecord),
        {
          documentKind: "RENT_UPDATE_FORMAT",
          renewalDate: rendered.documentDate,
          leaseStartDate: rendered.effectiveDate,
          leaseEndDate: null,
          monthlyRentMxn: rendered.monthlyRentMxn ?? null,
          rentIncreasePct: rendered.rentIncreasePct ?? null,
          inpcBasePeriod: rendered.inpcBasePeriod ?? null,
          inpcTargetPeriod: rendered.inpcTargetPeriod ?? null,
          notes: `Formato de actualización de renta generado el ${rendered.documentDate}.`
        }
      ]
    });
    const generatedRenewal = latestRenewal(updatedContract);
    const renewalId = generatedRenewal?.id ?? rendered.renewalId;

    const wordDocument = await this.repository.createGeneratedDocument(contractId, {
      renewalId,
      templateId: rendered.templateId,
      templateTitle: rendered.templateTitle,
      originalFileName: rendered.word.filename,
      fileMimeType: rendered.word.contentType,
      fileContent: rendered.word.buffer
    });
    const pdfDocument = await this.repository.createGeneratedDocument(contractId, {
      renewalId,
      templateId: rendered.templateId,
      templateTitle: rendered.templateTitle,
      originalFileName: rendered.pdf.filename,
      fileMimeType: rendered.pdf.contentType,
      fileContent: rendered.pdf.buffer
    });

    return { wordDocument, pdfDocument };
  }

  public findGeneratedDocument(contractId: string, documentId: string) {
    return this.repository.findGeneratedDocument(contractId, documentId);
  }

  public deleteGeneratedDocument(contractId: string, documentId: string) {
    return this.repository.deleteGeneratedDocument(contractId, documentId);
  }

  public uploadRenewalDocument(
    contractId: string,
    renewalId: string,
    payload: ExternalContractRenewalDocumentUploadRecord
  ) {
    return this.repository.uploadRenewalDocument(contractId, renewalId, payload);
  }

  public findRenewalDocument(contractId: string, renewalId: string, documentId: string) {
    return this.repository.findRenewalDocument(contractId, renewalId, documentId);
  }

  public listInpc() {
    return this.repository.listInpc();
  }

  public syncInpc() {
    return syncExternalContractInpc(this.repository);
  }
}
