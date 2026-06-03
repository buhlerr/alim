import type { Metadata } from "next";
import "./globals.css";

import { MainNav, MobileNav } from "@/components/main-nav";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "DB Provisioner — Aspyre Labs",
  description:
    "Internal tool for provisioning PostgreSQL databases, users, and permissions.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">
        <div className="flex min-h-screen">
          <MainNav />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileNav />
            <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
              <div className="mx-auto w-full max-w-5xl">{children}</div>
            </main>
          </div>
        </div>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
