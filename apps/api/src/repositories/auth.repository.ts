import type { PrismaClient } from "@prisma/client";
import { buildLegacyEmail, buildLegacyUsernameLookupCandidates } from "@sige/contracts";

import { mapPasswordResetToken, mapRefreshToken, mapStoredUser, mapUser } from "./mappers";
import type { AuthRepository, PasswordResetTokenRecord, RefreshTokenRecord } from "./types";

export class PrismaAuthRepository implements AuthRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findStoredUserByIdentifier(identifier: string) {
    const normalizedIdentifier = identifier.trim();
    const normalizedEmail = buildLegacyEmail(normalizedIdentifier);
    const usernameCandidates = buildLegacyUsernameLookupCandidates(normalizedIdentifier);
    const record = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [
          { email: normalizedEmail },
          ...usernameCandidates.map((username) => ({
            username: {
              equals: username,
              mode: "insensitive" as const
            }
          }))
        ]
      }
    });
    return record ? mapStoredUser(record) : null;
  }

  public async findUserById(userId: string) {
    const record = await this.prisma.user.findUnique({ where: { id: userId } });
    return record ? mapUser(record) : null;
  }

  public async updateLastLoginAt(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date()
      }
    });
  }

  public async updatePassword(
    userId: string,
    passwordHash: string,
    options?: {
      emailConfirmedAt?: string;
      passwordResetRequired?: boolean;
    }
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        emailConfirmedAt: options?.emailConfirmedAt ? new Date(options.emailConfirmedAt) : undefined,
        passwordResetRequired: options?.passwordResetRequired
      }
    });
  }

  public async saveRefreshToken(record: RefreshTokenRecord) {
    await this.prisma.refreshToken.create({
      data: {
        id: record.id,
        userId: record.userId,
        tokenHash: record.tokenHash,
        expiresAt: new Date(record.expiresAt),
        revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
        createdAt: new Date(record.createdAt)
      }
    });
  }

  public async revokeRefreshToken(tokenHash: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  public async revokeRefreshTokensForUser(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  public async findRefreshToken(tokenHash: string) {
    const record = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    return record ? mapRefreshToken(record) : null;
  }

  public async savePasswordResetToken(record: PasswordResetTokenRecord) {
    await this.prisma.passwordResetToken.create({
      data: {
        id: record.id,
        userId: record.userId,
        tokenHash: record.tokenHash,
        purpose: record.purpose,
        expiresAt: new Date(record.expiresAt),
        consumedAt: record.consumedAt ? new Date(record.consumedAt) : null,
        createdAt: new Date(record.createdAt)
      }
    });
  }

  public async revokeActivePasswordResetTokensForUser(userId: string) {
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId,
        consumedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      data: {
        consumedAt: new Date()
      }
    });
  }

  public async findPasswordResetToken(tokenHash: string) {
    const record = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        consumedAt: null,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    return record ? mapPasswordResetToken(record) : null;
  }

  public async consumePasswordResetToken(tokenHash: string) {
    await this.prisma.passwordResetToken.updateMany({
      where: {
        tokenHash,
        consumedAt: null
      },
      data: {
        consumedAt: new Date()
      }
    });
  }
}
