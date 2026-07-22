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
  type SalesProduct,
  type SalesProductCreateInput,
  type SalesProductId,
  type SalesStrategy
} from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import type { SalesRepository, SalesWriteActor } from "./types";

const DEFAULT_ACCENT_COLOR = "#2563eb";
const MAX_LOGO_BYTES = 3 * 1024 * 1024;
const BASE_PRODUCT_IDS = new Set(LEGALFLOW_SALES_PRODUCTS.map((product) => product.id));

type SalesProductRecord = {
  id: string;
  productKey: string;
  name: string;
  tagline: string;
  initials: string;
  accentColor: string;
  logoAlt: string;
  logoMimeType: string | null;
  logoContent: Uint8Array | Buffer | null;
  defaultStrategy: string;
  defaultDailyReport: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
};

function toDateKey(value: Date | string) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeAccentColor(value?: string | null) {
  const color = normalizeText(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_ACCENT_COLOR;
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "producto";
}

function buildInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "PV";
}

function decodeLogo(payload: SalesProductCreateInput) {
  const rawBase64 = normalizeText(payload.logoBase64);
  if (!rawBase64) {
    return {
      logoOriginalFileName: null,
      logoMimeType: null,
      logoSizeBytes: null,
      logoContent: null
    };
  }

  const dataUrlMimeType = rawBase64.match(/^data:([^;]+);base64,/i)?.[1];
  const logoMimeType = normalizeText(payload.logoMimeType || dataUrlMimeType || "image/png").toLowerCase();
  if (!logoMimeType.startsWith("image/")) {
    throw new AppError(400, "SALES_PRODUCT_LOGO_INVALID", "El logo debe ser un archivo de imagen.");
  }

  const base64Payload = rawBase64.includes(",") ? rawBase64.slice(rawBase64.indexOf(",") + 1) : rawBase64;
  const logoContent = Buffer.from(base64Payload, "base64");
  if (!logoContent.byteLength) {
    throw new AppError(400, "SALES_PRODUCT_LOGO_EMPTY", "El logo no contiene datos validos.");
  }

  if (logoContent.byteLength > MAX_LOGO_BYTES) {
    throw new AppError(400, "SALES_PRODUCT_LOGO_TOO_LARGE", "El logo no puede exceder 3 MB.");
  }

  return {
    logoOriginalFileName: normalizeText(payload.logoOriginalFileName) || null,
    logoMimeType,
    logoSizeBytes: logoContent.byteLength,
    logoContent
  };
}

function mapProduct(record: SalesProductRecord): SalesProduct {
  const logoMimeType = normalizeText(record.logoMimeType);
  const logoDataUrl = record.logoContent && logoMimeType
    ? `data:${logoMimeType};base64,${Buffer.from(record.logoContent).toString("base64")}`
    : undefined;

  return {
    id: record.productKey,
    name: record.name,
    tagline: record.tagline,
    initials: record.initials,
    accentColor: record.accentColor,
    logoAlt: record.logoAlt,
    logoDataUrl,
    logoMimeType: logoMimeType || undefined,
    status: record.archivedAt ? "archived" : "active",
    archivedAt: record.archivedAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    createdByName: record.createdByName ?? undefined,
    defaultStrategy: record.defaultStrategy,
    defaultDailyReport: record.defaultDailyReport
  };
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
    productId: record.productId,
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
    productId: record.productId,
    reportDate: toDateKey(record.reportDate),
    content: record.content,
    submittedAt: record.submittedAt?.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    updatedByName: record.updatedByName ?? undefined
  };
}

function buildDailyReportStore(products: SalesProduct[]) {
  return products.reduce((store, product) => {
    store[product.id] = {};
    return store;
  }, {} as SalesDailyReportStore);
}

function groupDailyReports(products: SalesProduct[], reports: SalesDailyReport[]) {
  const store = buildDailyReportStore(products);

  reports.forEach((report) => {
    if (!store[report.productId]) {
      store[report.productId] = {};
    }
    store[report.productId][report.reportDate] = report.content;
  });

  return store;
}

export class PrismaSalesRepository implements SalesRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getOverview(): Promise<SalesOverview> {
    const organizationId = getCurrentOrganizationIdOrDefault();
    await this.ensureDefaultProducts(organizationId);

    const productRecords = await this.prisma.salesProduct.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }]
    });
    await this.ensureStrategiesForProducts(organizationId, productRecords);

    const products = productRecords.map(mapProduct);
    const activeProducts = products.filter((product) => product.status === "active");
    const archivedProducts = products.filter((product) => product.status === "archived");
    const activeProductIds = new Set(activeProducts.map((product) => product.id));
    const today = getTodayDateKey();
    const scheduledTasks = buildLegalFlowSalesTasks(today).filter((task) => activeProductIds.has(task.productId));
    const taskSeeds = LEGALFLOW_SALES_TASK_SEEDS.filter((task) => activeProductIds.has(task.productId));
    const [strategies, dailyReports] = await Promise.all([
      this.prisma.salesStrategy.findMany({
        where: {
          organizationId,
          productId: { in: activeProducts.map((product) => product.id) }
        },
        orderBy: { productId: "asc" }
      }),
      this.listDailyReports(LEGALFLOW_SALES_START_DATE, today)
    ]);
    const strategyByProduct = new Map(strategies.map((strategy) => [strategy.productId, mapStrategy(strategy)]));
    const completedReportKeys = new Set(
      dailyReports
        .filter((report) => report.content.trim().length > 0)
        .map((report) => `${report.productId}:${report.reportDate}`)
    );
    const tasks = scheduledTasks.map((task) => completedReportKeys.has(`${task.productId}:${task.dueDate}`)
      ? { ...task, status: "concluida" as const }
      : task);

    return {
      products: activeProducts,
      archivedProducts,
      responsibles: LEGALFLOW_SALES_RESPONSIBLES,
      taskSeeds,
      tasks,
      strategies: activeProducts.reduce((result, product) => {
        const strategy = strategyByProduct.get(product.id);
        if (strategy) {
          result[product.id] = strategy;
        }
        return result;
      }, {} as SalesOverview["strategies"]),
      dailyReports: groupDailyReports(activeProducts, dailyReports.filter((report) => activeProductIds.has(report.productId)))
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

  public async createProduct(payload: SalesProductCreateInput, actor: SalesWriteActor) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    await this.ensureDefaultProducts(organizationId);

    const name = normalizeText(payload.name);
    if (!name) {
      throw new AppError(400, "SALES_PRODUCT_NAME_REQUIRED", "El nombre del producto es obligatorio.");
    }

    const tagline = normalizeText(payload.tagline) || "Producto comercial pendiente de descripcion.";
    const defaultStrategy = normalizeText(payload.defaultStrategy) || `Delimitar la estrategia general de marketing de ${name}.`;
    const defaultDailyReport = normalizeText(payload.defaultDailyReport) || `Registrar tareas realizadas, avances, bloqueos y siguientes acciones de ${name}.`;
    const logo = decodeLogo(payload);
    const productKey = await this.createUniqueProductKey(organizationId, name);

    const record = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.salesProduct.create({
        data: {
          organizationId,
          productKey,
          name,
          tagline,
          initials: buildInitials(name),
          accentColor: normalizeAccentColor(payload.accentColor),
          logoAlt: normalizeText(payload.logoAlt) || name,
          ...logo,
          defaultStrategy,
          defaultDailyReport,
          createdByUserId: actor.userId,
          createdByName: actor.displayName
        }
      });

      await transaction.salesStrategy.create({
        data: {
          organizationId,
          productId: productKey,
          content: defaultStrategy,
          updatedByUserId: actor.userId,
          updatedByName: actor.displayName
        }
      });

      return created;
    });

    return mapProduct(record);
  }

  public async archiveProduct(productId: SalesProductId) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const product = await this.findProductOrThrow(organizationId, productId);

    const record = await this.prisma.salesProduct.update({
      where: { id: product.id },
      data: { archivedAt: product.archivedAt ?? new Date() }
    });

    return mapProduct(record);
  }

  public async reactivateProduct(productId: SalesProductId) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const product = await this.findProductOrThrow(organizationId, productId);

    const record = await this.prisma.salesProduct.update({
      where: { id: product.id },
      data: { archivedAt: null }
    });

    return mapProduct(record);
  }

  public async deleteProduct(productId: SalesProductId) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const product = await this.findProductOrThrow(organizationId, productId);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.salesDailyReport.deleteMany({
        where: { organizationId, productId }
      });
      await transaction.salesStrategy.deleteMany({
        where: { organizationId, productId }
      });

      if (BASE_PRODUCT_IDS.has(productId)) {
        await transaction.salesProduct.update({
          where: { id: product.id },
          data: {
            archivedAt: new Date(),
            deletedAt: new Date(),
            logoOriginalFileName: null,
            logoMimeType: null,
            logoSizeBytes: null,
            logoContent: null
          }
        });
        return;
      }

      await transaction.salesProduct.delete({
        where: { id: product.id }
      });
    });
  }

  public async upsertStrategy(productId: SalesProductId, content: string, actor: SalesWriteActor) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const product = await this.findActiveProductOrThrow(organizationId, productId);
    const normalizedContent = content.trim() || product.defaultStrategy;
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
    await this.findActiveProductOrThrow(organizationId, productId);
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

  private async createUniqueProductKey(organizationId: string, name: string) {
    const baseKey = normalizeSlug(name);
    let productKey = baseKey;
    let suffix = 2;

    while (await this.prisma.salesProduct.findUnique({
      where: {
        organizationId_productKey: {
          organizationId,
          productKey
        }
      }
    })) {
      productKey = `${baseKey}-${suffix}`;
      suffix += 1;
    }

    return productKey;
  }

  private async findProductOrThrow(organizationId: string, productId: SalesProductId) {
    const product = await this.prisma.salesProduct.findFirst({
      where: {
        organizationId,
        productKey: productId,
        deletedAt: null
      }
    });

    if (!product) {
      throw new AppError(404, "SALES_PRODUCT_NOT_FOUND", "El producto de ventas no existe.");
    }

    return product;
  }

  private async findActiveProductOrThrow(organizationId: string, productId: SalesProductId) {
    const product = await this.findProductOrThrow(organizationId, productId);
    if (product.archivedAt) {
      throw new AppError(409, "SALES_PRODUCT_ARCHIVED", "El producto esta archivado.");
    }

    return product;
  }

  private async ensureDefaultProducts(organizationId: string) {
    await Promise.all(
      LEGALFLOW_SALES_PRODUCTS.map((product) =>
        this.prisma.salesProduct.upsert({
          where: {
            organizationId_productKey: {
              organizationId,
              productKey: product.id
            }
          },
          create: {
            organizationId,
            productKey: product.id,
            name: product.name,
            tagline: product.tagline,
            initials: product.initials,
            accentColor: product.accentColor,
            logoAlt: product.logoAlt,
            defaultStrategy: product.defaultStrategy,
            defaultDailyReport: product.defaultDailyReport
          },
          update: {}
        })
      )
    );
  }

  private async ensureStrategiesForProducts(organizationId: string, products: Array<Pick<SalesProductRecord, "productKey" | "defaultStrategy">>) {
    await Promise.all(
      products.map((product) =>
        this.prisma.salesStrategy.upsert({
          where: {
            organizationId_productId: {
              organizationId,
              productId: product.productKey
            }
          },
          create: {
            organizationId,
            productId: product.productKey,
            content: product.defaultStrategy
          },
          update: {}
        })
      )
    );
  }
}
