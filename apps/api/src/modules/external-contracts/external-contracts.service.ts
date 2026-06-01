import type {
  ExternalContractsRepository,
  ExternalContractUpdateRecord,
  ExternalContractWriteRecord
} from "../../repositories/types";

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
}
