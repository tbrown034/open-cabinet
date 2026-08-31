import type { NextConfig } from "next";

// Baseline security headers applied to every route. Deliberately no script-src
// CSP — this app renders inline JSON-LD and framework inline scripts, so a
// strict script-src would need nonces/hashes and risks breaking them. The CSP
// below carries only directives with zero script-execution risk:
// frame-ancestors (clickjacking, supersedes X-Frame-Options in modern
// browsers), base-uri (blocks <base> hijacking of relative URLs), and
// form-action (forms can only submit to our own origin).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
  // Deny powerful browser features the site never uses.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
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
