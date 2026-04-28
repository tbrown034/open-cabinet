import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/officials",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
