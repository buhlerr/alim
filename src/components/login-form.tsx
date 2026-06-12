"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Shared-password sign-in form. The username field is attribution-only — it is
 * recorded in the audit log but is not a credential — so it is prefilled with
 * the configured admin name and remains editable.
 */
export function LoginForm({
  next,
  adminUsername,
  showUsername,
}: {
  next: string;
  adminUsername: string;
  /** Hidden in "both" mode where password login is the break-glass path. */
  showUsername: boolean;
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      {showUsername ? (
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            defaultValue={adminUsername}
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
      ) : (
        <input type="hidden" name="username" value={adminUsername} />
      )}

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
        />
      </div>

      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="signal" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
