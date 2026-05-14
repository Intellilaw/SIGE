import type { KpiAccessScope, KpisRepository } from "../../repositories/types";

export class KpisService {
  public constructor(private readonly repository: KpisRepository) {}

  public getOverview(year: number, month: number, accessScope: KpiAccessScope) {
    return this.repository.getOverview(year, month, accessScope);
  }

  public getPeriodOverview(startDate: string, endDate: string, accessScope: KpiAccessScope) {
    return this.repository.getPeriodOverview(startDate, endDate, accessScope);
  }
}
