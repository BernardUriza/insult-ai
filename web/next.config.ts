import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Azure Static Web Apps (see .claude/rules/deploy.md): the
  // API is the only server process; the front is a static bundle that calls it.
  output: "export",
  // The Image optimizer needs a server; static export can't run it.
  images: { unoptimized: true },
};

export default nextConfig;
