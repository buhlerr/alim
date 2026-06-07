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
    <div className="flex flex-col items-start gap-2.5 border-b px-5 py-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/aspyrelabs-logo.svg"
        alt="Aspyrelabs"
        className="w-full max-w-[200px]"
      />
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-[#7a44b7] to-[#ee2f6d]" />
        <span className="bg-gradient-to-r from-[#7a44b7] to-[#ee2f6d] bg-clip-text text-[13px] font-semibold uppercase tracking-[0.18em] text-transparent">
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
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {GROUP_LABELS[group]}
              </p>
              {modules.map((m) => {
                if (m.status === "coming-soon") {
                  const Icon = m.icon;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/50"
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        {m.name}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
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
                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
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
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive("/settings")
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </nav>
      <div className="border-t p-4 text-[11px] text-muted-foreground">
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
                ? "bg-primary text-primary-foreground"
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
