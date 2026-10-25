import type { NextConfig } from "next";

import { REMOTE_IMAGE_HOSTNAMES } from "./src/constants/remote-image-hosts";
import { relocatedProjectRedirects } from "./src/lib/nav/relocated-project-routes";

// Backend origin for the hosted-MCP OAuth proxy (below). API_PROXY_TARGET is
// "<origin>/api"; the OAuth/MCP/discovery routes live at the origin root.
// Rewrites bake at build time, so API_PROXY_TARGET must be set when building
// (Dockerfile build-arg). Without it, fall back to the local dev backend.
const BACKEND_ORIGIN =
  process.env.API_PROXY_TARGET?.replace(/\/api\/?$/, "").replace(/\/$/, "") ||
  "http://localhost:8020";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Keep FastAPI-style trailing slashes on /api/* — default 308 strips them before
  // the proxy route runs and breaks POST bodies on sign-in.
  skipTrailingSlashRedirect: true,
  // Serve the hosted-MCP OAuth server + resource under app.gigsnano.com so the
  // browser session cookie (first-party to this origin) is visible to /oauth/authorize.
  // Rewrites pass 302s (authorize → localhost callback) and SSE (/mcp) through untouched.
  async rewrites() {
    return [
      // Target the backend's canonical /mcp/ (the streamable-HTTP app is mounted there);
      // hitting /mcp without the slash makes Starlette 302 to the internal azure host —
      // a cross-origin redirect that strips the Authorization bearer.
      { source: "/mcp", destination: `${BACKEND_ORIGIN}/mcp/` },
      { source: "/mcp/:path*", destination: `${BACKEND_ORIGIN}/mcp/:path*` },
      { source: "/oauth/:path*", destination: `${BACKEND_ORIGIN}/oauth/:path*` },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: `${BACKEND_ORIGIN}/.well-known/oauth-authorization-server`,
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: `${BACKEND_ORIGIN}/.well-known/oauth-protected-resource`,
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: `${BACKEND_ORIGIN}/.well-known/oauth-protected-resource/:path*`,
      },
    ];
  },
  // Setup pages moved into project settings (Rail B drill-in) — keep old links alive.
  async redirects() {
    return relocatedProjectRedirects();
  },
  // Emit a self-contained server (.next/standalone) for a lean Docker image.
  output: "standalone",
  images: {
    remotePatterns: REMOTE_IMAGE_HOSTNAMES.map((hostname) => ({
      protocol: "https" as const,
      hostname,
      pathname: "/**",
    })),
  },
};

export default nextConfig;
