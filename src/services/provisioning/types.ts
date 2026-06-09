/**
 * Provisioner abstraction.
 *
 * v1 ships a PostgreSQL implementation. Future engines (MySQL, Redis) implement
 * this same interface so the UI and server actions don't need to change; they
 * select a provisioner by engine and call `provision()`.
 */
import type { Environment } from "@/lib/targets";

export type Engine = "postgres" | "mysql" | "redis";

export interface ProvisionRequest {
  environment: Environment;
  applicationName: string;
  databaseName: string;
  username: string;
  password: string;
}

export type ProvisionStatus = "created" | "already_existed";

export interface StepResult {
  step: string;
  status: "created" | "already_existed" | "updated" | "granted";
}

export interface ProvisionResult {
  environment: Environment;
  databaseName: string;
  username: string;
  host: string;
  port: number;
  /** Full connection string WITH password. In-memory only; never persisted. */
  connectionString: string;
  status: ProvisionStatus;
  steps: StepResult[];
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  serverVersion?: string;
}

export interface Provisioner {
  readonly engine: Engine;
  /** Verify the admin connection for an environment is reachable and usable. */
  testConnection(environment: Environment): Promise<ConnectionTestResult>;
  /** Idempotently create the user, database, and grant required privileges. */
  provision(request: ProvisionRequest): Promise<ProvisionResult>;
}

/** Thrown for expected, user-presentable provisioning failures. */
export class ProvisioningError extends Error {
  constructor(
    message: string,
    public readonly code: string = "PROVISIONING_ERROR",
  ) {
    super(message);
    this.name = "ProvisioningError";
  }
}
