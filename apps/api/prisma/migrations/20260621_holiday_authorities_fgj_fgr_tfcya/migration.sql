UPDATE "Matter"
SET "holidayAuthorityShortName" = 'TSJCDMX'
WHERE "holidayAuthorityShortName" = 'PJCDMX';

UPDATE "Holiday" h
SET
  "authorityShortName" = 'TSJCDMX',
  "authorityName" = 'Tribunal Superior de Justicia de la Ciudad de México'
WHERE h."authorityShortName" = 'PJCDMX'
  AND NOT EXISTS (
    SELECT 1
    FROM "Holiday" existing
    WHERE existing."organizationId" = h."organizationId"
      AND existing."authorityShortName" = 'TSJCDMX'
      AND existing."date" = h."date"
  );

DELETE FROM "Holiday" h
WHERE h."authorityShortName" = 'PJCDMX';
