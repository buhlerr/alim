/**
 * Module registry: the single declaration of every feature "module" in the
 * platform. The sidebar (`main-nav`) and the dashboard hub both render from this
 * list, so adding a module to the UI is a matter of adding an entry here.
 *
 * Client-safe: no server-only imports. Icons are Lucide components.
 */
import {
  ArrowLeftRight,
  Database,
  LayoutDashboard,
  PlusCircle,
  ListChecks,
  TerminalSquare,
  Cloud,
  Network,
  Globe,
  Rocket,
  KeyRound,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export type ModuleStatus = "available" | "coming-soon";
export type ModuleGroup = "core" | "infrastructure" | "platform";

export interface ModuleNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface AppModule {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Primary landing route for the dashboard hub card. */
  href: string;
  status: ModuleStatus;
  group: ModuleGroup;
  /** Sidebar entries this module contributes (empty for coming-soon modules). */
  nav: ModuleNavItem[];
}

export const MODULES: AppModule[] = [
  {
    id: "database",
    name: "Databases",
    description: "Provision PostgreSQL databases, users, and permissions.",
    icon: Database,
    href: "/dashboard",
    status: "available",
    group: "core",
    nav: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/create", label: "Create", icon: PlusCircle },
      { href: "/registry", label: "Databases", icon: ListChecks },
    ],
  },
  {
    id: "query",
    name: "SQL Console",
    description: "Run, explain, and save SQL across every environment.",
    icon: TerminalSquare,
    href: "/query",
    status: "available",
    group: "core",
    nav: [{ href: "/query", label: "Query", icon: TerminalSquare }],
  },
  {
    id: "coolify",
    name: "Coolify",
    description: "Create, configure, and deploy applications via the Coolify API.",
    icon: Cloud,
    href: "/coolify",
    status: "available",
    group: "infrastructure",
    nav: [{ href: "/coolify", label: "Coolify", icon: Cloud }],
  },
  {
    id: "npm",
    name: "Proxy Hosts",
    description: "Manage Nginx Proxy Manager hosts, SSL, and security.",
    icon: Network,
    href: "/npm",
    status: "available",
    group: "infrastructure",
    nav: [{ href: "/npm", label: "Proxy Hosts", icon: Network }],
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "Manage Cloudflare tunnel routes and TLS settings.",
    icon: Globe,
    href: "/cloudflare",
    status: "available",
    group: "infrastructure",
    nav: [{ href: "/cloudflare", label: "Cloudflare", icon: Globe }],
  },
  {
    id: "deployment",
    name: "Deployments",
    description: "One-shot wizard that orchestrates all underlying systems.",
    icon: Rocket,
    href: "/deploy",
    status: "available",
    group: "platform",
    nav: [{ href: "/deploy", label: "Deploy", icon: Rocket }],
  },
  {
    id: "migration",
    name: "Migrations",
    description: "Move or clone Coolify resources between servers, with approval-gated cutover.",
    icon: ArrowLeftRight,
    href: "/migrations",
    status: "available",
    group: "infrastructure",
    nav: [{ href: "/migrations", label: "Migrations", icon: ArrowLeftRight }],
  },
  {
    id: "secrets",
    name: "Secrets",
    description: "Encrypted storage for API tokens and credentials.",
    icon: KeyRound,
    href: "/secrets",
    status: "available",
    group: "platform",
    nav: [{ href: "/secrets", label: "Secrets", icon: KeyRound }],
  },
  {
    id: "audit",
    name: "Audit Log",
    description: "Track every action taken across the platform.",
    icon: ScrollText,
    href: "/audit",
    status: "available",
    group: "platform",
    nav: [{ href: "/audit", label: "Audit Log", icon: ScrollText }],
  },
];

export function getModule(id: string): AppModule | undefined {
  return MODULES.find((m) => m.id === id);
}

export function availableModules(): AppModule[] {
  return MODULES.filter((m) => m.status === "available");
}

/** All sidebar nav entries contributed by available modules, in module order. */
export function navItems(): ModuleNavItem[] {
  return availableModules().flatMap((m) => m.nav);
}
