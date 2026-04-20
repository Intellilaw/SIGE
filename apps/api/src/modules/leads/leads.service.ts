import type { LeadUpdateRecord, LeadsRepository } from "../../repositories/types";

export class LeadsService {
  public constructor(private readonly repository: LeadsRepository) {}

  public list() {
    return this.repository.list();
  }

  public listHistory() {
    return this.repository.listHistory();
  }

  public listMonthly(year: number, month: number) {
    return this.repository.listMonthly(year, month);
  }

  public listCommissionShortNames() {
    return this.repository.listCommissionShortNames();
  }

  public create(payload?: LeadUpdateRecord) {
    return this.repository.create(payload);
  }

  public update(leadId: string, payload: LeadUpdateRecord) {
    return this.repository.update(leadId, payload);
  }

  public delete(leadId: string) {
    return this.repository.delete(leadId);
  }

  public bulkDelete(leadIds: string[]) {
    return this.repository.bulkDelete(leadIds);
  }

  public markSentToClient(leadId: string) {
    return this.repository.markSentToClient(leadId);
  }

  public sendToMatters(leadId: string) {
    return this.repository.sendToMatters(leadId);
  }

  public returnToActive(leadId: string) {
    return this.repository.returnToActive(leadId);
  }
}
