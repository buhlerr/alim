import { ShieldCheck } from "lucide-react";

import { loadAuthConfig, type AuthMode } from "@/lib/auth/config";
import { LoginForm } from "@/components/login-form";
import { BRAND } from "@/lib/brand";

/**
 * Public sign-in page. Adapts to the configured AUTH_MODE:
 *   - password / both: shows the shared-password form (the break-glass path in
 *     "both" mode).
 *   - proxy: no password exists, so it shows an informational message — reaching
 *     this page means the reverse proxy did not forward an identity header.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  let mode: AuthMode = "password";
  let adminUsername = "admin";
  let configError = false;
  try {
    const config = loadAuthConfig();
    mode = config.mode;
    adminUsername = config.adminUsername;
  } catch {
    configError = true;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="flex justify-center">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-secondary/40 text-signal">
              <ShieldCheck className="h-5 w-5" />
            </span>
          </div>
          <h1 className="bg-gradient-to-r from-[#7a44b7] to-[#ee2f6d] bg-clip-text font-display text-sm font-semibold uppercase tracking-[0.2em] text-transparent">
            {BRAND.shortName}
          </h1>
          <p className="text-xs text-muted-foreground">{BRAND.appName}</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          {configError ? (
            <p className="text-sm text-danger">
              Authentication is misconfigured. Check the server logs and the
              <code className="mx-1 font-mono">AUTH_*</code>
              environment variables.
            </p>
          ) : mode === "proxy" ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                Single sign-on required
              </p>
              <p>
                Authentication is handled by your identity provider. If you are
                seeing this page, the reverse proxy in front of {BRAND.shortName}
                {" "}did not forward an authenticated identity.
              </p>
            </div>
          ) : (
            <LoginForm
              next={next ?? "/"}
              adminUsername={adminUsername}
              showUsername={mode === "password"}
            />
          )}
        </div>
      </div>
    </div>
  );
}
