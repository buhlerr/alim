/**
 * The authentication gate.
 *
 * A single choke point that runs before every request (except the public
 * allowlist and static assets). It resolves the caller's identity — a valid
 * reverse-proxy header or a valid signed session cookie — and either forwards
 * the request with the identity attached, or blocks it (redirect to /login for
 * browser navigations, 401 for API/non-GET requests).
 *
 * Runs on the edge runtime, so it uses only the edge-safe auth helpers (Web
 * Crypto, no Node APIs, no DB). If the auth config is invalid the gate fails
 * CLOSED — every gated request is denied until the operator fixes it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { loadAuthConfig } from "@/lib/auth/config";
import { resolveIdentity, IDENTITY_HEADER } from "@/lib/auth/identity";
import { SESSION_COOKIE } from "@/lib/auth/session";

/** Paths reachable without authentication (the login flow + liveness probe). */
const PUBLIC_PREFIXES = ["/login", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function unauthorized(req: NextRequest): NextResponse {
  const isApi = req.nextUrl.pathname.startsWith("/api");
  if (isApi || req.method !== "GET") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  if (isPublic(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  let authConfig;
  try {
    authConfig = loadAuthConfig();
  } catch {
    // Misconfigured auth → deny everything (fail closed).
    return NextResponse.json(
      { error: "authentication is misconfigured" },
      { status: 503 },
    );
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value ?? null;
  const identity = await resolveIdentity(
    (name) => req.headers.get(name),
    token,
    authConfig,
  );

  if (!identity) {
    return unauthorized(req);
  }

  // Forward the resolved identity to server components / actions so the audit
  // log can attribute actions to the real user. Strip any inbound value first
  // so a client can't spoof it.
  const headers = new Headers(req.headers);
  headers.set(IDENTITY_HEADER, identity.username);
  headers.set(`${IDENTITY_HEADER}-mode`, identity.mode);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
