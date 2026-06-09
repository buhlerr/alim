"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  LayoutDashboard,
  Rocket,
  PlusCircle,
  ListChecks,
  TerminalSquare,
  Cloud,
  Network,
  Globe,
  Settings,
  KeyRound,
  ScrollText,
  Server,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}
interface NavSection {
  /** null = top-level items with no group heading. */
  label: string | null;
  items: NavItem[];
}

/**
 * Sidebar structure. Intentionally decoupled from the module registry
 * (`MODULES`, which drives the dashboard hub cards) so navigation can be grouped
 * for wayfinding independently of how features are modeled.
 */
const SIDEBAR: NavSection[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/deploy", label: "Deploy", icon: Rocket },
    ],
  },
  {
    label: "Database",
    items: [
      { href: "/create", label: "Create", icon: PlusCircle },
      { href: "/registry", label: "Databases", icon: ListChecks },
      { href: "/query", label: "Query", icon: TerminalSquare },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { href: "/coolify", label: "Coolify", icon: Cloud },
      { href: "/npm", label: "Proxy Hosts", icon: Network },
      { href: "/cloudflare", label: "Cloudflare", icon: Globe },
      { href: "/migrations", label: "Migrations", icon: ArrowLeftRight },
      { href: "/hosts", label: "Hosts", icon: Server },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/secrets", label: "Secrets", icon: KeyRound },
      { href: "/audit", label: "Audit Log", icon: ScrollText },
    ],
  },
];

const ALL_ITEMS: NavItem[] = SIDEBAR.flatMap((s) => s.items);

function Brand() {
  return (
    <div className="flex h-16 items-center border-b border-border px-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/aspyrelabs-logo.svg"
        alt="Aspyrelabs"
        className="w-full max-w-[160px]"
      />
    </div>
  );
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
}

export function MainNav() {
  const isActive = useIsActive();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card md:sticky md:top-0 md:flex md:h-screen md:flex-col md:self-start">
      <Brand />
      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {SIDEBAR.map((section, i) => (
          <div key={section.label ?? `top-${i}`} className="space-y-1">
            {section.label ? (
              <p className="px-3 pb-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.2em] text-muted-foreground/60">
                {section.label}
              </p>
            ) : null}
            {section.items.map((item) => {
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
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
        {BRAND.appName} v{BRAND.version}
      </div>
    </aside>
  );
}

/** Compact horizontal nav shown on small screens (same items, flattened). */
export function MobileNav() {
  const isActive = useIsActive();
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
      {ALL_ITEMS.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium",
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
