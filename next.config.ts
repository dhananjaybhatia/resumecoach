import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "resumecoach.au" }, // Add your domain
    ],
    domains: ['resumecoach.au'], // Legacy support
  },

  serverExternalPackages: ["pdf-parse", "mammoth"],

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

// Sentry configuration with minimal settings to avoid deployment issues
export default withSentryConfig(nextConfig, {
  org: "student-hob",
  project: "saas",
  silent: true, // Disable Sentry logs during build
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: false, // Disable to avoid conflicts
  hideSourceMaps: true, // Hide source maps in production
  disableServerWebpackPlugin: false,
  disableClientWebpackPlugin: false,
});