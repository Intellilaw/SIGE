import type {
  CommissionExclusionWriteRecord,
  CommissionMatterExclusionWriteRecord,
  CommissionPaymentAcknowledgementUpdateRecord,
  CommissionPaymentActor,
  CommissionPaymentReconcileRow,
  CommissionSignedReceiptUploadRecord,
  CommissionsRepository,
  CreateCommissionSnapshotRecord,
  ProjectorCommissionUpdateRecord
} from "../../repositories/types";

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

  public setExclusion(payload: CommissionExclusionWriteRecord) {
    return this.repository.setExclusion(payload);
  }

  public clearExclusion(payload: Omit<CommissionExclusionWriteRecord, "createdByUserId" | "createdByName">) {
    return this.repository.clearExclusion(payload);
  }

  public setMatterExclusion(payload: CommissionMatterExclusionWriteRecord) {
    return this.repository.setMatterExclusion(payload);
  }

  public updateProjectorCommission(entryId: string, payload: ProjectorCommissionUpdateRecord) {
    return this.repository.updateProjectorCommission(entryId, payload);
  }

  public getPaymentFlowState(year: number, month: number) {
    return this.repository.getPaymentFlowState(year, month);
  }

  public reconcilePaymentAcknowledgements(year: number, month: number, rows: CommissionPaymentReconcileRow[]) {
    return this.repository.reconcilePaymentAcknowledgements(year, month, rows);
  }

  public updatePaymentAcknowledgement(
    payload: CommissionPaymentAcknowledgementUpdateRecord,
    actor: CommissionPaymentActor
  ) {
    return this.repository.updatePaymentAcknowledgement(payload, actor);
  }

  public uploadSignedReceipt(payload: CommissionSignedReceiptUploadRecord, actor: CommissionPaymentActor) {
    return this.repository.uploadSignedReceipt(payload, actor);
  }

  public findSignedReceipt(year: number, month: number, section: string) {
    return this.repository.findSignedReceipt(year, month, section);
  }
}
