import type { SalesProductId } from "@sige/contracts";

import type { SalesRepository, SalesWriteActor } from "../../repositories/types";

export class SalesService {
  public constructor(private readonly repository: SalesRepository) {}

  public getOverview() {
    return this.repository.getOverview();
  }

  public updateStrategy(productId: SalesProductId, content: string, actor: SalesWriteActor) {
    return this.repository.upsertStrategy(productId, content, actor);
  }

  public updateDailyReport(productId: SalesProductId, reportDate: string, content: string, actor: SalesWriteActor) {
    return this.repository.upsertDailyReport(productId, reportDate, content, actor);
  }
}
