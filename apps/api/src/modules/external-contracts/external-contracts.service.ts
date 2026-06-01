import type {
  ExternalContractsRepository,
  ExternalContractRenewalDocumentUploadRecord,
  ExternalContractUpdateRecord,
  ExternalContractWriteRecord
} from "../../repositories/types";
import type { ExternalContractGeneratedDocument } from "@sige/contracts";
import { AppError } from "../../core/errors/app-error";
import { syncExternalContractInpc } from "./external-contract-inpc";
import { renderRentUpdateFormat } from "./external-contract-rent-update-format";

export interface ExternalContractRentUpdateFormatInput {
  renewalId?: string | null;
  documentDate?: string | null;
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
  ): Promise<ExternalContractGeneratedDocument> {
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
      inpcRecords
    });

    return this.repository.createGeneratedDocument(contractId, {
      renewalId: rendered.renewalId,
      templateId: rendered.templateId,
      templateTitle: rendered.templateTitle,
      originalFileName: rendered.filename,
      fileMimeType: rendered.contentType,
      fileContent: rendered.buffer
    });
  }

  public findGeneratedDocument(contractId: string, documentId: string) {
    return this.repository.findGeneratedDocument(contractId, documentId);
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
