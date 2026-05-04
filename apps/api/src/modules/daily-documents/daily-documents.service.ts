import type { DailyDocumentAssignmentWriteRecord, DailyDocumentsRepository } from "../../repositories/types";

export class DailyDocumentsService {
  public constructor(private readonly repository: DailyDocumentsRepository) {}

  public list() {
    return this.repository.list();
  }

  public create(payload: DailyDocumentAssignmentWriteRecord) {
    return this.repository.create(payload);
  }

  public update(documentId: string, payload: DailyDocumentAssignmentWriteRecord) {
    return this.repository.update(documentId, payload);
  }

  public delete(documentId: string) {
    return this.repository.delete(documentId);
  }
}
