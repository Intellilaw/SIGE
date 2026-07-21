import type {
  GeneralExpenseActor,
  GeneralExpenseCreateRecord,
  GeneralExpenseEmrtAcknowledgementUpdateRecord,
  GeneralExpensePayrollCreateRecord,
  GeneralExpensePayrollDistributionUpdateRecord,
  GeneralExpensePayrollUpdateRecord,
  GeneralExpenseUpdateRecord,
  GeneralExpensesRepository
} from "../../repositories/types";

export class GeneralExpensesService {
  public constructor(private readonly repository: GeneralExpensesRepository) {}

  public list(year: number, month: number) {
    return this.repository.list(year, month);
  }

  public create(payload?: GeneralExpenseCreateRecord) {
    return this.repository.create(payload);
  }

  public update(expenseId: string, payload: GeneralExpenseUpdateRecord, actor: GeneralExpenseActor) {
    return this.repository.update(expenseId, payload, actor);
  }

  public delete(expenseId: string) {
    return this.repository.delete(expenseId);
  }

  public listEmrtAcknowledgements(year: number, month: number) {
    return this.repository.listEmrtAcknowledgements(year, month);
  }

  public updateEmrtAcknowledgement(
    date: string,
    payload: GeneralExpenseEmrtAcknowledgementUpdateRecord,
    actor: GeneralExpenseActor
  ) {
    return this.repository.updateEmrtAcknowledgement(date, payload, actor);
  }

  public copyRecurringToNextMonth(year: number, month: number) {
    return this.repository.copyRecurringToNextMonth(year, month);
  }

  public copyPayrollToNextMonth(year: number, month: number) {
    return this.repository.copyPayrollToNextMonth(year, month);
  }

  public listPayrollEmployeeOptions() {
    return this.repository.listPayrollEmployeeOptions();
  }

  public listPayrollEntries(year: number, month: number) {
    return this.repository.listPayrollEntries(year, month);
  }

  public createPayrollEntry(payload?: GeneralExpensePayrollCreateRecord) {
    return this.repository.createPayrollEntry(payload);
  }

  public updatePayrollEntry(
    payrollEntryId: string,
    payload: GeneralExpensePayrollUpdateRecord,
    actor: GeneralExpenseActor
  ) {
    return this.repository.updatePayrollEntry(payrollEntryId, payload, actor);
  }

  public updatePayrollDistribution(
    payrollEntryId: string,
    payload: GeneralExpensePayrollDistributionUpdateRecord
  ) {
    return this.repository.updatePayrollDistribution(payrollEntryId, payload);
  }

  public deletePayrollEntry(payrollEntryId: string) {
    return this.repository.deletePayrollEntry(payrollEntryId);
  }
}
