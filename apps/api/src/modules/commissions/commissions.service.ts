import type { CommissionsRepository, CreateCommissionSnapshotRecord } from "../../repositories/types";

export class CommissionsService {
  public constructor(private readonly repository: CommissionsRepository) {}

  public getOverview(year: number, month: number) {
    return this.repository.getOverview(year, month);
  }

  public listReceivers() {
    return this.repository.listReceivers();
  }

  public createReceiver(name: string) {
    return this.repository.createReceiver(name);
  }

  public updateReceiver(receiverId: string, name: string) {
    return this.repository.updateReceiver(receiverId, name);
  }

  public deleteReceiver(receiverId: string) {
    return this.repository.deleteReceiver(receiverId);
  }

  public listSnapshots() {
    return this.repository.listSnapshots();
  }

  public createSnapshot(payload: CreateCommissionSnapshotRecord) {
    return this.repository.createSnapshot(payload);
  }
}
