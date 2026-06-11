import { COMMISSION_SECTIONS, type CommissionReceiver } from "@sige/contracts";

import type { FinanceRecordWriteRecord, FinanceRepository } from "../../repositories/types";

const COMMISSION_RECEIVER_ALIAS_PAIRS = [
  ["Derecho financiero (lider)", "Der Financiero (lider)"],
  ["Derecho financiero (colaborador)", "Der Financiero (colaborador)"],
  ["Cumplimiento fiscal (lider)", "Compliance Fiscal (lider)"],
  ["Cumplimiento fiscal (colaborador)", "Compliance Fiscal (colaborador)"],
  ["Fiscal de Cumplimiento (lider)", "Compliance Fiscal (lider)"],
  ["Fiscal de Cumplimiento (colaborador)", "Compliance Fiscal (colaborador)"]
] as const;

const COMMISSION_RECEIVER_NAME_BY_KEY = new Map<string, string>();

for (const name of COMMISSION_SECTIONS) {
  COMMISSION_RECEIVER_NAME_BY_KEY.set(normalizeComparableText(name), name);
}

for (const [alias, canonicalName] of COMMISSION_RECEIVER_ALIAS_PAIRS) {
  COMMISSION_RECEIVER_NAME_BY_KEY.set(normalizeComparableText(alias), canonicalName);
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeComparableText(value?: string | null) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getCanonicalCommissionReceiverName(value?: string | null) {
  const name = normalizeText(value);
  if (!name) {
    return "";
  }

  return COMMISSION_RECEIVER_NAME_BY_KEY.get(normalizeComparableText(name)) ?? name;
}

function getRequiredCommissionReceiverId(name: string) {
  const slug = normalizeComparableText(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `required-${slug}`;
}

function buildRequiredCommissionReceiver(name: string): CommissionReceiver {
  return {
    id: getRequiredCommissionReceiverId(name),
    name,
    active: true,
    createdAt: "1970-01-01T00:00:00.000Z"
  };
}

function normalizeCommissionReceivers(receivers: CommissionReceiver[]) {
  const byKey = new Map<string, CommissionReceiver>();

  const addReceiver = (receiver: CommissionReceiver) => {
    if (!receiver.active) {
      return;
    }

    const name = getCanonicalCommissionReceiverName(receiver.name);
    if (!name) {
      return;
    }

    const key = normalizeComparableText(name);
    if (!byKey.has(key)) {
      byKey.set(key, { ...receiver, name });
    }
  };

  receivers.forEach(addReceiver);
  COMMISSION_SECTIONS.forEach((name) => addReceiver(buildRequiredCommissionReceiver(name)));

  return [...byKey.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "es", { sensitivity: "base" })
  );
}

export class FinancesService {
  public constructor(private readonly repository: FinanceRepository) {}

  public listRecords(year: number, month: number) {
    return this.repository.listRecords(year, month);
  }

  public listRecordsReadOnly(year: number, month: number) {
    return this.repository.listRecordsReadOnly(year, month);
  }

  public createRecord(year: number, month: number, payload?: FinanceRecordWriteRecord) {
    return this.repository.createRecord(year, month, payload);
  }

  public updateRecord(recordId: string, payload: FinanceRecordWriteRecord) {
    return this.repository.updateRecord(recordId, payload);
  }

  public deleteRecord(recordId: string) {
    return this.repository.deleteRecord(recordId);
  }

  public bulkDelete(recordIds: string[]) {
    return this.repository.bulkDelete(recordIds);
  }

  public listSnapshots() {
    return this.repository.listSnapshots();
  }

  public createSnapshot(year: number, month: number) {
    return this.repository.createSnapshot(year, month);
  }

  public copyToNextMonth(year: number, month: number) {
    return this.repository.copyToNextMonth(year, month);
  }

  public sendMatterToFinance(matterId: string, year: number, month: number) {
    return this.repository.sendMatterToFinance(matterId, year, month);
  }

  public async listCommissionReceivers() {
    const receivers = await this.repository.listCommissionReceivers();
    return normalizeCommissionReceivers(receivers);
  }
}
