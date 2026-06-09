-- CreateTable
CREATE TABLE "migration_jobs" (
    "id" TEXT NOT NULL,
    "migration_type" TEXT NOT NULL,
    "source_resource_id" TEXT NOT NULL,
    "source_resource_name" TEXT NOT NULL,
    "destination_resource_name" TEXT NOT NULL,
    "source_host" TEXT NOT NULL,
    "source_host_name" TEXT NOT NULL,
    "destination_host" TEXT NOT NULL,
    "destination_host_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "exposure" TEXT NOT NULL,
    "validation_url" TEXT,
    "npm_enabled" BOOLEAN NOT NULL DEFAULT false,
    "cloudflare_enabled" BOOLEAN NOT NULL DEFAULT false,
    "current_step_key" TEXT,
    "source_resource_snapshot" JSONB NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "migration_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_steps" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "detail" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "migration_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_logs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "step_key" TEXT,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_artifacts" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "migration_jobs_status_idx" ON "migration_jobs"("status");

-- CreateIndex
CREATE INDEX "migration_jobs_created_at_idx" ON "migration_jobs"("created_at");

-- CreateIndex
CREATE INDEX "migration_steps_job_id_idx" ON "migration_steps"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "migration_steps_job_id_key_key" ON "migration_steps"("job_id", "key");

-- CreateIndex
CREATE INDEX "migration_logs_job_id_created_at_idx" ON "migration_logs"("job_id", "created_at");

-- CreateIndex
CREATE INDEX "migration_artifacts_job_id_idx" ON "migration_artifacts"("job_id");

-- AddForeignKey
ALTER TABLE "migration_steps" ADD CONSTRAINT "migration_steps_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "migration_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_logs" ADD CONSTRAINT "migration_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "migration_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_artifacts" ADD CONSTRAINT "migration_artifacts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "migration_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
