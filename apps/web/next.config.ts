import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  distDir: ".next-build",

  // Image Docker légère : serveur autonome (server.js) + dépendances tracées.
  // La racine de traçage est celle du monorepo (dépendances pnpm hors apps/web).
  output: "standalone",
  outputFileTracingRoot: path.join(here, "../.."),

  experimental: {
    serverActions: {
      allowedOrigins: (process.env.NEXT_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    },
  },

  images: {
    unoptimized: true,
  },
};

export default nextConfig;