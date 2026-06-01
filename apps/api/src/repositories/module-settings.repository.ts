import { Prisma, type PrismaClient } from "@prisma/client";
import type { SystemModuleSetting } from "@sige/contracts";

import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import type { ModuleSettingsActor, ModuleSettingsRepository } from "./types";

function getActorName(actor: ModuleSettingsActor) {
  return actor.shortName || actor.displayName || actor.username || actor.email || null;
}

function mapSystemModuleSetting(record: {
  organizationId: string;
  moduleId: string;
  isEnabled: boolean;
  updatedByUserId: string | null;
  updatedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SystemModuleSetting {
  return {
    organizationId: record.organizationId,
    moduleId: record.moduleId,
    isEnabled: record.isEnabled,
    updatedByUserId: record.updatedByUserId ?? undefined,
    updatedByName: record.updatedByName ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export class PrismaModuleSettingsRepository implements ModuleSettingsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const records = await this.prisma.$queryRaw<Array<{
      organizationId: string;
      moduleId: string;
      isEnabled: boolean;
      updatedByUserId: string | null;
      updatedByName: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>>(Prisma.sql`
      SELECT
        "organizationId",
        "moduleId",
        "isEnabled",
        "updatedByUserId",
        "updatedByName",
        "createdAt",
        "updatedAt"
      FROM "SystemModuleSetting"
      WHERE "organizationId" = ${organizationId}
      ORDER BY "moduleId" ASC
    `);

    return records.map(mapSystemModuleSetting);
  }

  public async setModuleEnabled(moduleId: string, isEnabled: boolean, actor: ModuleSettingsActor) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const actorName = getActorName(actor);
    const [record] = await this.prisma.$queryRaw<Array<{
      organizationId: string;
      moduleId: string;
      isEnabled: boolean;
      updatedByUserId: string | null;
      updatedByName: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>>(Prisma.sql`
      INSERT INTO "SystemModuleSetting" (
        "organizationId",
        "moduleId",
        "isEnabled",
        "updatedByUserId",
        "updatedByName",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${organizationId},
        ${moduleId},
        ${isEnabled},
        ${actor.userId},
        ${actorName},
        now(),
        now()
      )
      ON CONFLICT ("organizationId", "moduleId") DO UPDATE SET
        "isEnabled" = EXCLUDED."isEnabled",
        "updatedByUserId" = EXCLUDED."updatedByUserId",
        "updatedByName" = EXCLUDED."updatedByName",
        "updatedAt" = now()
      RETURNING
        "organizationId",
        "moduleId",
        "isEnabled",
        "updatedByUserId",
        "updatedByName",
        "createdAt",
        "updatedAt"
    `);

    return mapSystemModuleSetting(record);
  }
}
