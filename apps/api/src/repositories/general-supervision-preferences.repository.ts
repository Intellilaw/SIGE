import { Prisma, type PrismaClient } from "@prisma/client";

import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import type {
  GeneralSupervisionObservationActor,
  GeneralSupervisionObservationSetting,
  GeneralSupervisionPreferencesRepository,
  KpiEmrtOverrideSetting
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

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function mapKpiOverride(record: {
  id: string;
  organizationId: string;
  userId: string;
  metricId: string;
  overrideDate: Date;
  revokedAt: Date | null;
  updatedAt: Date;
}): KpiEmrtOverrideSetting {
  return {
    id: record.id,
    organizationId: record.organizationId,
    userId: record.userId,
    metricId: record.metricId,
    date: record.overrideDate.toISOString().slice(0, 10),
    isExcluded: record.revokedAt === null,
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

  public async listKpiOverrides(startDate: string, endDate: string) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const records = await this.prisma.kpiEmrtOverride.findMany({
      where: {
        organizationId,
        overrideDate: {
          gte: dateFromKey(startDate),
          lte: dateFromKey(endDate)
        },
        revokedAt: null
      },
      orderBy: [{ overrideDate: "asc" }, { userId: "asc" }, { metricId: "asc" }]
    });

    return records.map(mapKpiOverride);
  }

  public async setKpiOverride(
    userId: string,
    metricId: string,
    date: string,
    isExcluded: boolean,
    actor: GeneralSupervisionObservationActor
  ) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const actorName = getActorName(actor);
    const now = new Date();
    const record = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.kpiEmrtOverride.upsert({
        where: {
          organizationId_userId_metricId_overrideDate: {
            organizationId,
            userId,
            metricId,
            overrideDate: dateFromKey(date)
          }
        },
        create: {
          organizationId,
          userId,
          metricId,
          overrideDate: dateFromKey(date),
          createdByUserId: actor.userId,
          createdByName: actorName,
          revokedAt: isExcluded ? null : now,
          revokedByUserId: isExcluded ? null : actor.userId,
          revokedByName: isExcluded ? null : actorName
        },
        update: isExcluded
          ? {
              createdByUserId: actor.userId,
              createdByName: actorName,
              revokedAt: null,
              revokedByUserId: null,
              revokedByName: null
            }
          : {
              revokedAt: now,
              revokedByUserId: actor.userId,
              revokedByName: actorName
            }
      });

      await transaction.auditLog.create({
        data: {
          organizationId,
          userId: actor.userId,
          action: isExcluded ? "KPI_EMRT_OVERRIDE_APPLIED" : "KPI_EMRT_OVERRIDE_REVOKED",
          entityType: "KpiEmrtOverride",
          entityId: saved.id,
          payload: {
            targetUserId: userId,
            metricId,
            date,
            isExcluded
          }
        }
      });

      return saved;
    });

    return mapKpiOverride(record);
  }
}
