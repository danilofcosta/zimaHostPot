import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera .next/standalone para a imagem Docker (Dockerfile.ui).
  output: "standalone",
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
