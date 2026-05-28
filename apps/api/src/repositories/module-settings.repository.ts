import { Prisma, type PrismaClient } from "@prisma/client";
import type { SystemModuleSetting } from "@sige/contracts";

import type { ModuleSettingsActor, ModuleSettingsRepository } from "./types";

function getActorName(actor: ModuleSettingsActor) {
  return actor.shortName || actor.displayName || actor.username || actor.email || null;
}

function mapSystemModuleSetting(record: {
  moduleId: string;
  isEnabled: boolean;
  updatedByUserId: string | null;
  updatedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SystemModuleSetting {
  return {
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
    const records = await this.prisma.$queryRaw<Array<{
      moduleId: string;
      isEnabled: boolean;
      updatedByUserId: string | null;
      updatedByName: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>>(Prisma.sql`
      SELECT
        "moduleId",
        "isEnabled",
        "updatedByUserId",
        "updatedByName",
        "createdAt",
        "updatedAt"
      FROM "SystemModuleSetting"
      ORDER BY "moduleId" ASC
    `);

    return records.map(mapSystemModuleSetting);
  }

  public async setModuleEnabled(moduleId: string, isEnabled: boolean, actor: ModuleSettingsActor) {
    const actorName = getActorName(actor);
    const [record] = await this.prisma.$queryRaw<Array<{
      moduleId: string;
      isEnabled: boolean;
      updatedByUserId: string | null;
      updatedByName: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>>(Prisma.sql`
      INSERT INTO "SystemModuleSetting" (
        "moduleId",
        "isEnabled",
        "updatedByUserId",
        "updatedByName",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${moduleId},
        ${isEnabled},
        ${actor.userId},
        ${actorName},
        now(),
        now()
      )
      ON CONFLICT ("moduleId") DO UPDATE SET
        "isEnabled" = EXCLUDED."isEnabled",
        "updatedByUserId" = EXCLUDED."updatedByUserId",
        "updatedByName" = EXCLUDED."updatedByName",
        "updatedAt" = now()
      RETURNING
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
