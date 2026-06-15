import "dotenv/config";

import { assertDatabaseUrlAllowedForAppEnv } from "../../src/config/database-url-guard";

assertDatabaseUrlAllowedForAppEnv(process.env.DATABASE_URL, process.env.APP_ENV);
