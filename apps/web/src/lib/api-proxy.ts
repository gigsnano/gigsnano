/** Runtime-only (server). Where the Next.js /api proxy forwards requests. */
export function apiProxyTarget(): string {
  const target = process.env.API_PROXY_TARGET?.trim();
  if (!target) {
    throw new Error(
      "API_PROXY_TARGET is not set. Set it to the backend API base URL, e.g. http://api:8000/api.",
    );
  }
  return target.replace(/\/$/, "");
}

/** FastAPI routes expect a trailing slash; normalize so upstream does not 307-loop. */
export function upstreamApiPath(pathSegments: string[]): string {
  if (!pathSegments.length) return "/";
  const suffix = `/${pathSegments.join("/")}`;
  return suffix.endsWith("/") ? suffix : `${suffix}/`;
}

/**
 * Strip Domain= so Set-Cookie binds to the frontend host (app.gigsnano.com).
 * In development, also drop Secure + relax SameSite so cookies work on http://localhost.
 */
export function rewriteSetCookie(raw: string): string {
  let cookie = raw.replace(/;\s*Domain=[^;]*/gi, "");
  if (process.env.NODE_ENV === "development") {
    cookie = cookie.replace(/;\s*Secure/gi, "");
    cookie = cookie.replace(/;\s*SameSite=[^;]*/gi, "; SameSite=Lax");
  }
  return cookie;
}

const SKIP_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "transfer-encoding",
]);

/**
 * Reverse-proxy a browser /api/* request to the Python backend.
 * Makes auth cookies first-party on the frontend origin (fixes cross-site
 * cookie blocking when the API is served from a different origin).
 */
export async function proxyApiRequest(
  request: Request,
  pathSegments: string[],
): Promise<Response> {
  try {
    const upstreamUrl = `${apiProxyTarget()}${upstreamApiPath(pathSegments)}${new URL(request.url).search}`;

    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const accept = request.headers.get("accept");
    if (accept) headers.set("accept", accept);
    // The mobile app authenticates with a bearer token instead of the cookie.
    const authorization = request.headers.get("authorization");
    if (authorization) headers.set("authorization", authorization);

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const body = hasBody ? await request.arrayBuffer() : undefined;

    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: body?.byteLength ? body : undefined,
    });

    const responseHeaders = new Headers();
    const setCookies =
      typeof upstream.headers.getSetCookie === "function"
        ? upstream.headers.getSetCookie()
        : upstream.headers.get("set-cookie")
          ? [upstream.headers.get("set-cookie")!]
          : [];
    for (const raw of setCookies) {
      responseHeaders.append("set-cookie", rewriteSetCookie(raw));
    }
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "set-cookie") return;
      if (SKIP_RESPONSE_HEADERS.has(lower)) return;
      responseHeaders.set(key, value);
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upstream proxy failed";
    return Response.json({ detail: message }, { status: 502 });
  }
}
