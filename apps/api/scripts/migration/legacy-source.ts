import { readFile } from "node:fs/promises";
import path from "node:path";

export interface LegacyCredentials {
  supabaseUrl: string;
  supabaseAnonKey: string;
  username: string;
  password: string;
}

export interface LegacySession {
  accessToken: string;
  userEmail: string | null;
}

function requireMatch(contents: string, expression: RegExp, label: string) {
  const match = contents.match(expression)?.[1]?.trim();
  if (!match) {
    throw new Error(`Unable to read ${label} from the Intranet configuration.`);
  }

  return match;
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

export async function readLegacyCredentials(sourceRoot: string): Promise<LegacyCredentials> {
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

export async function signInLegacy(credentials: LegacyCredentials): Promise<LegacySession> {
  const response = await fetch(`${credentials.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: credentials.supabaseAnonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: toLegacyEmail(credentials.username),
      password: credentials.password
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `Legacy login failed with status ${response.status}: ${
        payload.error_description ?? payload.msg ?? "Unknown error"
      }`
    );
  }

  const accessToken = payload.access_token as string | undefined;
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

export async function fetchLegacyTableRows<T extends Record<string, unknown>>(
  credentials: LegacyCredentials,
  session: LegacySession,
  tableName: string,
  pageSize = 1000
) {
  const rows: T[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`${credentials.supabaseUrl}/rest/v1/${tableName}`);
    url.searchParams.set("select", "*");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: credentials.supabaseAnonKey,
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json"
      }
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(
        `Legacy table fetch failed for ${tableName} with status ${response.status}: ${
          payload.message ?? payload.error ?? "Unknown error"
        }`
      );
    }

    if (!Array.isArray(payload)) {
      throw new Error(`Legacy table ${tableName} returned an unexpected payload.`);
    }

    rows.push(...(payload as T[]));

    if (payload.length < pageSize) {
      break;
    }
  }

  return rows;
}
