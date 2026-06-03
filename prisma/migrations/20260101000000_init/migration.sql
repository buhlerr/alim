-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('PRODUCTION', 'STAGING', 'DEVELOPMENT');

-- CreateTable
CREATE TABLE "provisioned_databases" (
    "id" TEXT NOT NULL,
    "application_name" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "database_name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL DEFAULT 'system',
    "notes" TEXT,

    CONSTRAINT "provisioned_databases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "provisioned_databases_application_name_idx" ON "provisioned_databases"("application_name");

-- CreateIndex
CREATE INDEX "provisioned_databases_database_name_idx" ON "provisioned_databases"("database_name");

-- CreateIndex
CREATE INDEX "provisioned_databases_username_idx" ON "provisioned_databases"("username");

-- CreateIndex
CREATE UNIQUE INDEX "provisioned_databases_environment_host_database_name_key" ON "provisioned_databases"("environment", "host", "database_name");
