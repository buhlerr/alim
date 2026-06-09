import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained build for small Docker images / Coolify.
  output: "standalone",
  // Native-ish deps that must not be webpack-bundled into server components.
  // `ssh2` ships a native addon (sshcrypto.node) the bundler cannot parse.
  serverExternalPackages: ["pg", "ssh2"],
};

export default nextConfig;
