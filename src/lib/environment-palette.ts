/**
 * Curated environment color palette (client-safe). Each swatch maps to a
 * Tailwind badge class with guaranteed legible contrast and a dot class for the
 * picker. Environments store the swatch KEY (e.g. "red") in `Environment.color`.
 */
export interface PaletteEntry {
  label: string;
  badgeClass: string;
  dotClass: string;
}

export const PALETTE: Record<string, PaletteEntry> = {
  red: { label: "Red", badgeClass: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", dotClass: "bg-red-500" },
  orange: { label: "Orange", badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300", dotClass: "bg-orange-500" },
  amber: { label: "Amber", badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", dotClass: "bg-amber-500" },
  green: { label: "Green", badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", dotClass: "bg-emerald-500" },
  teal: { label: "Teal", badgeClass: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300", dotClass: "bg-teal-500" },
  cyan: { label: "Cyan", badgeClass: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300", dotClass: "bg-cyan-500" },
  blue: { label: "Blue", badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300", dotClass: "bg-blue-500" },
  violet: { label: "Violet", badgeClass: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300", dotClass: "bg-violet-500" },
  pink: { label: "Pink", badgeClass: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300", dotClass: "bg-pink-500" },
  slate: { label: "Slate", badgeClass: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200", dotClass: "bg-slate-500" },
};

export const PALETTE_KEYS = Object.keys(PALETTE);

export function paletteEntry(color: string): PaletteEntry {
  return PALETTE[color] ?? PALETTE.slate;
}
