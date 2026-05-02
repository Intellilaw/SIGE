import type { BudgetPlanningRepository, BudgetPlanUpdateRecord } from "../../repositories/types";

export class BudgetPlanningService {
  public constructor(private readonly repository: BudgetPlanningRepository) {}

  public getOverview(year: number, month: number) {
    return this.repository.getOverview(year, month);
  }

  public updatePlan(year: number, month: number, payload: BudgetPlanUpdateRecord) {
    return this.repository.updatePlan(year, month, payload);
  }

  public listSnapshotsBefore(year: number, month: number) {
    return this.repository.listSnapshotsBefore(year, month);
  }
}
