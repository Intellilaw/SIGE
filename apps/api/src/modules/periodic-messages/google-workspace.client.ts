import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { env } from "../../config/env";

export const GOOGLE_WORKSPACE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.send"
] as const;

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const TOKEN_CIPHER_VERSION = "v1";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

type GoogleOAuthCredentialBlock = {
  client_id?: string;
  client_secret?: string;
  redirect_uris?: string[];
};

type GoogleOAuthCredentialDocument = {
  web?: GoogleOAuthCredentialBlock;
  installed?: GoogleOAuthCredentialBlock;
};

export type GoogleOAuthCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GoogleOAuthState = {
  userId: string;
  organizationId: string;
  email: string;
  returnPath: string;
  expiresAt: number;
};

export type GoogleTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  grantedScopes: string[];
  expiresIn?: number;
};

export type GoogleUserProfile = {
  email: string;
  emailVerified: boolean;
};

export class GoogleWorkspaceClientError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 502
  ) {
    super(message);
    this.name = "GoogleWorkspaceClientError";
  }
}

let credentialsPromise: Promise<GoogleOAuthCredentials> | null = null;

function getDefaultLocalClientFile() {
  if (env.APP_ENV !== "local" || !process.env.LOCALAPPDATA) {
    return undefined;
  }

  return path.join(process.env.LOCALAPPDATA, "SIGE", "secrets", "google-oauth-client.json");
}

function getRedirectUri() {
  return env.GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI
    ?? `http://localhost:${env.API_PORT}/api/v1/google-workspace/oauth/callback`;
}

async function loadCredentials(): Promise<GoogleOAuthCredentials> {
  const redirectUri = getRedirectUri();
  const directClientId = env.GOOGLE_WORKSPACE_OAUTH_CLIENT_ID;
  const directClientSecret = env.GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET;

  if (directClientId || directClientSecret) {
    if (!directClientId || !directClientSecret) {
      throw new GoogleWorkspaceClientError(
        "GOOGLE_OAUTH_INCOMPLETE",
        "La configuración OAuth de Google Workspace está incompleta.",
        503
      );
    }

    return { clientId: directClientId, clientSecret: directClientSecret, redirectUri };
  }

  const credentialFile = env.GOOGLE_WORKSPACE_OAUTH_CLIENT_FILE ?? getDefaultLocalClientFile();
  if (!credentialFile) {
    throw new GoogleWorkspaceClientError(
      "GOOGLE_OAUTH_NOT_CONFIGURED",
      "Google Workspace todavía no tiene credenciales OAuth configuradas.",
      503
    );
  }

  let document: GoogleOAuthCredentialDocument;
  try {
    document = JSON.parse(await readFile(credentialFile, "utf8")) as GoogleOAuthCredentialDocument;
  } catch {
    throw new GoogleWorkspaceClientError(
      "GOOGLE_OAUTH_FILE_UNAVAILABLE",
      "No fue posible abrir las credenciales OAuth de Google Workspace.",
      503
    );
  }

  const block = document.web ?? document.installed;
  if (!block?.client_id || !block.client_secret) {
    throw new GoogleWorkspaceClientError(
      "GOOGLE_OAUTH_FILE_INVALID",
      "El archivo de credenciales OAuth de Google Workspace no es válido.",
      503
    );
  }

  if (block.redirect_uris?.length && !block.redirect_uris.includes(redirectUri)) {
    throw new GoogleWorkspaceClientError(
      "GOOGLE_OAUTH_REDIRECT_MISMATCH",
      `La URI de redirección ${redirectUri} no está registrada en Google Cloud.`,
      503
    );
  }

  return { clientId: block.client_id, clientSecret: block.client_secret, redirectUri };
}

export function getGoogleOAuthCredentials() {
  credentialsPromise ??= loadCredentials();
  return credentialsPromise;
}

export async function getGoogleWorkspaceConfigurationStatus() {
  try {
    const credentials = await getGoogleOAuthCredentials();
    return { configured: true, redirectUri: credentials.redirectUri, error: null };
  } catch (error) {
    return {
      configured: false,
      redirectUri: getRedirectUri(),
      error: error instanceof Error ? error.message : "Google Workspace no está configurado."
    };
  }
}

function stateSigningKey() {
  return env.GOOGLE_WORKSPACE_TOKEN_ENCRYPTION_SECRET ?? env.JWT_REFRESH_SECRET;
}

export function createGoogleOAuthState(input: Omit<GoogleOAuthState, "expiresAt">) {
  const payload: GoogleOAuthState = {
    ...input,
    expiresAt: Math.floor(Date.now() / 1000) + OAUTH_STATE_TTL_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", stateSigningKey()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function parseGoogleOAuthState(value: string): GoogleOAuthState {
  const [encodedPayload, encodedSignature, ...rest] = value.split(".");
  if (!encodedPayload || !encodedSignature || rest.length > 0) {
    throw new GoogleWorkspaceClientError("GOOGLE_OAUTH_STATE_INVALID", "La autorización de Google no es válida.", 400);
  }

  const expectedSignature = createHmac("sha256", stateSigningKey()).update(encodedPayload).digest();
  const receivedSignature = Buffer.from(encodedSignature, "base64url");
  if (receivedSignature.length !== expectedSignature.length || !timingSafeEqual(receivedSignature, expectedSignature)) {
    throw new GoogleWorkspaceClientError("GOOGLE_OAUTH_STATE_INVALID", "La autorización de Google no es válida.", 400);
  }

  let payload: GoogleOAuthState;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as GoogleOAuthState;
  } catch {
    throw new GoogleWorkspaceClientError("GOOGLE_OAUTH_STATE_INVALID", "La autorización de Google no es válida.", 400);
  }

  if (
    !payload.userId
    || !payload.organizationId
    || !payload.email
    || !payload.returnPath
    || !Number.isInteger(payload.expiresAt)
    || payload.expiresAt < Math.floor(Date.now() / 1000)
  ) {
    throw new GoogleWorkspaceClientError("GOOGLE_OAUTH_STATE_EXPIRED", "La autorización de Google expiró. Inténtalo nuevamente.", 400);
  }

  return payload;
}

export async function buildGoogleAuthorizationUrl(state: string, loginHint?: string) {
  const credentials = await getGoogleOAuthCredentials();
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("redirect_uri", credentials.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", GOOGLE_WORKSPACE_SCOPES.join(" "));
  url.searchParams.set("state", state);
  if (loginHint?.endsWith("@rusconi.law")) {
    url.searchParams.set("login_hint", loginHint);
  }
  url.searchParams.set("hd", "rusconi.law");
  return url.toString();
}

function googleErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.error_description === "string") {
    return record.error_description;
  }
  if (record.error && typeof record.error === "object") {
    const nestedMessage = (record.error as Record<string, unknown>).message;
    if (typeof nestedMessage === "string") {
      return nestedMessage;
    }
  }
  if (typeof record.error === "string") {
    return record.error;
  }
  return fallback;
}

async function readGoogleJson(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

export async function exchangeGoogleAuthorizationCode(code: string): Promise<GoogleTokenResponse> {
  const credentials = await getGoogleOAuthCredentials();
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: credentials.redirectUri
    })
  });
  const payload = await readGoogleJson(response) as Record<string, unknown> | null;
  if (!response.ok || !payload || typeof payload.access_token !== "string") {
    throw new GoogleWorkspaceClientError(
      "GOOGLE_OAUTH_EXCHANGE_FAILED",
      googleErrorMessage(payload, "Google no pudo completar la autorización."),
      400
    );
  }

  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
    grantedScopes: typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : [],
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : undefined
  };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const credentials = await getGoogleOAuthCredentials();
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const payload = await readGoogleJson(response) as Record<string, unknown> | null;
  if (!response.ok || !payload || typeof payload.access_token !== "string") {
    const message = googleErrorMessage(payload, "Google rechazó la autorización almacenada.");
    const isInvalidGrant = payload?.error === "invalid_grant";
    throw new GoogleWorkspaceClientError(
      isInvalidGrant ? "GOOGLE_OAUTH_REAUTH_REQUIRED" : "GOOGLE_OAUTH_REFRESH_FAILED",
      message,
      isInvalidGrant ? 401 : 502
    );
  }

  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
    grantedScopes: typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : [],
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : undefined
  };
}

export async function getGoogleUserProfile(accessToken: string): Promise<GoogleUserProfile> {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await readGoogleJson(response) as Record<string, unknown> | null;
  if (!response.ok || !payload || typeof payload.email !== "string") {
    throw new GoogleWorkspaceClientError(
      "GOOGLE_USERINFO_FAILED",
      googleErrorMessage(payload, "No fue posible verificar la cuenta de Google."),
      400
    );
  }

  return {
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true
  };
}

function tokenEncryptionKey() {
  return createHash("sha256").update(stateSigningKey(), "utf8").digest();
}

export function encryptGoogleRefreshToken(refreshToken: string, email: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(email.toLowerCase(), "utf8"));
  const ciphertext = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [TOKEN_CIPHER_VERSION, iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptGoogleRefreshToken(value: string, email: string) {
  const [version, encodedIv, encodedAuthTag, encodedCiphertext, ...rest] = value.split(".");
  if (version !== TOKEN_CIPHER_VERSION || !encodedIv || !encodedAuthTag || !encodedCiphertext || rest.length > 0) {
    throw new GoogleWorkspaceClientError("GOOGLE_TOKEN_INVALID", "La autorización almacenada no es válida.", 500);
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", tokenEncryptionKey(), Buffer.from(encodedIv, "base64url"));
    decipher.setAAD(Buffer.from(email.toLowerCase(), "utf8"));
    decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new GoogleWorkspaceClientError("GOOGLE_TOKEN_DECRYPT_FAILED", "No fue posible abrir la autorización almacenada.", 500);
  }
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(sanitizeHeader(value), "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? value;
}

export function buildTestMessageRaw(senderEmail: string, senderName: string) {
  const subject = "Prueba de conexión de SIGE con Google Workspace";
  const body = [
    `Hola ${senderName},`,
    "",
    "Este correo confirma que SIGE puede enviar mensajes mediante tu cuenta de Google Workspace.",
    "",
    "La prueba fue enviada únicamente a tu propia dirección.",
    "",
    "SIGE"
  ].join("\r\n");
  const mime = [
    `From: ${encodeHeader(senderName)} <${sanitizeHeader(senderEmail)}>`,
    `To: ${sanitizeHeader(senderEmail)}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(body, "utf8").toString("base64"))
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

export function buildPeriodicMessageRaw(input: {
  senderEmail: string; to: string[]; cc: string[]; bcc: string[];
  subject: string; bodyHtml: string; signatureText?: string | null;
}) {
  const body = `${input.bodyHtml}${input.signatureText ? `<br><br>${input.signatureText.replace(/\n/g, "<br>")}` : ""}`;
  const headers = [
    `From: <${sanitizeHeader(input.senderEmail)}>`,
    `To: ${input.to.map(sanitizeHeader).join(", ")}`,
    input.cc.length ? `Cc: ${input.cc.map(sanitizeHeader).join(", ")}` : null,
    input.bcc.length ? `Bcc: ${input.bcc.map(sanitizeHeader).join(", ")}` : null,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64", "",
    wrapBase64(Buffer.from(body, "utf8").toString("base64"))
  ].filter((value): value is string => value !== null);
  return Buffer.from(headers.join("\r\n"), "utf8").toString("base64url");
}

export async function sendGoogleGmailRawMessage(accessToken: string, raw: string) {
  const response = await fetch(GOOGLE_GMAIL_SEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  });
  const payload = await readGoogleJson(response) as Record<string, unknown> | null;
  if (!response.ok || !payload || typeof payload.id !== "string") {
    throw new GoogleWorkspaceClientError(
      "GOOGLE_GMAIL_SEND_FAILED",
      googleErrorMessage(payload, "Gmail no pudo enviar el mensaje de prueba."),
      response.status === 401 ? 401 : 502
    );
  }

  return {
    messageId: payload.id,
    threadId: typeof payload.threadId === "string" ? payload.threadId : null
  };
}

export async function revokeGoogleToken(token: string) {
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token })
  });

  if (!response.ok && response.status !== 400) {
    throw new GoogleWorkspaceClientError(
      "GOOGLE_OAUTH_REVOKE_FAILED",
      "Google no pudo revocar la autorización en este momento.",
      502
    );
  }
}
