-- Create the environments table
CREATE TABLE "environments" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "abbreviation" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "read_only" BOOLEAN NOT NULL DEFAULT false,
    "require_write_confirm" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "environments_pkey" PRIMARY KEY ("key")
);

-- Seed the existing three environments so all current data + behavior is preserved
INSERT INTO "environments"
  ("key","name","description","color","abbreviation","sort_order","read_only","require_write_confirm","updated_at")
VALUES
  ('PRODUCTION','Production','Production workloads.','red','',0,false,true,CURRENT_TIMESTAMP),
  ('STAGING','Staging','Pre-release staging.','amber','staging',1,false,true,CURRENT_TIMESTAMP),
  ('DEVELOPMENT','Development','Development sandbox.','slate','dev',2,false,true,CURRENT_TIMESTAMP);

-- Convert the enum columns to text (existing values are preserved verbatim)
ALTER TABLE "provisioned_databases" ALTER COLUMN "environment" TYPE TEXT USING "environment"::text;
ALTER TABLE "query_history" ALTER COLUMN "environment" TYPE TEXT USING "environment"::text;

-- Drop the now-unused enum type
DROP TYPE "Environment";

-- Add foreign keys (RESTRICT = block deletion of an environment that is in use)
ALTER TABLE "provisioned_databases"
  ADD CONSTRAINT "provisioned_databases_environment_fkey"
  FOREIGN KEY ("environment") REFERENCES "environments"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "query_history"
  ADD CONSTRAINT "query_history_environment_fkey"
  FOREIGN KEY ("environment") REFERENCES "environments"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
