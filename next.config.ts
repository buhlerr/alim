import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained build for small Docker images / Coolify.
  output: "standalone",
  // `pg` is a native-ish dependency that should not be bundled into server components.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
