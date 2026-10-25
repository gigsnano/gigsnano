# Hosted MCP (OAuth 2.1 + Streamable HTTP)

GigsNano exposes a **hosted MCP server** so Claude Code, Cursor, and other
Streamable-HTTP MCP clients can work with your projects without running a local
stdio process.

Production endpoint:

```json
{
  "mcpServers": {
    "gigsnano": {
      "url": "https://mcp.gigsnano.com/mcp"
    }
  }
}
```

Local dev (API on `:8020`):

```json
{
  "mcpServers": {
    "gigsnano": {
      "url": "http://localhost:8020/mcp"
    }
  }
}
```

## How auth works

### OAuth (recommended)

1. Add the one-line config above and reload MCP in your client.
2. The client discovers OAuth metadata from
   `/.well-known/oauth-protected-resource` and registers via `POST /oauth/register`.
3. On first use, your browser opens the **consent screen** — sign in if needed,
   review scopes, and approve.
4. The client receives short-lived access tokens and refresh tokens; you do not
   paste secrets into config files.

Revoke access anytime under **Account settings → Developer tokens → Connected apps**.

### PAT fallback (scripts / non-interactive)

For CI or clients without OAuth, pass a Personal Access Token in the `Authorization`
header:

```json
{
  "mcpServers": {
    "gigsnano": {
      "url": "https://mcp.gigsnano.com/mcp",
      "headers": {
        "Authorization": "Bearer gnp_…"
      }
    }
  }
}
```

Create PATs under **Account settings → Developer tokens**.

## Tools

The hosted server exposes the same **24 tools** as the `gigsnano-mcp` stdio package:

- **Workflow** — list projects/stories, get story context, claim, complete, hand back
- **Work items** — create/update stories, comments, assignments, status
- **Docs** — list/fetch project documents and BMAD artifacts

See `packages/gigsnano-mcp/README.md` for the full tool catalog.

## Local stdio (offline dev)

The stdio package remains available when you want repo-local resolution without
hitting the hosted endpoint. See `docs/guides/claude-code-work-item-bridge.md`.

## Self-hosting the MCP endpoint

The hosted service uses `mcp.gigsnano.com` as the public API origin for OAuth
discovery and MCP. On your own deployment, set these on the API host (replace
the example origins with yours):

- `PUBLIC_BASE_URL=https://mcp.example.com`
- `FRONTEND_URL=https://app.example.com` (your Next.js origin)
- `APP_BASE_URL` — same as frontend for email links
- `CORS_ORIGINS` — include the frontend origin
- `COOKIE_SECURE=true` and `COOKIE_SAMESITE=none` when frontend and MCP are on
  different subdomains
