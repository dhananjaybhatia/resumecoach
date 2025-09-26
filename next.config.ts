import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

  // Remove env from here - keep them in .env.local only
  // The environment variables are automatically available
};

export default withSentryConfig(nextConfig, {
  org: "student-hob",
  project: "saas",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true
});