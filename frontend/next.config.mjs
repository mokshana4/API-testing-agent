/** @type {import('next').NextConfig} */
// The FastAPI backend has no CORS headers, so the browser talks to it through this
// same-origin proxy: /backend/* -> BACKEND_URL/*  (no backend changes needed).
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${BACKEND_URL}/:path*` }];
  },
  // LLM-assisted runs can take minutes; don't let the dev proxy time out first.
  experimental: { proxyTimeout: 10 * 60 * 1000 },
};

export default nextConfig;
