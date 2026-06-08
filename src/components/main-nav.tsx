"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { MODULES, navItems, type ModuleGroup } from "@/lib/modules";

const GROUP_LABELS: Record<ModuleGroup, string> = {
  core: "Core",
  infrastructure: "Infrastructure",
  platform: "Platform",
};
const GROUP_ORDER: ModuleGroup[] = ["core", "infrastructure", "platform"];

function Brand() {
  return (
    <div className="flex flex-col items-start gap-3 border-b border-border px-5 py-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/aspyrelabs-logo.svg"
        alt="Aspyrelabs"
        className="w-full max-w-[190px] dark:brightness-0 dark:invert"
      />
      <div className="flex items-center gap-2.5">
        <span className="grid h-4 w-4 place-items-center border border-signal shadow-[0_0_12px_-2px_hsl(var(--signal))]">
          <span className="cr-corepulse h-1.5 w-1.5 bg-signal" />
        </span>
        <span className="font-display text-[12px] font-semibold uppercase tracking-[0.2em] text-signal">
          {BRAND.shortName}
        </span>
      </div>
    </div>
  );
}

export function MainNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col">
      <Brand />
      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {GROUP_ORDER.map((group) => {
          const modules = MODULES.filter((m) => m.group === group);
          if (modules.length === 0) return null;
          return (
            <div key={group} className="space-y-1">
              <p className="px-3 pb-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.2em] text-muted-foreground/60">
                {GROUP_LABELS[group]}
              </p>
              {modules.map((m) => {
                if (m.status === "coming-soon") {
                  const Icon = m.icon;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm font-medium text-muted-foreground/50"
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        {m.name}
                      </span>
                      <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.16em]">
                        Soon
                      </span>
                    </div>
                  );
                }
                return (
                  <Fragment key={m.id}>
                    {m.nav.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                            active
                              ? "border-l-2 border-signal bg-signal/10 text-foreground [&_svg]:text-signal"
                              : "border-l-2 border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>
          );
        })}

        {/* App-level settings (not a module). */}
        <div className="space-y-1">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
              isActive("/settings")
                ? "border-l-2 border-signal bg-signal/10 text-foreground [&_svg]:text-signal"
                : "border-l-2 border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </nav>
      <div className="border-t border-border p-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
        {BRAND.appName} v{BRAND.version}
      </div>
    </aside>
  );
}

/** Compact horizontal nav shown on small screens — available modules only. */
export function MobileNav() {
  const pathname = usePathname();
  const items = [
    ...navItems(),
    { href: "/settings", label: "Settings", icon: Settings },
  ];
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium",
              active
                ? "border-l-2 border-signal bg-signal/10 text-foreground [&_svg]:text-signal"
                : "text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
