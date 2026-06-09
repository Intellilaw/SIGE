import { Prisma, type PrismaClient } from "@prisma/client";

import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import type {
  GeneralSupervisionObservationActor,
  GeneralSupervisionObservationSetting,
  GeneralSupervisionPreferencesRepository
} from "./types";

function getActorName(actor: GeneralSupervisionObservationActor) {
  return actor.shortName || actor.displayName || actor.username || actor.email || null;
}

function mapObservedUserSetting(record: {
  organizationId: string;
  userId: string;
  isObserved: boolean;
  updatedByUserId: string | null;
  updatedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): GeneralSupervisionObservationSetting {
  return {
    organizationId: record.organizationId,
    userId: record.userId,
    isObserved: record.isObserved,
    updatedByUserId: record.updatedByUserId ?? undefined,
    updatedByName: record.updatedByName ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export class PrismaGeneralSupervisionPreferencesRepository implements GeneralSupervisionPreferencesRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listObservedUsers() {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const records = await this.prisma.$queryRaw<Array<{
      organizationId: string;
      userId: string;
      isObserved: boolean;
      updatedByUserId: string | null;
      updatedByName: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>>(Prisma.sql`
      SELECT
        "organizationId",
        "userId",
        "isObserved",
        "updatedByUserId",
        "updatedByName",
        "createdAt",
        "updatedAt"
      FROM "GeneralSupervisionObservedUser"
      WHERE "organizationId" = ${organizationId}
      ORDER BY "updatedAt" DESC
    `);

    return records.map(mapObservedUserSetting);
  }

  public async setObservedUser(
    observedUserId: string,
    isObserved: boolean,
    actor: GeneralSupervisionObservationActor
  ) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const actorName = getActorName(actor);
    const [record] = await this.prisma.$queryRaw<Array<{
      organizationId: string;
      userId: string;
      isObserved: boolean;
      updatedByUserId: string | null;
      updatedByName: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>>(Prisma.sql`
      INSERT INTO "GeneralSupervisionObservedUser" (
        "organizationId",
        "userId",
        "isObserved",
        "updatedByUserId",
        "updatedByName",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${organizationId},
        ${observedUserId},
        ${isObserved},
        ${actor.userId},
        ${actorName},
        now(),
        now()
      )
      ON CONFLICT ("organizationId", "userId") DO UPDATE SET
        "isObserved" = EXCLUDED."isObserved",
        "updatedByUserId" = EXCLUDED."updatedByUserId",
        "updatedByName" = EXCLUDED."updatedByName",
        "updatedAt" = now()
      RETURNING
        "organizationId",
        "userId",
        "isObserved",
        "updatedByUserId",
        "updatedByName",
        "createdAt",
        "updatedAt"
    `);

    return mapObservedUserSetting(record);
  }
}
