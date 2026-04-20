import type { DashboardRepository } from "../../repositories/types";

export class DashboardService {
  public constructor(private readonly repository: DashboardRepository) {}

  public getSummary() {
    return this.repository.getSummary();
  }
}