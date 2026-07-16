import type {
  BudgetAreaProfitabilityRangeRecord,
  BudgetPlanningRepository,
  BudgetPlanUpdateRecord
} from "../../repositories/types";

export class BudgetPlanningService {
  public constructor(private readonly repository: BudgetPlanningRepository) {}

  public getOverview(year: number, month: number) {
    return this.repository.getOverview(year, month);
  }

  public getAreaProfitability(range?: BudgetAreaProfitabilityRangeRecord) {
    return this.repository.getAreaProfitability(range);
  }

  public updatePlan(year: number, month: number, payload: BudgetPlanUpdateRecord) {
    return this.repository.updatePlan(year, month, payload);
  }

  public listSnapshotsBefore(year: number, month: number) {
    return this.repository.listSnapshotsBefore(year, month);
  }

  public copyExpenseBreakdownToNextMonth(year: number, month: number) {
    return this.repository.copyExpenseBreakdownToNextMonth(year, month);
  }
}
