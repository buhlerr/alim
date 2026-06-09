import "server-only";
import { Client } from "pg";
import { getAdminUrl, parseConnection, type Environment } from "@/lib/targets";
import { assertSafeIdentifier } from "@/lib/validation";
import {
  ProvisioningError,
  type ConnectionTestResult,
  type Provisioner,
  type ProvisionRequest,
  type ProvisionResult,
  type StepResult,
} from "./types";

/** Double-quote an identifier. Only ever called on validated identifiers. */
function quoteIdent(name: string): string {
  assertSafeIdentifier(name);
  return `"${name}"`;
}

/**
 * Escape a string as a PostgreSQL string literal.
 *
 * The PASSWORD clause of CREATE/ALTER ROLE is a utility statement whose grammar
 * requires a literal string constant; bind parameters ($1) are rejected with a
 * syntax error (42601). So the password must be interpolated as an escaped
 * literal: single quotes are doubled, and the E'' form is used when a backslash
 * is present. Mirrors Postgres's own quote_literal().
 */
function quoteLiteral(value: string): string {
  const escaped = value.replace(/'/g, "''");
  if (escaped.includes("\\")) {
    return `E'${escaped.replace(/\\/g, "\\\\")}'`;
  }
  return `'${escaped}'`;
}

/** Map a thrown pg error into a friendly, password-free message. */
function friendlyError(err: unknown): ProvisioningError {
  const e = err as { code?: string; message?: string };
  switch (e?.code) {
    case "ECONNREFUSED":
      return new ProvisioningError(
        "Could not reach the PostgreSQL server (connection refused). Check the host and port.",
        "ECONNREFUSED",
      );
    case "ENOTFOUND":
      return new ProvisioningError(
        "The PostgreSQL server hostname could not be resolved.",
        "ENOTFOUND",
      );
    case "ETIMEDOUT":
      return new ProvisioningError(
        "Timed out connecting to the PostgreSQL server.",
        "ETIMEDOUT",
      );
    case "28P01":
      return new ProvisioningError(
        "The admin credentials for this server were rejected.",
        "28P01",
      );
    case "28000":
      return new ProvisioningError(
        "The admin role is not authorized to connect to this server.",
        "28000",
      );
    case "42501":
      return new ProvisioningError(
        "The admin role lacks the privileges required (needs CREATEDB and CREATEROLE).",
        "42501",
      );
    default:
      // Never echo back a raw message that might contain a connection string.
      return new ProvisioningError(
        "An unexpected error occurred while talking to the PostgreSQL server.",
        e?.code ?? "UNKNOWN",
      );
  }
}

/** Build the connection string handed back to the user (in memory only). */
function buildUserConnectionString(
  host: string,
  port: number,
  user: string,
  password: string,
  database: string,
): string {
  // user/db are validated identifiers; only the password needs encoding.
  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

/** Derive an admin connection string targeting a specific database. */
function adminUrlForDatabase(adminUrl: string, database: string): string {
  const u = new URL(adminUrl);
  u.pathname = `/${database}`;
  return u.toString();
}

async function withClient<T>(
  connectionString: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString,
    // Fail fast rather than hanging the request thread.
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  });
  try {
    await client.connect();
  } catch (err) {
    throw friendlyError(err);
  }
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {
      /* ignore close errors */
    });
  }
}

export class PostgresProvisioner implements Provisioner {
  readonly engine = "postgres" as const;

  private async requireAdminUrl(environment: Environment): Promise<string> {
    const url = await getAdminUrl(environment);
    if (!url) {
      throw new ProvisioningError(
        `The ${environment} server is not configured. Add its connection string on the Settings page (or set its POSTGRES_*_URL env var).`,
        "NOT_CONFIGURED",
      );
    }
    return url;
  }

  async testConnection(
    environment: Environment,
  ): Promise<ConnectionTestResult> {
    const url = await getAdminUrl(environment);
    if (!url) {
      return { ok: false, message: "Not configured." };
    }
    try {
      return await withClient(url, async (client) => {
        const res = await client.query("SELECT version() as version");
        const version: string = res.rows[0]?.version ?? "unknown";
        // Keep only the short version token, drop build details.
        const short = version.split(" on ")[0];
        return { ok: true, message: "Connection OK.", serverVersion: short };
      });
    } catch (err) {
      const fe = err instanceof ProvisioningError ? err : friendlyError(err);
      return { ok: false, message: fe.message };
    }
  }

  async provision(request: ProvisionRequest): Promise<ProvisionResult> {
    const { environment, databaseName, username, password } = request;

    // Defense in depth: validate identifiers before they touch any SQL.
    assertSafeIdentifier(databaseName);
    assertSafeIdentifier(username);

    const adminUrl = await this.requireAdminUrl(environment);
    const conn = parseConnection(adminUrl);
    if (!conn) {
      throw new ProvisioningError(
        `The ${environment} connection string is malformed.`,
        "BAD_URL",
      );
    }

    const steps: StepResult[] = [];
    let userExisted = false;
    let dbExisted = false;

    try {
      // ── Connect to the maintenance DB for role + database operations ──────
      await withClient(adminUrl, async (client) => {
        // 1. Ensure role (idempotent). Password is a bind parameter.
        const role = await client.query(
          "SELECT 1 FROM pg_roles WHERE rolname = $1",
          [username],
        );
        if (role.rowCount && role.rowCount > 0) {
          userExisted = true;
          await client.query(
            `ALTER USER ${quoteIdent(username)} WITH LOGIN PASSWORD ${quoteLiteral(password)}`,
          );
          steps.push({ step: `user ${username}`, status: "updated" });
        } else {
          await client.query(
            `CREATE USER ${quoteIdent(username)} WITH LOGIN PASSWORD ${quoteLiteral(password)}`,
          );
          steps.push({ step: `user ${username}`, status: "created" });
        }

        // 2. Ensure database (idempotent). CREATE DATABASE cannot run in a
        //    transaction, and pg autocommits single statements, so this is fine.
        const db = await client.query(
          "SELECT 1 FROM pg_database WHERE datname = $1",
          [databaseName],
        );
        if (db.rowCount && db.rowCount > 0) {
          dbExisted = true;
          steps.push({ step: `database ${databaseName}`, status: "already_existed" });
        } else {
          await client.query(
            `CREATE DATABASE ${quoteIdent(databaseName)} OWNER ${quoteIdent(username)}`,
          );
          steps.push({ step: `database ${databaseName}`, status: "created" });
        }

        // 3. Database-level privileges (grants are naturally re-runnable).
        await client.query(
          `GRANT ALL PRIVILEGES ON DATABASE ${quoteIdent(databaseName)} TO ${quoteIdent(username)}`,
        );
        steps.push({ step: `grant on database ${databaseName}`, status: "granted" });
      });

      // ── Connect to the NEW database for schema-level privileges ───────────
      // These grants are what Prisma migrations and NestJS apps need to create
      // tables, sequences, and own the public schema.
      const targetUrl = adminUrlForDatabase(adminUrl, databaseName);
      await withClient(targetUrl, async (client) => {
        const u = quoteIdent(username);
        await client.query(`GRANT ALL ON SCHEMA public TO ${u}`);
        // Owning the schema lets Prisma run DDL (CREATE TABLE, etc.).
        await client.query(`ALTER SCHEMA public OWNER TO ${u}`);
        await client.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${u}`);
        await client.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${u}`);
        await client.query(`GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO ${u}`);
        // Default privileges so future objects are owned/usable by the role.
        await client.query(
          `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${u}`,
        );
        await client.query(
          `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${u}`,
        );
        await client.query(
          `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${u}`,
        );
        steps.push({ step: "schema privileges", status: "granted" });
      });
    } catch (err) {
      throw err instanceof ProvisioningError ? err : friendlyError(err);
    }

    return {
      environment,
      databaseName,
      username,
      host: conn.host,
      port: conn.port,
      connectionString: buildUserConnectionString(
        conn.host,
        conn.port,
        username,
        password,
        databaseName,
      ),
      status: userExisted && dbExisted ? "already_existed" : "created",
      steps,
    };
  }
}

export const postgresProvisioner = new PostgresProvisioner();
