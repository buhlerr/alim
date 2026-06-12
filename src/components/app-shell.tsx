"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { MainNav, MobileNav } from "@/components/main-nav";
import { AppBar } from "@/components/app-bar";

/**
 * Top-level chrome wrapper. Renders the nav + command bar around page content,
 * except on the public /login route which is shown bare (full-screen).
 */
export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: string | null;
}) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <MainNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppBar user={user} />
        <MobileNav />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
