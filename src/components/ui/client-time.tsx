"use client";

import * as React from "react";

/**
 * Locale/timezone-dependent timestamp rendering is a classic hydration-mismatch
 * source: the server formats with its own locale/TZ, the client with the
 * browser's. This component renders a stable, locale-independent placeholder on
 * the server and first client render (so the markup matches), then upgrades to
 * the localized/relative string after mount.
 */

/** Stable, identical server+client text derived from the ISO string. */
function stable(iso: string): string {
  // "2026-06-08T13:54:00.000Z" -> "2026-06-08 13:54"
  return iso.slice(0, 16).replace("T", " ");
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ClientTime({
  iso,
  relative = false,
  className,
}: {
  iso: string;
  relative?: boolean;
  className?: string;
}) {
  const [text, setText] = React.useState(() => stable(iso));

  React.useEffect(() => {
    setText(relative ? relativeTime(iso) : new Date(iso).toLocaleString());
  }, [iso, relative]);

  return (
    <span className={className} suppressHydrationWarning title={new Date(iso).toISOString()}>
      {text}
    </span>
  );
}
