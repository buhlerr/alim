import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained build for small Docker images / Coolify.
  output: "standalone",
  // Native-ish deps that must not be webpack-bundled into server components.
  // `ssh2` ships a native addon (sshcrypto.node) the bundler cannot parse.
  serverExternalPackages: ["pg", "ssh2"],
  // The /docs pages read their Markdown from src/content/docs at runtime. The
  // standalone tracer doesn't follow process.cwd() reads, so force those files
  // into the standalone output (copied preserving their project-relative path).
  outputFileTracingIncludes: {
    "/docs": ["./src/content/docs/**/*"],
    "/docs/[slug]": ["./src/content/docs/**/*"],
  },
};

export default nextConfig;
