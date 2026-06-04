import { Prisma, PrismaClient } from "@prisma/client";

import { getCurrentOrganizationId } from "../core/tenant/tenant-context";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const tenantScopedDatamodelModels = Prisma.dmmf.datamodel.models.filter((model) =>
  model.fields.some((field) => field.name === "organizationId")
);
const tenantScopedModels = new Set(tenantScopedDatamodelModels.map((model) => model.name));
const tenantScopedRelationFieldsByModel = new Map(
  tenantScopedDatamodelModels.map((model) => [
    model.name,
    new Set(model.fields.filter((field) => field.kind === "object").map((field) => field.name))
  ])
);

type PrismaQueryArgs = {
  where?: unknown;
  data?: unknown;
  create?: unknown;
  update?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function usesNestedRelationData(data: Record<string, unknown>, model?: string) {
  if (!model) {
    return false;
  }

  const relationFields = tenantScopedRelationFieldsByModel.get(model);
  if (!relationFields) {
    return false;
  }

  return Object.entries(data).some(([key, value]) =>
    key !== "organization" && relationFields.has(key) && value !== null && value !== undefined
  );
}

function withTenantWhere(where: unknown, organizationId: string, uniqueWhere = false) {
  if (uniqueWhere) {
    if (isRecord(where) && Object.keys(where).some((key) => key.startsWith("organizationId_"))) {
      return where;
    }

    return {
      ...(isRecord(where) ? where : {}),
      organizationId
    };
  }

  return {
    AND: [
      isRecord(where) ? where : {},
      { organizationId }
    ]
  };
}

function withTenantData(data: unknown, organizationId: string, model?: string, allowRelationConnect = false): unknown {
  if (Array.isArray(data)) {
    return data.map((entry) => withTenantData(entry, organizationId, model, allowRelationConnect));
  }

  if (!isRecord(data)) {
    return data;
  }

  if (hasOwn(data, "organization")) {
    return data;
  }

  if (allowRelationConnect && usesNestedRelationData(data, model)) {
    const explicitOrganizationId = typeof data.organizationId === "string" ? data.organizationId : organizationId;
    const { organizationId: _organizationId, ...rest } = data;

    return {
      ...rest,
      organization: { connect: { id: explicitOrganizationId } }
    };
  }

  if (hasOwn(data, "organizationId")) {
    return data;
  }

  return {
    ...data,
    organizationId
  };
}

function createPrismaClient() {
  return new PrismaClient().$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const organizationId = getCurrentOrganizationId();
          if (!organizationId || !model || !tenantScopedModels.has(model)) {
            return query(args);
          }

          const scopedArgs = { ...(args as PrismaQueryArgs) };
          const uniqueWhereOperations = new Set([
            "findUnique",
            "findUniqueOrThrow",
            "update",
            "delete",
            "upsert"
          ]);
          const scopedWhereOperations = new Set([
            "findFirst",
            "findFirstOrThrow",
            "findMany",
            "count",
            "aggregate",
            "groupBy",
            "updateMany",
            "deleteMany"
          ]);

          if (uniqueWhereOperations.has(operation)) {
            scopedArgs.where = withTenantWhere(scopedArgs.where, organizationId, true);
          } else if (scopedWhereOperations.has(operation)) {
            scopedArgs.where = withTenantWhere(scopedArgs.where, organizationId);
          }

          if (operation === "create") {
            scopedArgs.data = withTenantData(scopedArgs.data, organizationId, model, true);
          }

          if (operation === "createMany") {
            scopedArgs.data = withTenantData(scopedArgs.data, organizationId);
          }

          if (operation === "upsert") {
            scopedArgs.create = withTenantData(scopedArgs.create, organizationId, model, true);
          }

          return query(scopedArgs as typeof args);
        }
      }
    }
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

export async function assertTenantScopedDatabaseSchema(client: PrismaClient) {
  const missing: string[] = [];

  for (const model of tenantScopedDatamodelModels) {
    const tableName = model.dbName ?? model.name;
    const rows = await client.$queryRawUnsafe<Array<{ column_name: string }>>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = 'organizationId'
      `,
      tableName
    );

    if (rows.length === 0) {
      missing.push(`${model.name} (${tableName})`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Tenant schema check failed. Missing organizationId column in: ${missing.join(", ")}`);
  }
}

if (process.env.APP_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
