import type { QuotesRepository } from "../../repositories/types";

export class QuotesService {
  public constructor(private readonly repository: QuotesRepository) {}

  public list() {
    return this.repository.list();
  }

  public findById(quoteId: string) {
    return this.repository.findById(quoteId);
  }

  public listTemplates() {
    return this.repository.listTemplates();
  }

  public create(payload: Parameters<QuotesRepository["create"]>[0]) {
    return this.repository.create(payload);
  }

  public update(quoteId: string, payload: Parameters<QuotesRepository["update"]>[1]) {
    return this.repository.update(quoteId, payload);
  }

  public delete(quoteId: string) {
    return this.repository.delete(quoteId);
  }

  public createTemplate(payload: Parameters<QuotesRepository["createTemplate"]>[0]) {
    return this.repository.createTemplate(payload);
  }

  public updateTemplate(templateId: string, payload: Parameters<QuotesRepository["updateTemplate"]>[1]) {
    return this.repository.updateTemplate(templateId, payload);
  }

  public deleteTemplate(templateId: string) {
    return this.repository.deleteTemplate(templateId);
  }
}
