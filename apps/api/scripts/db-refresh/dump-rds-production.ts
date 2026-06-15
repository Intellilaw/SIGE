import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";

const readonlySecretId = "sige-prod-readonly-dump";
const expectedReadonlyUsername = "sige_readonly_dump";
const expectedProductionDatabase = "sige";
const defaultAwsProfile = "intellilaw-deploy";
const defaultAwsRegion = "us-east-1";
const defaultBastionInstanceId = "i-045e36a42b2b26aa9";
const defaultDumpPrefix = "prod-rds-readonly";
const defaultTimeoutSeconds = 7200;

const terminalSsmStatuses = new Set(["Success", "Cancelled", "TimedOut", "Failed", "Cancelling"]);

type AwsCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type DumpConfig = {
  awsProfile: string;
  awsRegion: string;
  bastionInstanceId: string;
  bucket: string;
  preflightOnly: boolean;
  prefix: string;
  timeoutSeconds: number;
};

type PublicAccessBlockResponse = {
  PublicAccessBlockConfiguration?: Partial<Record<"BlockPublicAcls" | "IgnorePublicAcls" | "BlockPublicPolicy" | "RestrictPublicBuckets", boolean>>;
};

type BucketPolicyStatusResponse = {
  PolicyStatus?: {
    IsPublic?: boolean;
  };
};

type BucketAclResponse = {
  Grants?: Array<{
    Grantee?: {
      URI?: string;
    };
  }>;
};

type BucketOwnershipControlsResponse = {
  OwnershipControls?: {
    Rules?: Array<{
      ObjectOwnership?: string;
    }>;
  };
};

type BucketEncryptionResponse = {
  ServerSideEncryptionConfiguration?: {
    Rules?: Array<{
      ApplyServerSideEncryptionByDefault?: {
        SSEAlgorithm?: string;
      };
    }>;
  };
};

type BucketLifecycleResponse = {
  Rules?: Array<{
    AbortIncompleteMultipartUpload?: {
      DaysAfterInitiation?: number;
    };
    Expiration?: {
      Days?: number;
    };
    Filter?: {
      Prefix?: string;
    };
    ID?: string;
    Prefix?: string;
    Status?: string;
  }>;
};

type SsmConnectionStatusResponse = {
  Status?: string;
};

type SendCommandResponse = {
  Command?: {
    CommandId?: string;
  };
};

type SsmInvocationResponse = {
  Status?: string;
  ResponseCode?: number;
  StandardOutputContent?: string;
  StandardErrorContent?: string;
};

function firstString(...values: Array<string | undefined>) {
  return values.find((value) => value?.trim())?.trim();
}

function stringOption(value: string | boolean | undefined) {
  return typeof value === "string" ? value : undefined;
}

function requireString(value: string | undefined, message: string) {
  if (!value?.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function parsePositiveInteger(value: string | undefined, fallback: number, label: string) {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}

function normalizeBucket(bucket: string) {
  const trimmed = bucket.trim();
  if (trimmed.startsWith("s3://") || trimmed.includes("/")) {
    throw new Error("SIGE_RDS_DUMP_BUCKET must be only the S3 bucket name, not an s3:// URI or path.");
  }

  return trimmed;
}

function normalizePrefix(prefix: string) {
  const normalized = prefix.trim().replace(/^\/+|\/+$/g, "");
  if (!normalized) {
    throw new Error("SIGE_RDS_DUMP_PREFIX cannot be empty.");
  }

  return normalized;
}

function parseCommandLine(): DumpConfig {
  const { values } = parseArgs({
    options: {
      "bastion-instance-id": { type: "string" },
      bucket: { type: "string" },
      "preflight-only": { type: "boolean" },
      prefix: { type: "string" },
      profile: { type: "string" },
      region: { type: "string" },
      "timeout-seconds": { type: "string" }
    },
    strict: true
  });

  const parsedValues = values as Record<string, string | boolean | undefined>;
  const bucket = firstString(stringOption(parsedValues.bucket), process.env.SIGE_RDS_DUMP_BUCKET);

  return {
    awsProfile: requireString(firstString(stringOption(parsedValues.profile), process.env.AWS_PROFILE, defaultAwsProfile), "AWS profile is required."),
    awsRegion: requireString(
      firstString(stringOption(parsedValues.region), process.env.AWS_REGION, process.env.AWS_DEFAULT_REGION, defaultAwsRegion),
      "AWS region is required."
    ),
    bastionInstanceId: requireString(
      firstString(
        stringOption(parsedValues["bastion-instance-id"]),
        process.env.SIGE_RDS_DUMP_BASTION_INSTANCE_ID,
        defaultBastionInstanceId
      ),
      "Bastion instance id is required."
    ),
    bucket: normalizeBucket(
      requireString(
        bucket,
        "SIGE_RDS_DUMP_BUCKET or --bucket is required. Use an existing private bucket; this script will not create one."
      )
    ),
    preflightOnly: parsedValues["preflight-only"] === true,
    prefix: normalizePrefix(firstString(stringOption(parsedValues.prefix), process.env.SIGE_RDS_DUMP_PREFIX, defaultDumpPrefix) ?? defaultDumpPrefix),
    timeoutSeconds: parsePositiveInteger(
      firstString(stringOption(parsedValues["timeout-seconds"]), process.env.SIGE_RDS_DUMP_TIMEOUT_SECONDS),
      defaultTimeoutSeconds,
      "Timeout seconds"
    )
  };
}

function assertLegacySourceUrlUnset() {
  if (process.env.RDS_SOURCE_DATABASE_URL?.trim()) {
    throw new Error(
      "RDS_SOURCE_DATABASE_URL is intentionally unsupported for db:rds:dump. " +
        `This flow uses only Secrets Manager secret ${readonlySecretId}.`
    );
  }
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function awsEnvironment(config: DumpConfig) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AWS_DEFAULT_REGION: config.awsRegion,
    AWS_PROFILE: config.awsProfile,
    AWS_REGION: config.awsRegion
  };

  delete env.DATABASE_URL;
  delete env.RDS_SOURCE_DATABASE_URL;
  delete env.PGPASSWORD;

  return env;
}

function describeAwsOperation(args: string[]) {
  return args.slice(0, 3).join(" ");
}

function runAws(args: string[], config: DumpConfig, allowFailure = false) {
  return new Promise<AwsCommandResult>((resolve, reject) => {
    const child = spawn("aws", args, {
      env: awsEnvironment(config),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.once("error", reject);

    child.once("exit", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (code === 0 || allowFailure) {
        resolve({ exitCode: code, stdout, stderr });
        return;
      }

      reject(
        new Error(
          `aws ${describeAwsOperation(args)} failed with code ${code ?? "unknown"}.` +
            (stderr ? `\n${stderr}` : "")
        )
      );
    });
  });
}

async function runAwsJson<T>(args: string[], config: DumpConfig) {
  const result = await runAws(args, config);

  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(`aws ${describeAwsOperation(args)} did not return valid JSON.`);
  }
}

async function assertReadonlySecretExists(config: DumpConfig) {
  await runAwsJson<unknown>(
    [
      "secretsmanager",
      "describe-secret",
      "--region",
      config.awsRegion,
      "--secret-id",
      readonlySecretId,
      "--query",
      "{Name:Name,ARN:ARN,KmsKeyId:KmsKeyId}",
      "--output",
      "json"
    ],
    config
  );
}

async function assertBastionIsConnected(config: DumpConfig) {
  const status = await runAwsJson<SsmConnectionStatusResponse>(
    [
      "ssm",
      "get-connection-status",
      "--region",
      config.awsRegion,
      "--target",
      config.bastionInstanceId,
      "--output",
      "json"
    ],
    config
  );

  if (status.Status !== "connected") {
    throw new Error(`SSM bastion ${config.bastionInstanceId} is not connected. Current status: ${status.Status ?? "unknown"}.`);
  }
}

async function assertBucketIsPrivate(config: DumpConfig) {
  await runAws(["s3api", "head-bucket", "--bucket", config.bucket], config);

  const publicAccessBlock = await runAwsJson<PublicAccessBlockResponse>(
    ["s3api", "get-public-access-block", "--bucket", config.bucket, "--output", "json"],
    config
  );
  const blockConfig = publicAccessBlock.PublicAccessBlockConfiguration;
  const requiredBlockFlags = ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"] as const;
  const missingBlockFlags = requiredBlockFlags.filter((flag) => blockConfig?.[flag] !== true);

  if (missingBlockFlags.length > 0) {
    throw new Error(
      `S3 bucket ${config.bucket} must have full Public Access Block enabled. Missing/false: ${missingBlockFlags.join(", ")}.`
    );
  }

  const policyStatusResult = await runAws(
    ["s3api", "get-bucket-policy-status", "--bucket", config.bucket, "--output", "json"],
    config,
    true
  );

  if (policyStatusResult.exitCode === 0) {
    let policyStatus: BucketPolicyStatusResponse;
    try {
      policyStatus = JSON.parse(policyStatusResult.stdout) as BucketPolicyStatusResponse;
    } catch {
      throw new Error("S3 bucket policy status did not return valid JSON.");
    }

    if (policyStatus.PolicyStatus?.IsPublic !== false) {
      throw new Error(`S3 bucket ${config.bucket} must not have a public bucket policy.`);
    }
  } else if (!policyStatusResult.stderr.includes("NoSuchBucketPolicy")) {
    throw new Error(`S3 bucket ${config.bucket} must not have a public bucket policy.`);
  }

  const acl = await runAwsJson<BucketAclResponse>(["s3api", "get-bucket-acl", "--bucket", config.bucket, "--output", "json"], config);
  const publicAclGrant = acl.Grants?.find((grant) => {
    const uri = grant.Grantee?.URI ?? "";
    return uri.endsWith("/AllUsers") || uri.endsWith("/AuthenticatedUsers");
  });
  if (publicAclGrant) {
    throw new Error(`S3 bucket ${config.bucket} must not have public ACL grants.`);
  }

  const ownershipControls = await runAwsJson<BucketOwnershipControlsResponse>(
    ["s3api", "get-bucket-ownership-controls", "--bucket", config.bucket, "--output", "json"],
    config
  );
  const hasBucketOwnerEnforced = ownershipControls.OwnershipControls?.Rules?.some(
    (rule) => rule.ObjectOwnership === "BucketOwnerEnforced"
  );
  if (!hasBucketOwnerEnforced) {
    throw new Error(`S3 bucket ${config.bucket} must have ObjectOwnership=BucketOwnerEnforced so ACLs are disabled.`);
  }

  const encryption = await runAwsJson<BucketEncryptionResponse>(
    ["s3api", "get-bucket-encryption", "--bucket", config.bucket, "--output", "json"],
    config
  );
  const hasSseS3DefaultEncryption = encryption.ServerSideEncryptionConfiguration?.Rules?.some(
    (rule) => rule.ApplyServerSideEncryptionByDefault?.SSEAlgorithm === "AES256"
  );
  if (!hasSseS3DefaultEncryption) {
    throw new Error(`S3 bucket ${config.bucket} must have default SSE-S3 encryption enabled.`);
  }

  const lifecycle = await runAwsJson<BucketLifecycleResponse>(
    ["s3api", "get-bucket-lifecycle-configuration", "--bucket", config.bucket, "--output", "json"],
    config
  );
  const expectedLifecyclePrefix = `${config.prefix}/`;
  const hasDumpLifecycle = lifecycle.Rules?.some((rule) => {
    const prefix = rule.Filter?.Prefix ?? rule.Prefix;
    const expirationDays = rule.Expiration?.Days;
    const multipartDays = rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation;

    return (
      rule.Status === "Enabled" &&
      prefix === expectedLifecyclePrefix &&
      typeof expirationDays === "number" &&
      expirationDays <= 7 &&
      typeof multipartDays === "number" &&
      multipartDays <= 1
    );
  });
  if (!hasDumpLifecycle) {
    throw new Error(
      `S3 bucket ${config.bucket} must have an enabled lifecycle rule for ${expectedLifecyclePrefix} ` +
        "that expires objects after 7 days or less and aborts multipart uploads after 1 day or less."
    );
  }
}

function buildRemoteDumpScript(config: DumpConfig) {
  return `set -euo pipefail
umask 077

AWS_REGION=${shellQuote(config.awsRegion)}
SECRET_ID=${shellQuote(readonlySecretId)}
EXPECTED_USERNAME=${shellQuote(expectedReadonlyUsername)}
EXPECTED_DBNAME=${shellQuote(expectedProductionDatabase)}
DUMP_BUCKET=${shellQuote(config.bucket)}
DUMP_PREFIX=${shellQuote(config.prefix)}
DUMP_ID="sige-prod-readonly-$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_PATH="/tmp/\${DUMP_ID}.dump"
SHA_PATH="\${DUMP_PATH}.sha256"
OBJECT_KEY="\${DUMP_PREFIX}/\${DUMP_ID}.dump"
S3_URI="s3://\${DUMP_BUCKET}/\${OBJECT_KEY}"

cleanup() {
  rm -f "$DUMP_PATH" "$SHA_PATH"
  unset PGPASSWORD SECRET_JSON PG_EXPORTS
}
trap cleanup EXIT

command -v aws >/dev/null
command -v pg_dump >/dev/null
command -v python3 >/dev/null
command -v sha256sum >/dev/null

SECRET_JSON="$(aws secretsmanager get-secret-value --region "$AWS_REGION" --secret-id "$SECRET_ID" --query SecretString --output text)"
export SECRET_JSON EXPECTED_USERNAME EXPECTED_DBNAME

PG_EXPORTS="$(python3 - <<'PY'
import json
import os
import shlex

secret = json.loads(os.environ["SECRET_JSON"])
expected_username = os.environ["EXPECTED_USERNAME"]
expected_dbname = os.environ["EXPECTED_DBNAME"]
required_keys = ["host", "port", "dbname", "username", "password", "engine", "sslmode"]
missing_keys = [key for key in required_keys if secret.get(key) in (None, "")]
if missing_keys:
    raise SystemExit("Readonly dump secret is missing required keys: " + ", ".join(missing_keys))

username = str(secret["username"])
if username == "sige_admin":
    raise SystemExit("Refusing to use master user sige_admin")
if username != expected_username:
    raise SystemExit("Readonly dump secret username is not " + expected_username)

dbname = str(secret["dbname"])
if dbname != expected_dbname:
    raise SystemExit("Readonly dump secret dbname is not " + expected_dbname)

engine = str(secret["engine"]).lower()
if engine not in ("postgres", "postgresql"):
    raise SystemExit("Readonly dump secret engine is not PostgreSQL")

exports = {
    "PGHOST": secret["host"],
    "PGPORT": str(secret["port"]),
    "PGDATABASE": dbname,
    "PGUSER": username,
    "PGPASSWORD": secret["password"],
    "PGSSLMODE": str(secret["sslmode"]),
}
for key, value in exports.items():
    print("export " + key + "=" + shlex.quote(str(value)))
PY
)"
eval "$PG_EXPORTS"
unset SECRET_JSON PG_EXPORTS

echo "Running readonly pg_dump as \${PGUSER} against database \${PGDATABASE}"
pg_dump --format=custom --no-owner --no-privileges --schema=public --file "$DUMP_PATH"
DUMP_BYTES="$(wc -c < "$DUMP_PATH" | tr -d ' ')"
sha256sum "$DUMP_PATH" > "$SHA_PATH"

aws s3 cp "$DUMP_PATH" "$S3_URI" --sse AES256 --only-show-errors
aws s3 cp "$SHA_PATH" "\${S3_URI}.sha256" --sse AES256 --only-show-errors

DUMP_SSE="$(aws s3api head-object --bucket "$DUMP_BUCKET" --key "$OBJECT_KEY" --query ServerSideEncryption --output text)"
SHA_SSE="$(aws s3api head-object --bucket "$DUMP_BUCKET" --key "\${OBJECT_KEY}.sha256" --query ServerSideEncryption --output text)"
if [ -z "$DUMP_SSE" ] || [ "$DUMP_SSE" = "None" ] || [ -z "$SHA_SSE" ] || [ "$SHA_SSE" = "None" ]; then
  echo "Uploaded dump objects are not encrypted" >&2
  exit 1
fi

DUMP_SHA256="$(cut -d ' ' -f 1 "$SHA_PATH")"
cleanup
if [ -e "$DUMP_PATH" ] || [ -e "$SHA_PATH" ]; then
  echo "Temporary dump files were not deleted from bastion /tmp" >&2
  exit 1
fi

echo "S3_URI=\${S3_URI}"
echo "SHA256_URI=\${S3_URI}.sha256"
echo "S3_ENCRYPTION=\${DUMP_SSE}"
echo "DUMP_BYTES=\${DUMP_BYTES}"
echo "DUMP_SHA256=\${DUMP_SHA256}"
echo "TEMP_CLEANUP=passed"
`;
}

async function sendDumpCommand(config: DumpConfig) {
  const response = await runAwsJson<SendCommandResponse>(
    [
      "ssm",
      "send-command",
      "--region",
      config.awsRegion,
      "--instance-ids",
      config.bastionInstanceId,
      "--document-name",
      "AWS-RunShellScript",
      "--comment",
      `SIGE readonly RDS dump via ${readonlySecretId}`,
      "--timeout-seconds",
      String(config.timeoutSeconds),
      "--parameters",
      JSON.stringify({ commands: [buildRemoteDumpScript(config)] }),
      "--output",
      "json"
    ],
    config
  );

  const commandId = response.Command?.CommandId;
  if (!commandId) {
    throw new Error("SSM did not return a command id.");
  }

  return commandId;
}

async function getInvocation(commandId: string, config: DumpConfig) {
  return runAwsJson<SsmInvocationResponse>(
    [
      "ssm",
      "get-command-invocation",
      "--region",
      config.awsRegion,
      "--command-id",
      commandId,
      "--instance-id",
      config.bastionInstanceId,
      "--output",
      "json"
    ],
    config
  );
}

async function waitForInvocation(commandId: string, config: DumpConfig) {
  const startedAt = Date.now();
  let lastStatus: string | undefined;

  for (;;) {
    const invocation = await getInvocation(commandId, config);
    const status = invocation.Status ?? "unknown";

    if (status !== lastStatus) {
      console.log(`SSM command ${commandId} status: ${status}`);
      lastStatus = status;
    }

    if (terminalSsmStatuses.has(status)) {
      return invocation;
    }

    if (Date.now() - startedAt > config.timeoutSeconds * 1000) {
      throw new Error(`Timed out waiting for SSM command ${commandId}.`);
    }

    await delay(10000);
  }
}

function printInvocation(invocation: SsmInvocationResponse) {
  const stdout = invocation.StandardOutputContent?.trim();
  const stderr = invocation.StandardErrorContent?.trim();

  if (stdout) {
    console.log(stdout);
  }

  if (stderr) {
    console.error(stderr);
  }
}

async function main() {
  assertLegacySourceUrlUnset();
  const config = parseCommandLine();

  await assertReadonlySecretExists(config);
  await assertBastionIsConnected(config);
  await assertBucketIsPrivate(config);

  console.log(
    JSON.stringify(
      {
        awsProfile: config.awsProfile,
        awsRegion: config.awsRegion,
        bastionInstanceId: config.bastionInstanceId,
        dumpBucket: config.bucket,
        dumpPrefix: config.prefix,
        preflightOnly: config.preflightOnly,
        secretId: readonlySecretId,
        expectedUsername: expectedReadonlyUsername,
        expectedDbname: expectedProductionDatabase
      },
      null,
      2
    )
  );

  if (config.preflightOnly) {
    return;
  }

  const commandId = await sendDumpCommand(config);
  const invocation = await waitForInvocation(commandId, config);
  printInvocation(invocation);

  if (invocation.Status !== "Success") {
    throw new Error(`SSM dump command ${commandId} finished with status ${invocation.Status ?? "unknown"}.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
