import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

import { AppError } from "../../core/errors/app-error";
import { assertStrongPassword } from "../../core/auth/password-policy";
import { verifyPassword, hashPassword } from "../../core/auth/passwords";
import { hashToken, issueTokenPair } from "../../core/auth/token-service";
import type { AuthRepository } from "../../repositories/types";

interface PasswordResetPreview {
  deliveryMode: "generic" | "development-preview";
  message: string;
  resetUrl?: string;
  expiresAt?: string;
}

export class AuthService {
  public constructor(private readonly repository: AuthRepository) {}

  public async login(identifier: string, password: string) {
    const user = await this.repository.findStoredUserByIdentifier(identifier);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
    }

    if (!user.isActive) {
      throw new AppError(403, "USER_INACTIVE", "This user account is inactive.");
    }

    if (user.passwordResetRequired) {
      throw new AppError(
        403,
        "PASSWORD_RESET_REQUIRED",
        "This account must activate or reset its password before entering SIGE_2."
      );
    }

    await this.repository.updateLastLoginAt(user.id);

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }

  public async getProfile(userId: string) {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User profile was not found.");
    }

    return user;
  }

  public async requestPasswordReset(
    identifier: string,
    appOrigin: string,
    ttlMinutes: number,
    options?: { exposePreview?: boolean }
  ) {
    const user = await this.repository.findStoredUserByIdentifier(identifier);

    if (!user || !user.isActive) {
      return this.buildGenericPasswordResetResponse();
    }

    return this.createPasswordResetToken(
      user.id,
      appOrigin,
      ttlMinutes,
      user.passwordResetRequired ? "ONBOARDING" : "PASSWORD_RESET",
      Boolean(options?.exposePreview)
    );
  }

  public async createPasswordResetLinkForUser(userId: string, appOrigin: string, ttlMinutes: number) {
    const user = await this.getProfile(userId);
    if (!user.isActive) {
      throw new AppError(403, "USER_INACTIVE", "Cannot create an onboarding link for an inactive account.");
    }

    const preview = await this.createPasswordResetToken(
      user.id,
      appOrigin,
      ttlMinutes,
      user.passwordResetRequired ? "ONBOARDING" : "PASSWORD_RESET",
      true
    );

    if (!preview.resetUrl || !preview.expiresAt) {
      throw new AppError(500, "PASSWORD_RESET_PREVIEW_UNAVAILABLE", "Unable to create a password reset link preview.");
    }

    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      passwordResetRequired: user.passwordResetRequired,
      ...preview
    };
  }

  public async verifyPasswordResetToken(rawToken: string) {
    const token = await this.findValidPasswordResetToken(rawToken);
    const user = await this.getProfile(token.userId);

    return {
      email: user.email,
      displayName: user.displayName,
      expiresAt: token.expiresAt,
      passwordResetRequired: user.passwordResetRequired
    };
  }

  public async completePasswordReset(app: FastifyInstance, rawToken: string, password: string) {
    assertStrongPassword(password);

    const token = await this.findValidPasswordResetToken(rawToken);
    const user = await this.getProfile(token.userId);

    if (!user.isActive) {
      throw new AppError(403, "USER_INACTIVE", "This user account is inactive.");
    }

    const now = new Date().toISOString();
    await this.repository.updatePassword(user.id, hashPassword(password), {
      emailConfirmedAt: now,
      passwordResetRequired: false
    });
    await this.repository.consumePasswordResetToken(hashToken(rawToken));
    await this.repository.revokeActivePasswordResetTokensForUser(user.id);
    await this.repository.revokeRefreshTokensForUser(user.id);

    const freshUser = await this.getProfile(user.id);
    const tokens = await issueTokenPair(app, this.repository, freshUser);

    return {
      user: freshUser,
      tokens
    };
  }

  private async createPasswordResetToken(
    userId: string,
    appOrigin: string,
    ttlMinutes: number,
    purpose: "ONBOARDING" | "PASSWORD_RESET",
    exposePreview: boolean
  ): Promise<PasswordResetPreview> {
    await this.repository.revokeActivePasswordResetTokensForUser(userId);

    const rawToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    await this.repository.savePasswordResetToken({
      id: randomUUID(),
      userId,
      tokenHash: hashToken(rawToken),
      purpose,
      expiresAt,
      consumedAt: null,
      createdAt: new Date().toISOString()
    });

    if (!exposePreview) {
      return this.buildGenericPasswordResetResponse();
    }

    return {
      deliveryMode: "development-preview",
      message:
        purpose === "ONBOARDING"
          ? "Password setup link generated. Share it securely with the user."
          : "Password reset link generated. Share it securely with the user.",
      resetUrl: this.buildResetUrl(appOrigin, rawToken),
      expiresAt
    };
  }

  private async findValidPasswordResetToken(rawToken: string) {
    if (!rawToken || rawToken.trim().length < 32) {
      throw new AppError(400, "INVALID_PASSWORD_RESET_TOKEN", "Reset token is invalid.");
    }

    const token = await this.repository.findPasswordResetToken(hashToken(rawToken));
    if (!token) {
      throw new AppError(400, "INVALID_PASSWORD_RESET_TOKEN", "Reset token is invalid or expired.");
    }

    return token;
  }

  private buildGenericPasswordResetResponse(): PasswordResetPreview {
    return {
      deliveryMode: "generic",
      message:
        "If the account exists and is active, SIGE_2 has registered the password reset request."
    };
  }

  private buildResetUrl(appOrigin: string, rawToken: string) {
    const baseOrigin = this.normalizeOrigin(appOrigin);
    const url = new URL("/intranet-reset-password", baseOrigin);
    url.searchParams.set("token", rawToken);
    return url.toString();
  }

  private normalizeOrigin(origin: string) {
    try {
      return new URL(origin).origin;
    } catch {
      return "http://localhost:5173";
    }
  }
}
