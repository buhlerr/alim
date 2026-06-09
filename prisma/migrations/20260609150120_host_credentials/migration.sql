-- CreateTable
CREATE TABLE "host_credentials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "ip_address" TEXT NOT NULL,
    "ssh_port" INTEGER NOT NULL DEFAULT 22,
    "ssh_username" TEXT NOT NULL DEFAULT 'root',
    "encrypted_private_key" TEXT NOT NULL,
    "provider_type" TEXT NOT NULL DEFAULT 'coolify',
    "coolify_server_uuid" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "host_credentials_coolify_server_uuid_idx" ON "host_credentials"("coolify_server_uuid");

-- CreateIndex
CREATE INDEX "host_credentials_ip_address_idx" ON "host_credentials"("ip_address");
