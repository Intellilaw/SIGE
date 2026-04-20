import type { FinanceRecordWriteRecord, FinanceRepository } from "../../repositories/types";

export class FinancesService {
  public constructor(private readonly repository: FinanceRepository) {}

  public listRecords(year: number, month: number) {
    return this.repository.listRecords(year, month);
  }

  public createRecord(year: number, month: number, payload?: FinanceRecordWriteRecord) {
    return this.repository.createRecord(year, month, payload);
  }

  public updateRecord(recordId: string, payload: FinanceRecordWriteRecord) {
    return this.repository.updateRecord(recordId, payload);
  }

  public deleteRecord(recordId: string) {
    return this.repository.deleteRecord(recordId);
  }

  public bulkDelete(recordIds: string[]) {
    return this.repository.bulkDelete(recordIds);
  }

  public listSnapshots() {
    return this.repository.listSnapshots();
  }

  public createSnapshot(year: number, month: number) {
    return this.repository.createSnapshot(year, month);
  }

  public copyToNextMonth(year: number, month: number) {
    return this.repository.copyToNextMonth(year, month);
  }

  public sendMatterToFinance(matterId: string, year: number, month: number) {
    return this.repository.sendMatterToFinance(matterId, year, month);
  }

  public listCommissionReceivers() {
    return this.repository.listCommissionReceivers();
  }
}
