import type { ExternalContract, ExternalContractMilestoneSource, ExternalContractRenewal } from "@sige/contracts";

export type ExternalContractMilestoneKind = "renewal" | "lease-end" | "rent-increase" | "manual" | "extracted";

export interface ExternalContractMilestoneView {
  id: string;
  contractId: string;
  contractNumber: string;
  contractTitle: string;
  clientNumber: string;
  clientName: string;
  propertyAddress: string;
  dueDate: string;
  title: string;
  description?: string;
  kind: ExternalContractMilestoneKind;
  source: "AUTOMATIC" | ExternalContractMilestoneSource;
}

const renewalOrdinalLabels = [
  "Primera renovaci\u00f3n",
  "Segunda renovaci\u00f3n",
  "Tercera renovaci\u00f3n",
  "Cuarta renovaci\u00f3n",
  "Quinta renovaci\u00f3n",
  "Sexta renovaci\u00f3n",
  "S\u00e9ptima renovaci\u00f3n",
  "Octava renovaci\u00f3n",
  "Novena renovaci\u00f3n",
  "D\u00e9cima renovaci\u00f3n"
];

function renewalLabel(index: number) {
  return renewalOrdinalLabels[index] ?? `Renovacion ${index + 1}`;
}

function dateInputValue(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getRenewalDisplayDate(renewal?: ExternalContractRenewal) {
  return renewal?.renewalDate || renewal?.leaseStartDate || renewal?.leaseEndDate;
}

function isValidDateKey(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isFutureOrToday(value?: string) {
  return Boolean(isValidDateKey(value) && value! >= dateInputValue(new Date()));
}

function addYearsDateKey(value: string, years: number) {
  const source = new Date(`${value}T12:00:00`);
  if (Number.isNaN(source.getTime())) {
    return "";
  }

  const next = new Date(source);
  next.setFullYear(source.getFullYear() + years);
  return dateInputValue(next);
}

function nextAnnualDateFrom(value?: string) {
  if (!isValidDateKey(value)) {
    return "";
  }

  let next = value!.slice(0, 10);
  const today = dateInputValue(new Date());
  while (next < today) {
    next = addYearsDateKey(next, 1);
  }

  return next;
}

function getLatestRenewalBasisDate(contract: ExternalContract) {
  const datedRenewals = contract.renewals
    .map((renewal) => getRenewalDisplayDate(renewal) || renewal.leaseStartDate)
    .filter((value): value is string => isValidDateKey(value))
    .sort((left, right) => right.localeCompare(left));

  return datedRenewals[0] ?? contract.leaseStartDate;
}

function getNextRentIncreaseDate(contract: ExternalContract) {
  if (isValidDateKey(contract.rentIncreaseDate)) {
    return nextAnnualDateFrom(contract.rentIncreaseDate);
  }

  const basisDate = getLatestRenewalBasisDate(contract);
  if (!isValidDateKey(basisDate)) {
    return "";
  }

  return nextAnnualDateFrom(addYearsDateKey(basisDate, 1));
}

function baseExternalContractMilestone(
  contract: ExternalContract,
  dueDate: string,
  title: string,
  kind: ExternalContractMilestoneKind,
  description?: string
): ExternalContractMilestoneView {
  return {
    id: `${contract.id}-${kind}-${dueDate}-${normalizeSearchValue(title)}`,
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    contractTitle: contract.title,
    clientNumber: contract.clientNumber,
    clientName: contract.clientName,
    propertyAddress: contract.propertyAddress ?? "",
    dueDate,
    title,
    description,
    kind,
    source: "AUTOMATIC"
  };
}

export function mergeExternalContractMilestones(milestones: ExternalContractMilestoneView[]) {
  const grouped = new Map<string, ExternalContractMilestoneView>();

  milestones
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.title.localeCompare(right.title, "es-MX"))
    .forEach((milestone) => {
      const key = `${milestone.contractId}|${milestone.dueDate}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, milestone);
        return;
      }

      const titleParts = new Set([...existing.title.split(" / "), milestone.title]);
      const descriptions = [existing.description, milestone.description].filter(Boolean);
      grouped.set(key, {
        ...existing,
        id: `${existing.id}-${milestone.id}`,
        title: [...titleParts].join(" / "),
        description: descriptions.length > 0 ? descriptions.join(" ") : undefined,
        kind: existing.kind
      });
    });

  return [...grouped.values()].sort((left, right) => left.dueDate.localeCompare(right.dueDate));
}

export function getExternalContractMilestones(contract: ExternalContract) {
  const milestones: ExternalContractMilestoneView[] = [];

  if (isFutureOrToday(contract.renewalDate)) {
    milestones.push(baseExternalContractMilestone(contract, contract.renewalDate!, "Renovaci\u00f3n del contrato", "renewal"));
  }

  contract.renewals.forEach((renewal) => {
    const renewalDate = getRenewalDisplayDate(renewal);
    if (isFutureOrToday(renewalDate)) {
      milestones.push(baseExternalContractMilestone(contract, renewalDate!, `${renewalLabel(renewal.sequence - 1)}`, "renewal"));
    }

    if (isFutureOrToday(renewal.leaseEndDate)) {
      milestones.push(baseExternalContractMilestone(contract, renewal.leaseEndDate!, `Fin de vigencia - ${renewalLabel(renewal.sequence - 1)}`, "lease-end"));
    }
  });

  if (isFutureOrToday(contract.leaseEndDate)) {
    milestones.push(baseExternalContractMilestone(contract, contract.leaseEndDate!, "Fin de vigencia del contrato", "lease-end"));
  }

  const rentIncreaseDate = getNextRentIncreaseDate(contract);
  if (isFutureOrToday(rentIncreaseDate)) {
    milestones.push(baseExternalContractMilestone(contract, rentIncreaseDate, "Pr\u00f3ximo aumento de renta", "rent-increase"));
  }

  (contract.milestones ?? []).forEach((milestone) => {
    if (!isFutureOrToday(milestone.dueDate)) {
      return;
    }

    milestones.push({
      id: milestone.id,
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      contractTitle: contract.title,
      clientNumber: contract.clientNumber,
      clientName: contract.clientName,
      propertyAddress: contract.propertyAddress ?? "",
      dueDate: milestone.dueDate,
      title: milestone.title,
      description: milestone.description,
      kind: milestone.source === "EXTRACTED" ? "extracted" : "manual",
      source: milestone.source
    });
  });

  return mergeExternalContractMilestones(milestones);
}

export function getAllExternalContractMilestones(contracts: ExternalContract[]) {
  return contracts.flatMap((contract) => getExternalContractMilestones(contract));
}

export function externalContractMilestoneKindLabel(kind: ExternalContractMilestoneKind) {
  const labels: Record<ExternalContractMilestoneKind, string> = {
    renewal: "Renovaci\u00f3n",
    "lease-end": "Fin de vigencia",
    "rent-increase": "Aumento de renta",
    manual: "Alerta manual",
    extracted: "Fecha extra\u00edda"
  };

  return labels[kind];
}
