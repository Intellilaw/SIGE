import type {
  AccountingCatalogXmlImportInput,
  AccountingCatalogXmlUploadInput,
  AccountingCfdiUploadInput,
  AccountingCreateAccountInput,
  AccountingInitialBalanceInput,
  AccountingJournalEntryInput,
  AccountingSettingsInput,
  AccountingXmlExportResult
} from "@sige/contracts";

import type { AccountingRepository } from "../../repositories/types";

export class AccountingService {
  public constructor(private readonly repository: AccountingRepository) {}

  public getOverview(year: number, month: number) {
    return this.repository.getOverview(year, month);
  }

  public updateSettings(payload: AccountingSettingsInput) {
    return this.repository.updateSettings(payload);
  }

  public initializeStandardCatalog() {
    return this.repository.initializeStandardCatalog();
  }

  public previewCatalogXml(payload: AccountingCatalogXmlUploadInput) {
    return this.repository.previewCatalogXml(payload);
  }

  public importCatalogXml(payload: AccountingCatalogXmlImportInput) {
    return this.repository.importCatalogXml(payload);
  }

  public createAccount(payload: AccountingCreateAccountInput) {
    return this.repository.createAccount(payload);
  }

  public updateAccount(accountId: string, payload: Partial<AccountingCreateAccountInput> & { isActive?: boolean }) {
    return this.repository.updateAccount(accountId, payload);
  }

  public createJournalEntry(payload: AccountingJournalEntryInput, actor?: { userId?: string; displayName?: string }) {
    return this.repository.createJournalEntry(payload, actor);
  }

  public createOpeningBalance(payload: AccountingInitialBalanceInput, actor?: { userId?: string; displayName?: string }) {
    return this.repository.createOpeningBalance(payload, actor);
  }

  public uploadCfdiDocuments(files: AccountingCfdiUploadInput[]) {
    return this.repository.uploadCfdiDocuments(files);
  }

  public generateAutomaticEntries(year: number, month: number) {
    return this.repository.generateAutomaticEntries(year, month);
  }

  public exportSatXml(year: number, month: number, format: AccountingXmlExportResult["format"]) {
    return this.repository.exportSatXml(year, month, format);
  }
}
