import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/guides/https-nextjs-dev",
        destination: "/docs/nextjs-localhost",
        permanent: true,
      },
      {
        source: "/guides/webhook-testing-localhost",
        destination: "/docs/webhook-testing",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
