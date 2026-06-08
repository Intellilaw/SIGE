import type { PrismaClient } from "@prisma/client";
import {
  buildLegalFlowSalesTasks,
  getTodayDateKey,
  LEGALFLOW_SALES_PRODUCTS,
  LEGALFLOW_SALES_RESPONSIBLES,
  LEGALFLOW_SALES_START_DATE,
  LEGALFLOW_SALES_TASK_SEEDS,
  parseDateKey,
  type SalesDailyReport,
  type SalesDailyReportStore,
  type SalesOverview,
  type SalesProductId,
  type SalesStrategy
} from "@sige/contracts";

import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import type { SalesRepository, SalesWriteActor } from "./types";

function toDateKey(value: Date | string) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

function normalizeText(value: string) {
  return value.trim();
}

function getProduct(productId: SalesProductId) {
  return LEGALFLOW_SALES_PRODUCTS.find((product) => product.id === productId);
}

function mapStrategy(record: {
  id: string;
  productId: string;
  content: string;
  updatedAt: Date;
  updatedByName: string | null;
}): SalesStrategy {
  return {
    id: record.id,
    productId: record.productId as SalesProductId,
    content: record.content,
    updatedAt: record.updatedAt.toISOString(),
    updatedByName: record.updatedByName ?? undefined
  };
}

function mapDailyReport(record: {
  id: string;
  productId: string;
  reportDate: Date;
  content: string;
  submittedAt: Date | null;
  updatedAt: Date;
  updatedByName: string | null;
}): SalesDailyReport {
  return {
    id: record.id,
    productId: record.productId as SalesProductId,
    reportDate: toDateKey(record.reportDate),
    content: record.content,
    submittedAt: record.submittedAt?.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    updatedByName: record.updatedByName ?? undefined
  };
}

function buildDailyReportStore() {
  return LEGALFLOW_SALES_PRODUCTS.reduce((store, product) => {
    store[product.id] = {};
    return store;
  }, {} as SalesDailyReportStore);
}

function groupDailyReports(reports: SalesDailyReport[]) {
  const store = buildDailyReportStore();

  reports.forEach((report) => {
    store[report.productId][report.reportDate] = report.content;
  });

  return store;
}

export class PrismaSalesRepository implements SalesRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getOverview(): Promise<SalesOverview> {
    const organizationId = getCurrentOrganizationIdOrDefault();
    await this.ensureDefaultStrategies(organizationId);

    const today = getTodayDateKey();
    const tasks = buildLegalFlowSalesTasks(today);
    const [strategies, dailyReports] = await Promise.all([
      this.prisma.salesStrategy.findMany({
        where: { organizationId },
        orderBy: { productId: "asc" }
      }),
      this.listDailyReports(LEGALFLOW_SALES_START_DATE, today)
    ]);
    const strategyByProduct = new Map(strategies.map((strategy) => [strategy.productId, mapStrategy(strategy)]));

    return {
      products: LEGALFLOW_SALES_PRODUCTS,
      responsibles: LEGALFLOW_SALES_RESPONSIBLES,
      taskSeeds: LEGALFLOW_SALES_TASK_SEEDS,
      tasks,
      strategies: LEGALFLOW_SALES_PRODUCTS.reduce((result, product) => {
        const strategy = strategyByProduct.get(product.id);
        if (strategy) {
          result[product.id] = strategy;
        }
        return result;
      }, {} as SalesOverview["strategies"]),
      dailyReports: groupDailyReports(dailyReports)
    };
  }

  public async listDailyReports(startDate: string, endDate: string) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const records = await this.prisma.salesDailyReport.findMany({
      where: {
        organizationId,
        reportDate: {
          gte: parseDateKey(startDate),
          lte: parseDateKey(endDate)
        }
      },
      orderBy: [{ reportDate: "asc" }, { productId: "asc" }]
    });

    return records.map(mapDailyReport);
  }

  public async upsertStrategy(productId: SalesProductId, content: string, actor: SalesWriteActor) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const product = getProduct(productId);
    const normalizedContent = content.trim() || product?.defaultStrategy || "";
    const record = await this.prisma.salesStrategy.upsert({
      where: {
        organizationId_productId: {
          organizationId,
          productId
        }
      },
      create: {
        organizationId,
        productId,
        content: normalizedContent,
        updatedByUserId: actor.userId,
        updatedByName: actor.displayName
      },
      update: {
        content: normalizedContent,
        updatedByUserId: actor.userId,
        updatedByName: actor.displayName
      }
    });

    return mapStrategy(record);
  }

  public async upsertDailyReport(productId: SalesProductId, reportDate: string, content: string, actor: SalesWriteActor) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const normalizedContent = normalizeText(content);
    const submittedAt = normalizedContent ? new Date() : null;
    const record = await this.prisma.salesDailyReport.upsert({
      where: {
        organizationId_productId_reportDate: {
          organizationId,
          productId,
          reportDate: parseDateKey(reportDate)
        }
      },
      create: {
        organizationId,
        productId,
        reportDate: parseDateKey(reportDate),
        content: normalizedContent,
        submittedAt,
        updatedByUserId: actor.userId,
        updatedByName: actor.displayName
      },
      update: {
        content: normalizedContent,
        submittedAt,
        updatedByUserId: actor.userId,
        updatedByName: actor.displayName
      }
    });

    return mapDailyReport(record);
  }

  private async ensureDefaultStrategies(organizationId: string) {
    await Promise.all(
      LEGALFLOW_SALES_PRODUCTS.map((product) =>
        this.prisma.salesStrategy.upsert({
          where: {
            organizationId_productId: {
              organizationId,
              productId: product.id
            }
          },
          create: {
            organizationId,
            productId: product.id,
            content: product.defaultStrategy
          },
          update: {}
        })
      )
    );
  }
}
