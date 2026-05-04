import type { InternalContractWriteRecord, InternalContractsRepository } from "../../repositories/types";

export class InternalContractsService {
  public constructor(private readonly repository: InternalContractsRepository) {}

  public list() {
    return this.repository.list();
  }

  public create(payload: InternalContractWriteRecord) {
    return this.repository.create(payload);
  }

  public delete(contractId: string) {
    return this.repository.delete(contractId);
  }

  public findDocument(contractId: string) {
    return this.repository.findDocument(contractId);
  }

  public listCollaborators() {
    return this.repository.listCollaborators();
  }
}
