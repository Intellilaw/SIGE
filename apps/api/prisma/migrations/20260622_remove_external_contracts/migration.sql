UPDATE "User"
SET "permissions" = COALESCE(
  (
    SELECT jsonb_agg(permission.value)
    FROM jsonb_array_elements("User"."permissions") AS permission(value)
    WHERE permission.value <> '"external-contracts:read"'::jsonb
      AND permission.value <> '"external-contracts:write"'::jsonb
  ),
  '[]'::jsonb
)
WHERE "permissions" @> '["external-contracts:read"]'::jsonb
   OR "permissions" @> '["external-contracts:write"]'::jsonb;

DELETE FROM "SystemModuleSetting"
WHERE "moduleId" = 'external-contracts';

DROP TABLE IF EXISTS "ExternalContractGeneratedDocument" CASCADE;
DROP TABLE IF EXISTS "ExternalContractRenewalDocument" CASCADE;
DROP TABLE IF EXISTS "ExternalContractMilestone" CASCADE;
DROP TABLE IF EXISTS "ExternalContractRenewal" CASCADE;
DROP TABLE IF EXISTS "ExternalContractInpc" CASCADE;
DROP TABLE IF EXISTS "ExternalContract" CASCADE;
