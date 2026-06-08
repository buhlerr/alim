import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for Coolify/Docker. Verifies the app can reach its
 * own metadata database. Does not touch the provisioning target servers. Also
 * reports the server process uptime so the command bar can show a real figure.
 */
export async function GET() {
  const uptimeSeconds = Math.floor(process.uptime());
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", uptimeSeconds });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "unreachable", uptimeSeconds },
      { status: 503 },
    );
  }
}
