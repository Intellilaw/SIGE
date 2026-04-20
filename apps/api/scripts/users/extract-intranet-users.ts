import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

interface LegacyCredentials {
  supabaseUrl: string;
  supabaseAnonKey: string;
  username: string;
  password: string;
}

interface LegacyUserRow {
  user_id: string;
  email: string;
  raw_role?: Record<string, unknown> | null;
  raw_user_metadata?: Record<string, unknown> | null;
  user_created_at?: string | null;
  last_login?: string | null;
}

function parseCommandLine() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDirectory, "../../../..");
  const { values } = parseArgs({
    options: {
      "source-root": { type: "string" },
      output: { type: "string" }
    },
    allowPositionals: false
  });

  return {
    repoRoot,
    sourceRoot: path.resolve(repoRoot, values["source-root"] ?? "../Intranet"),
    outputPath: path.resolve(
      repoRoot,
      values.output ?? "runtime-logs/intranet-users-export.json"
    )
  };
}

function requireMatch(contents: string, expression: RegExp, label: string) {
  const match = contents.match(expression)?.[1]?.trim();
  if (!match) {
    throw new Error(`Unable to read ${label} from the Intranet configuration.`);
  }

  return match;
}

async function readLegacyCredentials(sourceRoot: string): Promise<LegacyCredentials> {
  const envPath = path.join(sourceRoot, ".env");
  const adminConfigPath = path.join(sourceRoot, "src", "config", "admin.js");

  const [envContents, adminConfigContents] = await Promise.all([
    readFile(envPath, "utf8"),
    readFile(adminConfigPath, "utf8")
  ]);

  return {
    supabaseUrl: requireMatch(envContents, /^VITE_SUPABASE_URL=(.+)$/m, "VITE_SUPABASE_URL"),
    supabaseAnonKey: requireMatch(
      envContents,
      /^VITE_SUPABASE_ANON_KEY=(.+)$/m,
      "VITE_SUPABASE_ANON_KEY"
    ),
    username: requireMatch(adminConfigContents, /username:\s*"([^"]+)"/, "admin username"),
    password: requireMatch(adminConfigContents, /password:\s*"([^"]+)"/, "admin password")
  };
}

function toLegacyEmail(username: string) {
  const trimmed = username.trim();
  if (trimmed.includes("@")) {
    return trimmed;
  }

  const normalized = trimmed
    .replace(/\s+/g, ".")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return `${normalized}@calculadora.app`;
}

async function signIn({
  supabaseUrl,
  supabaseAnonKey,
  username,
  password
}: LegacyCredentials) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: toLegacyEmail(username),
      password
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `Legacy login failed with status ${response.status}: ${payload.error_description ?? payload.msg ?? "Unknown error"}`
    );
  }

  const accessToken = payload.access_token;
  const user = payload.user as { email?: string; user_metadata?: Record<string, unknown> } | undefined;
  const legacyRole =
    typeof user?.user_metadata?.role === "string" ? user.user_metadata.role : undefined;

  if (!accessToken) {
    throw new Error("Legacy login succeeded but no access token was returned.");
  }

  if (legacyRole !== "superadmin") {
    throw new Error("Legacy login succeeded, but the authenticated user is not a superadmin.");
  }

  return {
    accessToken,
    userEmail: user?.email ?? null
  };
}

async function fetchLegacyUsers(
  supabaseUrl: string,
  supabaseAnonKey: string,
  accessToken: string
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_users_admin`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: "{}"
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `Legacy RPC get_users_admin failed with status ${response.status}: ${payload.message ?? payload.error ?? "Unknown error"}`
    );
  }

  if (!Array.isArray(payload)) {
    throw new Error("Legacy RPC get_users_admin returned an unexpected payload.");
  }

  return payload as LegacyUserRow[];
}

function pickMeta(row: LegacyUserRow) {
  return (row.raw_role ?? row.raw_user_metadata ?? {}) as Record<string, unknown>;
}

function pickString(meta: Record<string, unknown>, key: string) {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDateTime(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unable to normalize legacy datetime value: ${value}`);
  }

  return parsed.toISOString();
}

function mapLegacyUsers(rows: LegacyUserRow[]) {
  return rows.map((row) => {
    const meta = pickMeta(row);
    const email = row.email.trim().toLowerCase();
    const fallbackName = email.split("@")[0];

    return {
      legacyUserId: row.user_id,
      email,
      username: pickString(meta, "username") ?? fallbackName,
      displayName:
        pickString(meta, "nombre") ??
        pickString(meta, "username") ??
        fallbackName,
      legacyRole: pickString(meta, "role"),
      legacyTeam: pickString(meta, "team"),
      specificRole: pickString(meta, "specific_role"),
      shortName: pickString(meta, "short_name")?.toUpperCase() ?? null,
      createdAt: normalizeDateTime(row.user_created_at),
      lastLoginAt: normalizeDateTime(row.last_login),
      emailConfirmedAt: null,
      rawUserMetaData: meta
    };
  });
}

async function main() {
  const { sourceRoot, outputPath } = parseCommandLine();
  const credentials = await readLegacyCredentials(sourceRoot);
  const session = await signIn(credentials);
  const rows = await fetchLegacyUsers(
    credentials.supabaseUrl,
    credentials.supabaseAnonKey,
    session.accessToken
  );
  const users = mapLegacyUsers(rows);

  const exportPayload = {
    source: "Intranet RPC get_users_admin",
    exportedAt: new Date().toISOString(),
    totalUsers: users.length,
    authenticatedAs: session.userEmail,
    users
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(exportPayload, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        totalUsers: users.length,
        outputPath
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
