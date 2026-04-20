import { Prisma } from "@prisma/client";

import type { AuthRepository, PasswordResetTokenRecord, RefreshTokenRecord, StoredUser } from "./types";

function isDatabaseUnavailableError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ["P1000", "P1001", "P1017"].includes(error.code);
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = `${error.name} ${error.message}`;
  return [
    "ECONNREFUSED",
    "Can't reach database server",
    "database server",
    "Connection refused"
  ].some((fragment) => message.includes(fragment));
}

export class ResilientAuthRepository implements AuthRepository {
  private warned = false;

  public constructor(
    private readonly primary: AuthRepository,
    private readonly fallback: AuthRepository | null,
    private readonly logger?: { warn: (message: string) => void }
  ) {}

  public findStoredUserByIdentifier(identifier: string) {
    return this.withFallback(
      () => this.primary.findStoredUserByIdentifier(identifier),
      () => this.fallback?.findStoredUserByIdentifier(identifier) ?? Promise.resolve(null)
    );
  }

  public findUserById(userId: string) {
    return this.withFallback(
      () => this.primary.findUserById(userId),
      () => this.fallback?.findUserById(userId) ?? Promise.resolve(null)
    );
  }

  public updateLastLoginAt(userId: string) {
    return this.withFallback(
      () => this.primary.updateLastLoginAt(userId),
      () => this.fallback?.updateLastLoginAt(userId) ?? Promise.resolve()
    );
  }

  public updatePassword(
    userId: string,
    passwordHash: string,
    options?: {
      emailConfirmedAt?: string;
      passwordResetRequired?: boolean;
    }
  ) {
    return this.withFallback(
      () => this.primary.updatePassword(userId, passwordHash, options),
      () => this.fallback?.updatePassword(userId, passwordHash, options) ?? Promise.resolve()
    );
  }

  public saveRefreshToken(record: RefreshTokenRecord) {
    return this.withFallback(
      () => this.primary.saveRefreshToken(record),
      () => this.fallback?.saveRefreshToken(record) ?? Promise.resolve()
    );
  }

  public revokeRefreshToken(tokenHash: string) {
    return this.withFallback(
      () => this.primary.revokeRefreshToken(tokenHash),
      () => this.fallback?.revokeRefreshToken(tokenHash) ?? Promise.resolve()
    );
  }

  public revokeRefreshTokensForUser(userId: string) {
    return this.withFallback(
      () => this.primary.revokeRefreshTokensForUser(userId),
      () => this.fallback?.revokeRefreshTokensForUser(userId) ?? Promise.resolve()
    );
  }

  public findRefreshToken(tokenHash: string) {
    return this.withFallback(
      () => this.primary.findRefreshToken(tokenHash),
      () => this.fallback?.findRefreshToken(tokenHash) ?? Promise.resolve(null)
    );
  }

  public savePasswordResetToken(record: PasswordResetTokenRecord) {
    return this.withFallback(
      () => this.primary.savePasswordResetToken(record),
      () => this.fallback?.savePasswordResetToken(record) ?? Promise.resolve()
    );
  }

  public revokeActivePasswordResetTokensForUser(userId: string) {
    return this.withFallback(
      () => this.primary.revokeActivePasswordResetTokensForUser(userId),
      () => this.fallback?.revokeActivePasswordResetTokensForUser(userId) ?? Promise.resolve()
    );
  }

  public findPasswordResetToken(tokenHash: string) {
    return this.withFallback(
      () => this.primary.findPasswordResetToken(tokenHash),
      () => this.fallback?.findPasswordResetToken(tokenHash) ?? Promise.resolve(null)
    );
  }

  public consumePasswordResetToken(tokenHash: string) {
    return this.withFallback(
      () => this.primary.consumePasswordResetToken(tokenHash),
      () => this.fallback?.consumePasswordResetToken(tokenHash) ?? Promise.resolve()
    );
  }

  private async withFallback<T>(primaryAction: () => Promise<T>, fallbackAction: () => Promise<T>) {
    try {
      return await primaryAction();
    } catch (error) {
      if (!this.fallback || !isDatabaseUnavailableError(error)) {
        throw error;
      }

      if (!this.warned) {
        this.warned = true;
        this.logger?.warn("Database unavailable. Using local development auth fallback.");
      }

      return fallbackAction();
    }
  }
}
