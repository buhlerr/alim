/**
 * Single source of truth for the application's display identity. Imported by the
 * layout metadata, sidebar, and dashboard so the name/version live in one place.
 */
export const BRAND = {
  appName: "Aspyre Infrastructure Manager",
  shortName: "Aspyre DevOps",
  tagline: "Centralized infrastructure administration",
  version: "2.0",
} as const;
