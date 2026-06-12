"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadAuthConfig } from "@/lib/auth/config";
import { verifyPassword } from "@/lib/auth/password";
import { signSession, SESSION_COOKIE } from "@/lib/auth/session";

export interface LoginState {
  error?: string;
}

/**
 * Only allow redirecting to internal, absolute paths — never to an external
 * origin or a protocol-relative URL (open-redirect protection).
 */
function safeNext(next: string | null): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

/**
 * Validate the shared password and, on success, mint a signed session cookie.
 * The username is attribution-only (defaults to the configured admin name); the
 * password is the single shared credential.
 */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  let config;
  try {
    config = loadAuthConfig();
  } catch {
    return { error: "Authentication is misconfigured. Check the server logs." };
  }

  if (config.mode === "proxy") {
    return { error: "Password login is disabled; sign in through your identity provider." };
  }

  const password = (formData.get("password") ?? "").toString();
  if (!verifyPassword(password, config.password)) {
    return { error: "Incorrect password." };
  }

  const username =
    (formData.get("username") ?? "").toString().trim() || config.adminUsername;
  const token = await signSession(
    { sub: username, mode: "password" },
    config.secret,
    config.sessionTtlSeconds,
  );

  // Mark the cookie Secure only when the request actually arrived over HTTPS, so
  // a production deploy served over plain HTTP on a trusted LAN still works.
  const proto = (await headers()).get("x-forwarded-proto");
  const secure = proto
    ? proto.split(",")[0].trim() === "https"
    : process.env.NODE_ENV === "production";

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: config.sessionTtlSeconds,
  });

  redirect(safeNext((formData.get("next") ?? "/").toString()));
}

/** Clear the session cookie and return to the login page. */
export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
