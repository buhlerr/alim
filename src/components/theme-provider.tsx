"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * App-wide theme provider. Toggles the `.dark` class on <html>, defaults to the
 * dark "mission-control" theme, but honors the OS preference on first visit and
 * remembers the user's manual choice. `disableTransitionOnChange` avoids a
 * color-flash sweep when switching.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
