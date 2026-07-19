import type { NextConfig } from "next";

// Baseline security headers applied to every route. Deliberately no full CSP —
// this app renders inline JSON-LD and framework inline scripts, so a strict
// script-src would need nonces/hashes and risks breaking them. X-Frame-Options
// DENY blocks clickjacking without touching script execution.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
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
