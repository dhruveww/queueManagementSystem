import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // three/drei ship untranspiled ESM; Next handles them fine but the
  // transpile hint keeps the server bundle from choking on drei subpaths.
  transpilePackages: ["three"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
