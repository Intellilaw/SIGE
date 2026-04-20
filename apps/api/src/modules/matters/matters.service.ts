import type { MattersRepository, MatterWriteRecord } from "../../repositories/types";

export class MattersService {
  public constructor(private readonly repository: MattersRepository) {}

  public list() {
    return this.repository.list();
  }

  public listDeleted() {
    return this.repository.listDeleted();
  }

  public listCommissionShortNames() {
    return this.repository.listCommissionShortNames();
  }

  public create(payload?: MatterWriteRecord) {
    return this.repository.create(payload);
  }

  public update(matterId: string, payload: MatterWriteRecord) {
    return this.repository.update(matterId, payload);
  }

  public trash(matterId: string) {
    return this.repository.trash(matterId);
  }

  public bulkTrash(matterIds: string[]) {
    return this.repository.bulkTrash(matterIds);
  }

  public bulkDelete(matterIds: string[]) {
    return this.repository.bulkDelete(matterIds);
  }

  public restore(matterId: string) {
    return this.repository.restore(matterId);
  }

  public generateIdentifier(matterId: string) {
    return this.repository.generateIdentifier(matterId);
  }

  public sendToExecution(matterId: string) {
    return this.repository.sendToExecution(matterId);
  }
}
