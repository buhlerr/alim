import "server-only";
import type {
  MigrationArtifact,
  MigrationJob,
  MigrationLog,
  MigrationStep,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPlan } from "./planner";
import type { Exposure, LogLevel, MigrationType } from "@/lib/migration";

export type {
  MigrationJob as MigrationJobRow,
  MigrationStep as MigrationStepRow,
  MigrationLog as MigrationLogRow,
  MigrationArtifact as MigrationArtifactRow,
};

export interface MigrationJobWithRelations extends MigrationJob {
  steps: MigrationStep[];
  logs: MigrationLog[];
  artifacts: MigrationArtifact[];
}

export interface CreateJobInput {
  migrationType: MigrationType;
  sourceResourceId: string;
  sourceResourceName: string;
  destinationResourceName: string;
  sourceHost: string;
  sourceHostName: string;
  destinationHost: string;
  destinationHostName: string;
  exposure: Exposure;
  npmEnabled: boolean;
  cloudflareEnabled: boolean;
  sourceResourceSnapshot: unknown;
}

export const migrationStore = {
  async createJob(input: CreateJobInput): Promise<MigrationJob> {
    const steps = buildPlan(input.migrationType).map((s) => ({
      key: s.key,
      label: s.label,
      order: s.order,
    }));
    return prisma.migrationJob.create({
      data: {
        migrationType: input.migrationType,
        sourceResourceId: input.sourceResourceId,
        sourceResourceName: input.sourceResourceName,
        destinationResourceName: input.destinationResourceName,
        sourceHost: input.sourceHost,
        sourceHostName: input.sourceHostName,
        destinationHost: input.destinationHost,
        destinationHostName: input.destinationHostName,
        exposure: input.exposure,
        npmEnabled: input.npmEnabled,
        cloudflareEnabled: input.cloudflareEnabled,
        status: "pending",
        sourceResourceSnapshot: input.sourceResourceSnapshot as Prisma.InputJsonValue,
        steps: { create: steps },
      },
    });
  },

  async getJob(id: string): Promise<MigrationJob | null> {
    return prisma.migrationJob.findUnique({ where: { id } });
  },

  async getJobWithRelations(id: string): Promise<MigrationJobWithRelations | null> {
    return prisma.migrationJob.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { order: "asc" } },
        logs: { orderBy: { createdAt: "asc" } },
        artifacts: { orderBy: { createdAt: "asc" } },
      },
    });
  },

  async listJobs(): Promise<MigrationJob[]> {
    return prisma.migrationJob.findMany({ orderBy: { createdAt: "desc" } });
  },

  async updateJob(id: string, patch: Prisma.MigrationJobUpdateInput): Promise<MigrationJob> {
    return prisma.migrationJob.update({ where: { id }, data: patch });
  },

  async getSteps(jobId: string): Promise<MigrationStep[]> {
    return prisma.migrationStep.findMany({ where: { jobId }, orderBy: { order: "asc" } });
  },

  async getStep(jobId: string, key: string): Promise<MigrationStep | null> {
    return prisma.migrationStep.findUnique({ where: { jobId_key: { jobId, key } } });
  },

  async updateStep(
    jobId: string,
    key: string,
    patch: Prisma.MigrationStepUpdateInput,
  ): Promise<MigrationStep> {
    return prisma.migrationStep.update({ where: { jobId_key: { jobId, key } }, data: patch });
  },

  async appendLog(
    jobId: string,
    stepKey: string | null,
    level: LogLevel,
    message: string,
  ): Promise<void> {
    await prisma.migrationLog.create({ data: { jobId, stepKey, level, message } });
  },

  async addArtifact(
    jobId: string,
    type: string,
    reference: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await prisma.migrationArtifact.create({
      data: {
        jobId,
        type,
        reference,
        metadata: metadata == null ? undefined : (metadata as Prisma.InputJsonValue),
      },
    });
  },

  async getArtifact(jobId: string, type: string): Promise<MigrationArtifact | null> {
    return prisma.migrationArtifact.findFirst({
      where: { jobId, type },
      orderBy: { createdAt: "desc" },
    });
  },

  async getArtifacts(jobId: string): Promise<MigrationArtifact[]> {
    return prisma.migrationArtifact.findMany({ where: { jobId }, orderBy: { createdAt: "asc" } });
  },
};
