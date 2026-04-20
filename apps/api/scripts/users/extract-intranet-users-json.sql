WITH intranet_users AS (
  SELECT
    au.id AS "legacyUserId",
    au.email AS "email",
    COALESCE(
      NULLIF(TRIM(au.raw_user_meta_data->>'username'), ''),
      SPLIT_PART(au.email, '@', 1)
    ) AS "username",
    COALESCE(
      NULLIF(TRIM(au.raw_user_meta_data->>'nombre'), ''),
      NULLIF(TRIM(au.raw_user_meta_data->>'username'), ''),
      SPLIT_PART(au.email, '@', 1)
    ) AS "displayName",
    LOWER(COALESCE(NULLIF(TRIM(au.raw_user_meta_data->>'role'), ''), 'public')) AS "legacyRole",
    NULLIF(TRIM(au.raw_user_meta_data->>'team'), '') AS "legacyTeam",
    NULLIF(TRIM(au.raw_user_meta_data->>'specific_role'), '') AS "specificRole",
    NULLIF(UPPER(TRIM(au.raw_user_meta_data->>'short_name')), '') AS "shortName",
    au.created_at AS "createdAt",
    au.last_sign_in_at AS "lastLoginAt",
    au.email_confirmed_at AS "emailConfirmedAt",
    au.raw_user_meta_data AS "rawUserMetaData"
  FROM auth.users AS au
  WHERE LOWER(COALESCE(NULLIF(TRIM(au.raw_user_meta_data->>'role'), ''), 'public')) IN ('superadmin', 'intranet')
)
SELECT jsonb_pretty(
  jsonb_build_object(
    'source',
    'Intranet',
    'exportedAt',
    NOW(),
    'totalUsers',
    (SELECT COUNT(*) FROM intranet_users),
    'users',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(intranet_users) ORDER BY "createdAt" DESC)
        FROM intranet_users
      ),
      '[]'::jsonb
    )
  )
);
