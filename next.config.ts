import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * `Referrer-Policy` matters more than usual here: a guest's live-status URL
 * carries their ticket token in the path (/s/<code>-<id prefix>), and that page
 * is shared via navigator.share and the clipboard. Without this, the token
 * leaks in the Referer header to every outbound link.
 *
 * The CSP is deliberately report-free and permissive on styles/images, because
 * the settings page injects a server-generated QR via dangerouslySetInnerHTML
 * and the 3D floor needs blob: workers. It still blocks the thing that matters:
 * script from an origin we didn't ship.
 */
const csp = [
  "default-src 'self'",
  // Next injects inline bootstrap scripts; 'unsafe-inline' is required for them.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
  // Supabase REST + realtime websocket.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // three/drei ship untranspiled ESM; Next handles them fine but the
  // transpile hint keeps the server bundle from choking on drei subpaths.
  transpilePackages: ["three"],
  // Don't advertise the framework and version to a scanner.
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
