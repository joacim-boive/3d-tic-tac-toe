import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  eslint: {
    // Linting is oxlint via `npm run lint` — not ESLint during `next build`.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
