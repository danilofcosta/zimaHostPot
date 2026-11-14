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
  // better-sqlite3 is a native module: keep it out of the bundler and load it
  // from node_modules at runtime (the standalone output copies it).
  serverExternalPackages: ["better-sqlite3"],
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
