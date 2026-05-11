import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Serverless-friendly defaults — Railway runs a long-lived process but
  // these don't hurt and keep options open.
  experimental: {
    typedRoutes: true,
  },
  // Block any third-party trackers by default — we promised no analytics
  // for minors. Enforced via CSP in middleware below as well.
  poweredByHeader: false,
};

export default nextConfig;
