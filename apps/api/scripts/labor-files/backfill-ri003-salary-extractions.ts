import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import {
  extractLaborSalaryFromDocument,
  formatLaborSalaryExtractionDetail,
  formatLaborSalaryExtractionFailureDetail,
  LABOR_SALARY_EXTRACTION_DETAIL_VERSION
} from "../../src/modules/labor-files/labor-salary-intelligence";

type SalaryExtractionUpdate = {
  riExtractedDailySalaryMxn: number | null;
  riExtractedMonthlyGrossSalaryMxn: number | null;
  riSalaryExtractionDetail: string;
};

const prisma = new PrismaClient();
const applyChanges = process.argv.includes("--apply");

function roundMoney(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function normalizeCurrentMoney(value: { toString(): string } | number | string | null) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

function buildUpdateData(originalFileName: string, extraction: Awaited<ReturnType<typeof extractLaborSalaryFromDocument>>): SalaryExtractionUpdate {
  return extraction
    ? {
        riExtractedDailySalaryMxn: roundMoney(extraction.dailySalaryMxn),
        riExtractedMonthlyGrossSalaryMxn: roundMoney(extraction.monthlyGrossSalaryMxn),
        riSalaryExtractionDetail: formatLaborSalaryExtractionDetail(extraction)
      }
    : {
        riExtractedDailySalaryMxn: null,
        riExtractedMonthlyGrossSalaryMxn: null,
        riSalaryExtractionDetail: formatLaborSalaryExtractionFailureDetail(originalFileName)
      };
}

function valuesChanged(
  current: {
    riExtractedDailySalaryMxn: { toString(): string } | number | string | null;
    riExtractedMonthlyGrossSalaryMxn: { toString(): string } | number | string | null;
    riSalaryExtractionDetail: string | null;
  },
  next: SalaryExtractionUpdate
) {
  return normalizeCurrentMoney(current.riExtractedDailySalaryMxn) !== next.riExtractedDailySalaryMxn ||
    normalizeCurrentMoney(current.riExtractedMonthlyGrossSalaryMxn) !== next.riExtractedMonthlyGrossSalaryMxn ||
    (current.riSalaryExtractionDetail ?? null) !== next.riSalaryExtractionDetail;
}

async function main() {
  console.log(`${applyChanges ? "[apply]" : "[dry-run]"} Backfill ${LABOR_SALARY_EXTRACTION_DETAIL_VERSION}`);

  const documents = await prisma.laborFileDocument.findMany({
    where: {
      documentType: { in: ["EMPLOYMENT_CONTRACT", "ADDENDUM"] }
    },
    orderBy: [{ uploadedAt: "asc" }],
    select: {
      id: true,
      documentType: true,
      originalFileName: true,
      fileMimeType: true,
      uploadedAt: true,
      fileContent: true,
      riExtractedDailySalaryMxn: true,
      riExtractedMonthlyGrossSalaryMxn: true,
      riSalaryExtractionDetail: true,
      laborFile: {
        select: {
          employeeName: true,
          employeeShortName: true
        }
      }
    }
  });

  let changed = 0;
  let readable = 0;
  let unreadable = 0;

  for (const document of documents) {
    const extraction = await extractLaborSalaryFromDocument({
      id: document.id,
      documentType: document.documentType,
      originalFileName: document.originalFileName,
      fileMimeType: document.fileMimeType,
      uploadedAt: document.uploadedAt,
      fileContent: Buffer.from(document.fileContent)
    });
    const next = buildUpdateData(document.originalFileName, extraction);

    if (next.riExtractedDailySalaryMxn === null) {
      unreadable += 1;
    } else {
      readable += 1;
    }

    if (!valuesChanged(document, next)) {
      continue;
    }

    changed += 1;
    const label = [
      document.laborFile.employeeShortName,
      document.laborFile.employeeName,
      document.documentType,
      document.originalFileName
    ].filter(Boolean).join(" / ");

    console.log(
      [
        `- ${label}`,
        `  daily: ${normalizeCurrentMoney(document.riExtractedDailySalaryMxn) ?? "null"} -> ${next.riExtractedDailySalaryMxn ?? "null"}`,
        `  monthly: ${normalizeCurrentMoney(document.riExtractedMonthlyGrossSalaryMxn) ?? "null"} -> ${next.riExtractedMonthlyGrossSalaryMxn ?? "null"}`,
        `  detail: ${document.riSalaryExtractionDetail ?? "null"} -> ${next.riSalaryExtractionDetail}`
      ].join("\n")
    );

    if (applyChanges) {
      await prisma.laborFileDocument.update({
        where: { id: document.id },
        data: next
      });
    }
  }

  console.log(
    [
      `Documents scanned: ${documents.length}`,
      `Readable salary documents: ${readable}`,
      `Unreadable salary documents: ${unreadable}`,
      `Documents ${applyChanges ? "updated" : "that would change"}: ${changed}`
    ].join("\n")
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
