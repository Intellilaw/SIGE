CREATE OR REPLACE FUNCTION fix_mojibake_text(input_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  decoded TEXT;
BEGIN
  IF input_text IS NULL OR input_text !~ '[ÃÂâ]' THEN
    RETURN input_text;
  END IF;

  BEGIN
    decoded := convert_from(convert_to(input_text, 'WIN1252'), 'UTF8');
    IF decoded LIKE '%�%' THEN
      RETURN input_text;
    END IF;
    RETURN decoded;
  EXCEPTION WHEN OTHERS THEN
    RETURN input_text;
  END;
END;
$$;

UPDATE "User"
SET
  "username" = fix_mojibake_text("username"),
  "displayName" = fix_mojibake_text("displayName"),
  "legacyTeam" = fix_mojibake_text("legacyTeam"),
  "secondaryLegacyTeam" = fix_mojibake_text("secondaryLegacyTeam"),
  "specificRole" = fix_mojibake_text("specificRole"),
  "secondarySpecificRole" = fix_mojibake_text("secondarySpecificRole")
WHERE
  coalesce("username", '') ~ '[ÃÂâ]'
  OR coalesce("displayName", '') ~ '[ÃÂâ]'
  OR coalesce("legacyTeam", '') ~ '[ÃÂâ]'
  OR coalesce("secondaryLegacyTeam", '') ~ '[ÃÂâ]'
  OR coalesce("specificRole", '') ~ '[ÃÂâ]'
  OR coalesce("secondarySpecificRole", '') ~ '[ÃÂâ]';

UPDATE "UserTeam"
SET "label" = fix_mojibake_text("label")
WHERE coalesce("label", '') ~ '[ÃÂâ]';

UPDATE "CommissionReceiver"
SET "name" = fix_mojibake_text("name")
WHERE coalesce("name", '') ~ '[ÃÂâ]';

DROP FUNCTION fix_mojibake_text(TEXT);
