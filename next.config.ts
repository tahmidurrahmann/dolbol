import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_PUBLIC_BUILD_ID ||
  "prod-build";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_BUILD_ID: buildId,
  },
  generateBuildId: async () => buildId,
  async headers() {
    return [
      {
        // Protect all trip pages (private secret links) from search engine indexing
        source: "/trips/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
      {
        // Protect all API endpoints from crawler indexing
        source: "/api/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
      {
        // Protect offline fallback page from crawler indexing
        source: "/offline",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
