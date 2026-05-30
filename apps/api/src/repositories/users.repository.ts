import { Prisma, type PrismaClient } from "@prisma/client";
import { buildTaskModuleIdFromTeamKey } from "@sige/contracts";

import { mapManagedTeam, mapManagedUser } from "./mappers";
import { buildLaborFileSnapshot, buildLaborFileUserSyncSnapshot, shouldHaveLaborFile } from "./labor-files.repository";
import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import type { CreateManagedUserRecord, UpdateManagedUserRecord, UserTeamUpdateRecord, UserTeamWriteRecord, UsersRepository } from "./types";

function buildTeamTaskModuleSummary(label: string) {
  return `Espacio de tareas de ${label} pendiente de configuracion.`;
}

async function syncTeamTaskModuleDefinition(
  tx: Prisma.TransactionClient,
  team: {
    key: string;
    label: string;
  },
  options: { createIfMissing: boolean }
) {
  const moduleId = buildTaskModuleIdFromTeamKey(team.key);
  if (!moduleId) {
    return;
  }

  const summary = buildTeamTaskModuleSummary(team.label);

  if (options.createIfMissing) {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "TaskModule" ("id", "team", "label", "summary", "isActive", "deactivatedAt", "createdAt", "updatedAt")
      VALUES (${moduleId}, ${team.key}, ${team.label}, ${summary}, true, null, now(), now())
      ON CONFLICT ("id") DO UPDATE SET
        "team" = EXCLUDED."team",
        "label" = EXCLUDED."label",
        "summary" = EXCLUDED."summary",
        "isActive" = true,
        "deactivatedAt" = null,
        "updatedAt" = now()
    `);
    return;
  }

  await tx.$executeRaw(Prisma.sql`
    UPDATE "TaskModule"
    SET
      "team" = ${team.key},
      "label" = ${team.label},
      "summary" = ${summary},
      "updatedAt" = now()
    WHERE "id" = ${moduleId}
  `);
}

export class PrismaUsersRepository implements UsersRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    const records = await this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" }
    });
    return records.map(mapManagedUser);
  }

  public async findById(userId: string) {
    const record = await this.prisma.user.findUnique({ where: { id: userId } });
    return record ? mapManagedUser(record) : null;
  }

  public async create(payload: CreateManagedUserRecord) {
    const record = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId: payload.organizationId,
          email: payload.email,
          username: payload.username,
          displayName: payload.displayName ?? payload.username,
          shortName: payload.shortName ?? null,
          role: payload.role,
          legacyRole: payload.legacyRole,
          team: payload.team ?? null,
          legacyTeam: payload.legacyTeam ?? null,
          specificRole: payload.specificRole ?? null,
          permissions: payload.permissions,
          passwordHash: payload.passwordHash,
          isActive: true,
          passwordResetRequired: false,
          emailConfirmedAt: new Date()
        }
      });

      if (shouldHaveLaborFile(user)) {
        await tx.laborFile.create({
          data: {
            user: { connect: { id: user.id } },
            ...buildLaborFileSnapshot(user),
            status: "INCOMPLETE"
          }
        });
      }

      return user;
    });

    return mapManagedUser(record);
  }

  public async update(
    userId: string,
    payload: UpdateManagedUserRecord
  ) {
    const record = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          username: payload.username,
          displayName: payload.displayName,
          passwordHash: payload.passwordHash,
          shortName: payload.shortName === undefined ? undefined : payload.shortName,
          role: payload.role,
          legacyRole: payload.legacyRole,
          team: payload.team === undefined ? undefined : payload.team,
          legacyTeam: payload.legacyTeam === undefined ? undefined : payload.legacyTeam,
          specificRole: payload.specificRole === undefined ? undefined : payload.specificRole,
          permissions: payload.permissions,
          isActive: payload.isActive,
          passwordResetRequired: payload.passwordResetRequired,
          emailConfirmedAt: payload.emailConfirmedAt === undefined
            ? undefined
            : payload.emailConfirmedAt
              ? new Date(payload.emailConfirmedAt)
              : null
        }
      });

      if (shouldHaveLaborFile(user)) {
        await tx.laborFile.upsert({
          where: { userId: user.id },
          create: {
            user: { connect: { id: user.id } },
            ...buildLaborFileSnapshot(user),
            status: "INCOMPLETE"
          },
          update: buildLaborFileUserSyncSnapshot(user)
        });
      }

      return user;
    });

    return mapManagedUser(record);
  }

  public async delete(userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        return;
      }

      const laborFile = await tx.laborFile.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (laborFile) {
        await tx.laborFile.update({
          where: { id: laborFile.id },
          data: {
            ...buildLaborFileUserSyncSnapshot(user),
            employmentStatus: "FORMER",
            employmentEndedAt: new Date()
          }
        });
      }

      await tx.user.delete({ where: { id: userId } });
    });
  }

  public async listTeams() {
    const organizationId = getCurrentOrganizationIdOrDefault();
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "UserTeam" AS ut
      SET
        "executionSpaceEnabled" = true,
        "executionSpaceDeactivatedAt" = null
      WHERE ut."organizationId" = ${organizationId}
        AND ut."executionSpaceEnabled" = false
        AND ut."executionSpaceDeactivatedAt" IS NULL
        AND EXISTS (
          SELECT 1
          FROM "TaskModule" AS tm
          WHERE tm."team" = ut."key"
            AND tm."isActive" = true
        )
    `);

    const [records, activeUsers] = await this.prisma.$transaction([
      this.prisma.userTeam.findMany({
        orderBy: [
          { sortOrder: "asc" },
          { label: "asc" }
        ]
      }),
      this.prisma.user.findMany({
        where: {
          isActive: true,
          team: {
            not: null
          }
        },
        select: {
          team: true
        }
      })
    ]);
    const countByTeam = new Map<string, number>();
    for (const activeUser of activeUsers) {
      if (activeUser.team) {
        countByTeam.set(activeUser.team, (countByTeam.get(activeUser.team) ?? 0) + 1);
      }
    }

    return records.map((record) => mapManagedTeam(record, countByTeam.get(record.key) ?? 0));
  }

  public async createTeam(payload: UserTeamWriteRecord) {
    const maxSortOrder = await this.prisma.userTeam.aggregate({
      _max: {
        sortOrder: true
      }
    });
    const executionSpaceEnabled = payload.executionSpaceEnabled ?? false;
    const record = await this.prisma.$transaction(async (tx) => {
      const userTeam = await tx.userTeam.create({
        data: {
          key: payload.key,
          label: payload.label,
          sortOrder: payload.sortOrder ?? (maxSortOrder._max.sortOrder ?? 0) + 10,
          isActive: true,
          executionSpaceEnabled,
          executionSpaceDeactivatedAt: null
        }
      });

      if (executionSpaceEnabled) {
        await syncTeamTaskModuleDefinition(tx, userTeam, { createIfMissing: true });
      }

      return userTeam;
    });

    return mapManagedTeam(record, 0);
  }

  public async updateTeam(teamId: string, payload: UserTeamUpdateRecord) {
    const record = await this.prisma.$transaction(async (tx) => {
      const currentTeam = await tx.userTeam.findUnique({
        where: { id: teamId }
      });
      if (!currentTeam) {
        return null;
      }

      const nextLabel = payload.label === undefined ? undefined : payload.label;
      const nextIsActive = payload.isActive;
      const nextExecutionSpaceEnabled = payload.executionSpaceEnabled;
      const updatedTeam = await tx.userTeam.update({
        where: { id: teamId },
        data: {
          label: nextLabel,
          isActive: nextIsActive,
          deactivatedAt: nextIsActive === undefined
            ? undefined
            : nextIsActive
              ? null
              : (currentTeam.deactivatedAt ?? new Date()),
          executionSpaceEnabled: nextExecutionSpaceEnabled,
          executionSpaceDeactivatedAt: nextExecutionSpaceEnabled === undefined
            ? undefined
            : nextExecutionSpaceEnabled
              ? null
              : (currentTeam.executionSpaceEnabled
                ? new Date()
                : currentTeam.executionSpaceDeactivatedAt)
        }
      });
      const taskModuleId = buildTaskModuleIdFromTeamKey(updatedTeam.key);
      if (taskModuleId) {
        const shouldEnsureModule = updatedTeam.executionSpaceEnabled
          && (nextExecutionSpaceEnabled === true || nextLabel !== undefined || nextIsActive === true);
        const shouldSyncExistingModule = nextLabel !== undefined;

        if (shouldEnsureModule) {
          await syncTeamTaskModuleDefinition(tx, updatedTeam, { createIfMissing: true });
        } else if (shouldSyncExistingModule) {
          await syncTeamTaskModuleDefinition(tx, updatedTeam, { createIfMissing: false });
        }
      }

      if (nextLabel !== undefined && nextLabel !== currentTeam.label) {
        await tx.user.updateMany({
          where: { team: currentTeam.key },
          data: { legacyTeam: nextLabel }
        });
        await tx.laborFile.updateMany({
          where: { team: currentTeam.key },
          data: { legacyTeam: nextLabel }
        });
      }

      return updatedTeam;
    });

    if (!record) {
      return null;
    }

    const memberCount = await this.prisma.user.count({
      where: {
        isActive: true,
        team: record.key
      }
    });

    return mapManagedTeam(record, memberCount);
  }

  public async deactivateTeam(teamId: string) {
    return this.updateTeam(teamId, { isActive: false });
  }
}
