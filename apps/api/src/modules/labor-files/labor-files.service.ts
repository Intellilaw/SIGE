import type {
  LaborFileDocumentUploadRecord,
  LaborFilesRepository,
  LaborVacationAcceptanceUploadRecord,
  LaborVacationConflictAuthorizationWriteRecord
} from "../../repositories/types";
import type {
  LaborFileUpdateInput,
  LaborGlobalVacationDayInput,
  LaborPreviousYearPendingVacationInput,
  LaborVacationEventInput,
  LaborVacationTeamConflict
} from "@sige/contracts";

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

  public archive(laborFileId: string) {
    return this.repository.archive(laborFileId);
  }

  public restore(laborFileId: string) {
    return this.repository.restore(laborFileId);
  }

  public deleteLaborFile(laborFileId: string) {
    return this.repository.deleteLaborFile(laborFileId);
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

  public findVacationConflictAuthorization(laborFileId: string, vacationDates: string[], conflicts: LaborVacationTeamConflict[]) {
    return this.repository.findVacationConflictAuthorization(laborFileId, vacationDates, conflicts);
  }

  public createVacationConflictAuthorization(laborFileId: string, payload: LaborVacationConflictAuthorizationWriteRecord) {
    return this.repository.createVacationConflictAuthorization(laborFileId, payload);
  }

  public setPreviousYearPendingVacationDays(laborFileId: string, payload: LaborPreviousYearPendingVacationInput & {
    previousYearStartDate: string;
    previousYearEndDate: string;
  }) {
    return this.repository.setPreviousYearPendingVacationDays(laborFileId, payload);
  }

  public updateVacationAcceptance(eventId: string, payload: LaborVacationAcceptanceUploadRecord) {
    return this.repository.updateVacationAcceptance(eventId, payload);
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

  public findGlobalVacationAcceptanceDocuments(globalVacationDayId: string) {
    return this.repository.findGlobalVacationAcceptanceDocuments(globalVacationDayId);
  }

  public deleteGlobalVacationEvents(globalVacationDayId: string) {
    return this.repository.deleteGlobalVacationEvents(globalVacationDayId);
  }

  public deleteGlobalVacationDay(dayId: string) {
    return this.repository.deleteGlobalVacationDay(dayId);
  }
}
