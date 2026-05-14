import type {
  InternalContractTemplateWriteRecord,
  InternalContractWriteRecord,
  InternalContractsRepository
} from "../../repositories/types";

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

  public listTemplates() {
    return this.repository.listTemplates();
  }

  public createTemplate(payload: InternalContractTemplateWriteRecord) {
    return this.repository.createTemplate(payload);
  }

  public deleteTemplate(templateId: string) {
    return this.repository.deleteTemplate(templateId);
  }

  public findTemplateDocument(templateId: string) {
    return this.repository.findTemplateDocument(templateId);
  }
}
