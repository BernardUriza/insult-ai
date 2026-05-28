import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Azure Static Web Apps (see .claude/rules/deploy.md): the
  // API is the only server process; the front is a static bundle that calls it.
  output: "export",
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  compress: true,
  typedRoutes: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  // The Image optimizer needs a server; static export can't run it.
  images: {
    unoptimized: true,
    qualities: [75, 85, 100],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
