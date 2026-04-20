import type {
  GeneralExpenseActor,
  GeneralExpenseCreateRecord,
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

  public copyRecurringToNextMonth(year: number, month: number) {
    return this.repository.copyRecurringToNextMonth(year, month);
  }
}
