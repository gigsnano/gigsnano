/** Standard base64 -> base64url without padding (RFC 7636). */
export function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface IHandoffParams {
  challenge: string;
  state: string;
  redirectUri: string;
}

/** The web page the app opens in an auth session. `webBase` is the web origin. */
export function handoffUrl(webBase: string, { challenge, state, redirectUri }: IHandoffParams): string {
  const q = [
    ["challenge", challenge],
    ["state", state],
    ["redirect_uri", redirectUri],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `${webBase.replace(/\/+$/, "")}/mobile-auth?${q}`;
}

export type THandoffResult = { code: string } | { error: "cancelled" | "state_mismatch" | "missing_code" };

/** Reads the query string by hand: Hermes' URL support is partial. */
function queryParams(url: string): Map<string, string> {
  const out = new Map<string, string>();
  const start = url.indexOf("?");
  if (start < 0) return out;
  const query = url.slice(start + 1).split("#")[0];
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const raw = (v: string) => {
      try {
        return decodeURIComponent(v.replace(/\+/g, " "));
      } catch {
        return v;
      }
    };
    out.set(raw(eq < 0 ? pair : pair.slice(0, eq)), eq < 0 ? "" : raw(pair.slice(eq + 1)));
  }
  return out;
}

/** Validates the redirect the web page sent back: state must round-trip before the code is trusted. */
export function parseHandoffRedirect(url: string, expectedState: string): THandoffResult {
  const params = queryParams(url);
  if (params.has("error")) return { error: "cancelled" };
  if (!url || params.size === 0) return { error: "cancelled" };
  if (params.get("state") !== expectedState) return { error: "state_mismatch" };
  const code = params.get("code");
  return code ? { code } : { error: "missing_code" };
}
