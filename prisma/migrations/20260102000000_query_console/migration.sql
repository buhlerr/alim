-- CreateTable
CREATE TABLE "query_history" (
    "id" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "database_name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "query_type" TEXT NOT NULL,
    "execution_time_ms" INTEGER,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_queries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "query" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "query_history_executed_at_idx" ON "query_history"("executed_at");

-- CreateIndex
CREATE INDEX "query_history_environment_idx" ON "query_history"("environment");

-- CreateIndex
CREATE INDEX "saved_queries_name_idx" ON "saved_queries"("name");
