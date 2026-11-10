import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["playwright-core"],
  // The intranet build must not depend on external font/CDN downloads
  images: { unoptimized: true },
};

export default nextConfig;
