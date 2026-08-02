import type { NextConfig } from "next";
import packageJson from "./package.json";

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.NEXT_PUBLIC_APP_BUILD_ID ?? "dev";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  eslint: {
    // Linting is oxlint via `npm run lint` — not ESLint during `next build`.
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_APP_BUILD_ID: buildId,
  },
};

export default nextConfig;
