import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
