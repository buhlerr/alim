/**
 * Single source of truth for the application's display identity. Imported by the
 * layout metadata, sidebar, and dashboard so the name/version live in one place.
 */
export const BRAND = {
  appName: "AspyreLabs DevOps Manager",
  shortName: "Aspyre DevOps",
  tagline: "Centralized infrastructure administration",
  version: "1.0",
} as const;
