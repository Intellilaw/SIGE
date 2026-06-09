CREATE TABLE "GeneralSupervisionObservedUser" (
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "userId" TEXT NOT NULL,
  "isObserved" BOOLEAN NOT NULL DEFAULT true,
  "updatedByUserId" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GeneralSupervisionObservedUser_pkey" PRIMARY KEY ("organizationId", "userId"),
  CONSTRAINT "GeneralSupervisionObservedUser_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GeneralSupervisionObservedUser_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "GeneralSupervisionObservedUser_organizationId_isObserved_idx"
  ON "GeneralSupervisionObservedUser"("organizationId", "isObserved");

CREATE INDEX "GeneralSupervisionObservedUser_userId_idx"
  ON "GeneralSupervisionObservedUser"("userId");
