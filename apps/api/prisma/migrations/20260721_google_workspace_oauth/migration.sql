CREATE TABLE "GoogleWorkspaceConnection" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "refreshTokenCiphertext" TEXT,
  "grantedScopes" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastValidatedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoogleWorkspaceConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleWorkspaceConnection_userId_key"
ON "GoogleWorkspaceConnection"("userId");

CREATE UNIQUE INDEX "GoogleWorkspaceConnection_organizationId_email_key"
ON "GoogleWorkspaceConnection"("organizationId", "email");

CREATE INDEX "GoogleWorkspaceConnection_organizationId_status_idx"
ON "GoogleWorkspaceConnection"("organizationId", "status");

ALTER TABLE "GoogleWorkspaceConnection"
ADD CONSTRAINT "GoogleWorkspaceConnection_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoogleWorkspaceConnection"
ADD CONSTRAINT "GoogleWorkspaceConnection_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
