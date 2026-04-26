import type { Prisma, PrismaClient } from "@prisma/client";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

type ClientNumberRecord = {
  clientNumber: string;
  name?: string | null;
};

function parseClientNumberValue(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getClientNumberWidth(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits.length : value.trim().length;
}

export function normalizeClientName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function compareClientNumbers(left: string, right: string) {
  const leftValue = parseClientNumberValue(left);
  const rightValue = parseClientNumberValue(right);

  if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
    return leftValue - rightValue;
  }

  return left.localeCompare(right, "es-MX", { numeric: true, sensitivity: "base" });
}

export function sortClientRecords<T extends ClientNumberRecord>(items: T[]) {
  return [...items].sort((left, right) => {
    const numberDelta = compareClientNumbers(left.clientNumber, right.clientNumber);
    if (numberDelta !== 0) {
      return numberDelta;
    }

    return (left.name ?? "").localeCompare(right.name ?? "", "es-MX", { sensitivity: "base" });
  });
}

export async function getNextClientNumber(prisma: PrismaExecutor) {
  const records = await prisma.client.findMany({
    select: {
      clientNumber: true
    }
  });

  let maxValue = 0;
  let width = 3;

  for (const record of records) {
    const parsedValue = parseClientNumberValue(record.clientNumber);
    if (parsedValue !== null) {
      maxValue = Math.max(maxValue, parsedValue);
      width = Math.max(width, getClientNumberWidth(record.clientNumber));
    }
  }

  const nextValue = maxValue + 1;
  return String(nextValue).padStart(Math.max(width, String(nextValue).length), "0");
}
