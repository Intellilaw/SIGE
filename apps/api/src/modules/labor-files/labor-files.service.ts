import type {
  LaborFileDocumentUploadRecord,
  LaborFilesRepository
} from "../../repositories/types";
import type { LaborFileUpdateInput, LaborGlobalVacationDayInput, LaborVacationEventInput } from "@sige/contracts";

export class LaborFilesService {
  public constructor(private readonly repository: LaborFilesRepository) {}

  public list() {
    return this.repository.list();
  }

  public listForUser(userId: string) {
    return this.repository.listForUser(userId);
  }

  public findById(laborFileId: string) {
    return this.repository.findById(laborFileId);
  }

  public update(laborFileId: string, payload: LaborFileUpdateInput) {
    return this.repository.update(laborFileId, payload);
  }

  public uploadDocument(laborFileId: string, payload: LaborFileDocumentUploadRecord) {
    return this.repository.uploadDocument(laborFileId, payload);
  }

  public findDocument(documentId: string) {
    return this.repository.findDocument(documentId);
  }

  public listDocumentsForContractPrefill(laborFileId: string) {
    return this.repository.listDocumentsForContractPrefill(laborFileId);
  }

  public findVacationAcceptanceDocument(eventId: string) {
    return this.repository.findVacationAcceptanceDocument(eventId);
  }

  public deleteDocument(documentId: string) {
    return this.repository.deleteDocument(documentId);
  }

  public createVacationEvent(laborFileId: string, payload: LaborVacationEventInput) {
    return this.repository.createVacationEvent(laborFileId, payload);
  }

  public deleteVacationEvent(eventId: string) {
    return this.repository.deleteVacationEvent(eventId);
  }

  public listGlobalVacationDays() {
    return this.repository.listGlobalVacationDays();
  }

  public createGlobalVacationDay(payload: LaborGlobalVacationDayInput) {
    return this.repository.createGlobalVacationDay(payload);
  }

  public deleteGlobalVacationDay(dayId: string) {
    return this.repository.deleteGlobalVacationDay(dayId);
  }
}
